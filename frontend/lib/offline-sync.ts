"use client";

import { apiFetch } from "@/lib/api/client";
import { enqueueOfflineMutation, getLocalOfflineReservations, getSyncableOfflineMutations, isOfflineQueueableCommand, markOfflineMutationConflict, markOfflineMutationFailed, markOfflineMutationSynced, markOfflineMutationSyncing, markOfflineReservationSyncFailed, markOfflineReservationSynced, offlineDb, resetStaleSyncingOfflineMutations, type OfflineMutation } from "@/lib/offline-db";

export function assertOfflineCommandQueueable(command: string) { if (!isOfflineQueueableCommand(command)) throw new Error("Requires an online connection."); }

export type OfflineSyncScope = { organisationId: string; propertyId: string; userId: string };
export type OfflineSyncResult = { clientMutationId: string; status: "SYNCED" | "FAILED" | "CONFLICT"; serverEntityId?: string; result?: Record<string, unknown>; error?: { code: string; message: string }; conflict?: { code: string; message: string; serverState?: unknown } };
type SendBatch = (mutations: Array<Record<string, unknown>>) => Promise<{ results: OfflineSyncResult[] }>;

let activeWorker: Promise<{ attempted: number; synced: number; failed: number; conflict: number }> | null = null;
const announceQueueUpdate = () => { if (typeof window !== "undefined") window.dispatchEvent(new Event("hotel-offline-queue-updated")); };

async function bridgeWalkIns(scope: OfflineSyncScope) {
  for (const reservation of await getLocalOfflineReservations()) {
    if (reservation.syncStatus === "SYNCED") continue;
    let clientMutationId = (reservation as typeof reservation & { clientMutationId?: string }).clientMutationId;
    if (!clientMutationId) {
      clientMutationId = crypto.randomUUID();
      await offlineDb.offlineReservations.update(reservation.id, { clientMutationId } as Partial<typeof reservation>);
    }
    await enqueueOfflineMutation({ ...scope, clientMutationId, command: "SYNC_OFFLINE_RESERVATION", entityType: "RESERVATION", entityId: reservation.id, payload: { localReference: reservation.localReference, guestName: reservation.guestName, email: reservation.email, phone: reservation.phone, city: reservation.city, dietaryRequirements: reservation.dietaryRequirements, guestCount: reservation.guestCount, roomType: reservation.roomType, arrivalDate: reservation.arrivalDate, departureDate: reservation.departureDate, mealPlan: reservation.mealPlan } });
  }
}

const defaultSender: SendBatch = async mutations => {
  const response = await apiFetch("/api/sync/mutations", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ mutations }), cache: "no-store" });
  const body = await response.json() as { results?: OfflineSyncResult[]; error?: { message?: string } };
  if (!response.ok || !body.results) throw new Error(body.error?.message ?? "Offline synchronization failed.");
  return { results: body.results };
};

export function runOfflineSync(scope: OfflineSyncScope, send: SendBatch = defaultSender) {
  if (activeWorker) return activeWorker;
  activeWorker = (async () => {
    await resetStaleSyncingOfflineMutations();
    await bridgeWalkIns(scope);
    const candidates = await getSyncableOfflineMutations(), unique = [...new Map(candidates.map(item => [item.clientMutationId, item])).values()];
    const sending: OfflineMutation[] = [];
    for (const item of unique) { const locked = await markOfflineMutationSyncing(item.id); if (locked?.status === "SYNCING") sending.push(locked); }
    if (!sending.length) return { attempted: 0, synced: 0, failed: 0, conflict: 0 };
    let response: { results: OfflineSyncResult[] };
    try { response = await send(sending.map(item => ({ clientMutationId: item.clientMutationId, propertyId: item.propertyId, command: item.command, entityType: item.entityType, entityId: item.entityId, payload: item.payload }))); }
    catch (error) { const message = error instanceof Error ? error.message : "Offline synchronization failed."; await Promise.all(sending.map(item => markOfflineMutationFailed(item.id, message))); return { attempted: sending.length, synced: 0, failed: sending.length, conflict: 0 }; }
    let synced = 0, failed = 0, conflict = 0;
    for (const item of sending) {
      const result = response.results.find(entry => entry.clientMutationId === item.clientMutationId);
      if (!result) { await markOfflineMutationFailed(item.id, "Server did not return a result for this mutation."); failed++; continue; }
      if (result.status === "SYNCED") {
        await markOfflineMutationSynced(item.id, { serverEntityId: result.serverEntityId }); synced++;
        if (item.command === "SYNC_OFFLINE_RESERVATION" && item.entityId && result.result?.reservationId && result.result?.reference) await markOfflineReservationSynced(item.entityId, { reservationId: String(result.result.reservationId), reference: String(result.result.reference) });
      } else if (result.status === "CONFLICT") { const message = result.conflict?.message ?? "This change needs review."; await markOfflineMutationConflict(item.id, message, result.conflict as Record<string, unknown>); conflict++; if (item.command === "SYNC_OFFLINE_RESERVATION" && item.entityId) await markOfflineReservationSyncFailed(item.entityId, message); }
      else { const message = result.error?.message ?? "Synchronization failed."; await markOfflineMutationFailed(item.id, message); failed++; if (item.command === "SYNC_OFFLINE_RESERVATION" && item.entityId) await markOfflineReservationSyncFailed(item.entityId, message); }
    }
    return { attempted: sending.length, synced, failed, conflict };
  })().finally(() => { activeWorker = null; announceQueueUpdate(); });
  return activeWorker;
}
