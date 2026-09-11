"use client";
/* eslint-disable @typescript-eslint/no-unused-vars */

import {
  AlertTriangle,
  ArrowRight,
  Check,
  Download,
  Printer,
  Search,
  X,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { calculateStayNights } from "@hotel/shared/domain";
import {
  createOnlineFolioPdf,
  generateOfflineBill,
  getBillBlob,
  getCachedStay,
  getLocalOfflineBills,
  getOfflineReadiness,
  getOfflineMutationSummary,
  getOfflineMutations,
  getRecoveryIssues,
  markBillPrinted,
  searchCachedBookings,
  updateLocalBillStatus,
  type CachedBooking,
  type LocalOfflineBill,
} from "@/lib/offline-db";
import {
  AppGlyph,
  MoneyInput,
  PageHeading,
  Status,
  dateTime,
  downloadBlob,
  money,
  shortDate,
  type PlatformViewProps,
  type Row,
} from "@/app/hotel-platform";

export function DeviceStatusView({ state }: PlatformViewProps) {
  const [queue, setQueue] = useState<{ pending: number; syncing: number; failed: number; conflict: number; actionable: number } | null>(null);
  const [mutations, setMutations] = useState<Array<{ id: string; command: string; entityType: string; entityId?: string | null; status: string; createdAt: string; lastError?: string }>>([]);
  const [readiness, setReadiness] = useState<{
    checks: Record<string, boolean>;
    ready: boolean;
    lastSync?: string;
  } | null>(null);
  const [issues, setIssues] = useState<
    Array<{ id: string; operation: string; status: string; message?: string }>
  >([]);
  const loadQueue = useCallback(() => {
    void getOfflineMutationSummary().then(setQueue);
    void getOfflineMutations(["PENDING", "SYNCING", "FAILED", "CONFLICT"]).then(setMutations);
  }, []);
  useEffect(() => {
    void getOfflineReadiness().then(setReadiness);
    void getRecoveryIssues().then(setIssues);
    loadQueue();
    window.addEventListener("hotel-offline-queue-updated", loadQueue);
    return () => window.removeEventListener("hotel-offline-queue-updated", loadQueue);
  }, [loadQueue, state.property.lastSyncAt]);
  const labels: Record<string, string> = {
    deviceRegistered: "Device registered",
    serviceWorkerActive: "Application shell active",
    applicationCached: "Application cached",
    existingBookingsCached: "Existing bookings cached",
    billingTemplateCached: "Billing template cached",
    guestDataCached: "Guest data cached",
    foliosCached: "Active folios cached",
    persistentStorage: "Persistent storage granted",
  };
  return (
    <>
      <PageHeading
        eyebrow="Offline Centre / Device"
        title="Offline readiness"
        description="Readiness depends on cache, data, device and storage checks."
      />
      <section className="detail-grid">
        <article className="glass-card readiness-card">
          <div className="card-heading">
            <div>
              <p className="section-kicker">Front Desk 01</p>
              <h2>Billing continuity readiness</h2>
            </div>
            <Status
              value={
                readiness?.ready
                  ? "READY FOR BILLING CONTINUITY"
                  : "ACTION REQUIRED"
              }
            />
          </div>
          <div className="readiness-list">
            {Object.entries(readiness?.checks ?? {}).map(([key, value]) => (
              <div key={key}>
                <span className={value ? "check-ok" : "check-missing"}>
                  {value ? <Check size={14} /> : <X size={14} />}
                </span>
                <strong>{labels[key] ?? key}</strong>
                <small>{value ? "Ready" : "Missing"}</small>
              </div>
            ))}
          </div>
          <p className="power-note">
            <AlertTriangle size={16} /> Device and printer still require
            battery, UPS, inverter or generator power during an electricity
            outage.
          </p>
        </article>
        <article className="glass-card recovery-card">
          <p className="section-kicker">Recovery journal</p>
          <h2>Restart recovery</h2>
          {issues.length ? (
            issues.map((issue) => (
              <div className="recovery-issue" key={issue.id}>
                <AlertTriangle size={17} />
                <span>
                  <strong>{issue.operation}</strong>
                  <small>
                    {issue.status} ·{" "}
                    {issue.message ?? "Incomplete operation detected"}
                  </small>
                </span>
              </div>
            ))
          ) : (
            <div className="empty-state small">
              <AppGlyph name="policy" size={40} />
              <strong>No incomplete operations</strong>
              <p>Offline bill and document records are consistent.</p>
            </div>
          )}
          <div className="device-facts">
            <span>
              <small>Device</small>
              <strong>BHZ-FD01</strong>
            </span>
            <span>
              <small>Property</small>
              <strong>{state.property.name}</strong>
            </span>
            <span>
              <small>Last sync</small>
              <strong>{dateTime(readiness?.lastSync)}</strong>
            </span>
          </div>
        </article>
      </section>
      <article className="glass-card recovery-card">
        <div className="card-heading"><div><p className="section-kicker">Production sync queue</p><h2>Offline changes</h2></div><Status value={queue?.syncing ? "SYNCING" : queue?.conflict ? "NEEDS REVIEW" : queue?.failed ? "SYNC FAILED" : queue?.pending ? "PENDING" : "SYNCED"} /></div>
        <div className="device-facts">
          <span><small>Pending</small><strong>{queue?.pending ?? 0}</strong></span>
          <span><small>Syncing</small><strong>{queue?.syncing ?? 0}</strong></span>
          <span><small>Failed</small><strong>{queue?.failed ?? 0}</strong></span>
          <span><small>Needs review</small><strong>{queue?.conflict ?? 0}</strong></span>
        </div>
        {mutations.length > 0 ? <div className="readiness-list">{mutations.map(item => <div key={item.id}><span className={item.status === "CONFLICT" || item.status === "FAILED" ? "check-missing" : "check-ok"}>{item.status === "SYNCING" ? "…" : item.status === "PENDING" ? "•" : <AlertTriangle size={14} />}</span><strong>{item.command.replaceAll("_", " ")} · {item.entityType.replaceAll("_", " ")}{item.entityId ? ` ${item.entityId}` : ""}</strong><small>{item.lastError ?? `${item.status} · ${dateTime(item.createdAt)}`}</small></div>)}</div> : <div className="empty-state small"><AppGlyph name="device-status" size={40} /><strong>No pending offline changes</strong><p>This device is synchronized.</p></div>}
      </article>
    </>
  );
}
