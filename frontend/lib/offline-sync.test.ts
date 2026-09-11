import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  reservations: vi.fn(), candidates: vi.fn(), enqueue: vi.fn(), reset: vi.fn(), syncing: vi.fn(), synced: vi.fn(), failed: vi.fn(), conflict: vi.fn(), reservationSynced: vi.fn(), reservationFailed: vi.fn(), reservationUpdate: vi.fn(),
}));
vi.mock("./offline-db", () => ({
  enqueueOfflineMutation: mocks.enqueue,
  getLocalOfflineReservations: mocks.reservations,
  getSyncableOfflineMutations: mocks.candidates,
  isOfflineQueueableCommand: (command: string) => ["SYNC_OFFLINE_RESERVATION", "RECORD_HOUSEKEEPING_OUTCOME"].includes(command),
  markOfflineMutationConflict: mocks.conflict,
  markOfflineMutationFailed: mocks.failed,
  markOfflineMutationSynced: mocks.synced,
  markOfflineMutationSyncing: mocks.syncing,
  markOfflineReservationSyncFailed: mocks.reservationFailed,
  markOfflineReservationSynced: mocks.reservationSynced,
  resetStaleSyncingOfflineMutations: mocks.reset,
  offlineDb: { offlineReservations: { update: mocks.reservationUpdate } },
}));
import { assertOfflineCommandQueueable, runOfflineSync } from "./offline-sync";

const scope = { organisationId: "org-a", propertyId: "property-a", userId: "user-a" };
const item = { id: "queue-a", clientMutationId: "00000000-0000-4000-8000-000000000001", ...scope, command: "RECORD_HOUSEKEEPING_OUTCOME", entityType: "HOUSEKEEPING_TASK", entityId: "task-a", payload: { expectedVersion: 1, outcome: "DONE" }, status: "PENDING", retryCount: 0, createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z" };

beforeEach(() => {
  Object.values(mocks).forEach(mock => mock.mockReset());
  mocks.reservations.mockResolvedValue([]); mocks.candidates.mockResolvedValue([item]); mocks.reset.mockResolvedValue(0); mocks.syncing.mockResolvedValue({ ...item, status: "SYNCING" });
});

describe("production offline sync worker", () => {
  it('never sends another user or property queue under the current session', async () => {
    mocks.candidates.mockResolvedValue([{...item,userId:'another-user'},{...item,propertyId:'another-property'},{...item,organisationId:'another-org'}]);
    const send=vi.fn();
    expect((await runOfflineSync(scope,send)).attempted).toBe(0);
    expect(send).not.toHaveBeenCalled();
    expect(mocks.syncing).not.toHaveBeenCalled();
  });
  it('keeps unscoped legacy walk-ins for manual review instead of adopting them', async () => {
    mocks.reservations.mockResolvedValue([{id:'legacy',syncStatus:'PENDING_SYNC'}]);
    mocks.candidates.mockResolvedValue([]);
    await runOfflineSync(scope,async()=>({results:[]}));
    expect(mocks.enqueue).not.toHaveBeenCalled();
  });
  it("marks an acknowledged item synced", async () => {
    expect(await runOfflineSync(scope, async () => ({ results: [{ clientMutationId: item.clientMutationId, status: "SYNCED", serverEntityId: "task-a" }] }))).toEqual({ attempted: 1, synced: 1, failed: 0, conflict: 0 });
    expect(mocks.synced).toHaveBeenCalledWith("queue-a", { serverEntityId: "task-a" });
  });
  it("keeps a server conflict for review", async () => {
    const result = await runOfflineSync(scope, async () => ({ results: [{ clientMutationId: item.clientMutationId, status: "CONFLICT", conflict: { code: "STALE", message: "Changed" } }] }));
    expect(result.conflict).toBe(1); expect(mocks.conflict).toHaveBeenCalledWith("queue-a", "Changed", expect.any(Object));
  });
  it("makes transport failures retryable", async () => {
    const result = await runOfflineSync(scope, async () => { throw new Error("offline"); });
    expect(result.failed).toBe(1); expect(mocks.failed).toHaveBeenCalledWith("queue-a", "offline");
  });
  it("fails an item omitted from the response", async () => {
    await runOfflineSync(scope, async () => ({ results: [] }));
    expect(mocks.failed).toHaveBeenCalledWith("queue-a", expect.stringContaining("did not return"));
  });
  it("deduplicates duplicate client IDs in one run", async () => {
    mocks.candidates.mockResolvedValue([item, { ...item, id: "queue-b" }]);
    let sent = 0;
    const send = vi.fn(async (mutations: Array<Record<string, unknown>>) => { sent = mutations.length; return { results: [{ clientMutationId: item.clientMutationId, status: "SYNCED" as const }] }; });
    expect((await runOfflineSync(scope, send)).attempted).toBe(1); expect(sent).toBe(1);
  });
  it("prevents concurrent workers", async () => {
    let release!: (value: { results: Array<{ clientMutationId: string; status: "SYNCED" }> }) => void;
    const pending = new Promise<{ results: Array<{ clientMutationId: string; status: "SYNCED" }> }>(resolve => { release = resolve; });
    const first = runOfflineSync(scope, () => pending), second = runOfflineSync(scope, () => pending);
    expect(first).toBe(second); release({ results: [{ clientMutationId: item.clientMutationId, status: "SYNCED" }] }); await first;
  });
  it("recovers stale syncing rows before selecting work", async () => {
    await runOfflineSync(scope, async () => ({ results: [{ clientMutationId: item.clientMutationId, status: "SYNCED" }] }));
    expect(mocks.reset.mock.invocationCallOrder[0]).toBeLessThan(mocks.candidates.mock.invocationCallOrder[0]);
  });
  it("bridges an existing offline walk-in with a persisted mutation ID", async () => {
    mocks.reservations.mockResolvedValue([{ id: "local-a", ...scope, createdById: scope.userId, localReference: "OFF-1", guestName: "Guest", guestCount: 1, roomType: "Deluxe", arrivalDate: "2026-10-01", departureDate: "2026-10-02", mealPlan: [], syncStatus: "PENDING_SYNC" }]);
    mocks.candidates.mockResolvedValue([]);
    await runOfflineSync(scope, async () => ({ results: [] }));
    expect(mocks.reservationUpdate).toHaveBeenCalledWith("local-a", expect.objectContaining({ clientMutationId: expect.any(String) }));
    expect(mocks.enqueue).toHaveBeenCalledWith(expect.objectContaining({ command: "SYNC_OFFLINE_RESERVATION", entityId: "local-a" }));
  });
  it("maps synced reservation identity onto the local walk-in", async () => {
    const reservationItem = { ...item, command: "SYNC_OFFLINE_RESERVATION", entityType: "RESERVATION", entityId: "local-a" };
    mocks.candidates.mockResolvedValue([reservationItem]); mocks.syncing.mockResolvedValue({ ...reservationItem, status: "SYNCING" });
    await runOfflineSync(scope, async () => ({ results: [{ clientMutationId: item.clientMutationId, status: "SYNCED", result: { reservationId: "server-a", reference: "BH-1" } }] }));
    expect(mocks.reservationSynced).toHaveBeenCalledWith("local-a", { reservationId: "server-a", reference: "BH-1" });
  });
  it("blocks unknown and high-risk commands", () => {
    expect(() => assertOfflineCommandQueueable("CAPTURE_PAYMENT")).toThrow("Requires an online connection");
  });
});
