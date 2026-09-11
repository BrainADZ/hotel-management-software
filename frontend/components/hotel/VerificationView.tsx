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

export function VerificationView({
  state,
  role,
  command,
  refresh,
  notify,
}: PlatformViewProps) {
  const [localBills, setLocalBills] = useState<LocalOfflineBill[]>([]);
  useEffect(() => {
    void getLocalOfflineBills().then(setLocalBills);
  }, [state.offlineBills]);
  async function manualUpdate(bill: LocalOfflineBill) {
    try {
      const result = await command({
        action: "MANUAL_MASTER_UPDATE",
        bookingReference: bill.bookingReference,
        amountPaise: bill.totalPaise,
      });
      await refresh();
      notify(
        result.createdFinancialLine
          ? "Master Hub folio adjusted manually and audited."
          : "Matching Master Hub record already exists; no duplicate line created.",
      );
    } catch (cause) {
      notify(
        cause instanceof Error ? cause.message : "Master Hub update failed.",
      );
    }
  }
  async function verify(bill: Row) {
    try {
      await command({ action: "VERIFY_OFFLINE_BILL", offlineBillId: bill.id });
      await updateLocalBillStatus(String(bill.id), "VERIFIED");
      await refresh();
      setLocalBills(await getLocalOfflineBills());
      notify("Offline document linked and verified.");
    } catch (cause) {
      notify(cause instanceof Error ? cause.message : "Verification failed.");
    }
  }
  const canVerify =
    role === "MANAGER" || role === "ACCOUNTS" || role === "OWNER";
  return (
    <>
      <PageHeading
        eyebrow="Offline Centre / Reconciliation"
        title="Offline billing verification"
        description="Review local billing records after the property reconnects."
      />
      <section className="verification-stack">
        {localBills.length === 0 && state.offlineBills.length === 0 ? (
          <div className="empty-state glass-card">
            <AppGlyph name="policy" size={42} />
            <strong>No offline bills awaiting review</strong>
            <p>
              Generate a bill from the offline property terminal to begin the
              controlled workflow.
            </p>
          </div>
        ) : (
          localBills.map((local) => {
            const cloud = state.offlineBills.find(
              (bill) => bill.id === local.id,
            );
            const status = String(cloud?.status ?? local.status);
            return (
              <article className="glass-card verification-card" key={local.id}>
                <div className="verification-main">
                  <div>
                    <p className="section-kicker">Offline bill</p>
                    <h2>{local.offlineReference}</h2>
                    <span>
                      {local.guestName} · {local.bookingReference} · Room{" "}
                      {local.roomNumber}
                    </span>
                  </div>
                  <Status value={status} />
                </div>
                <div className="compare-grid">
                  <div>
                    <small>Offline amount</small>
                    <strong>{money(local.totalPaise)}</strong>
                  </div>
                  <div>
                    <small>Master Hub amount</small>
                    <strong>
                      {cloud?.cloudAmountPaise != null
                        ? money(cloud.cloudAmountPaise)
                        : "Not downloaded"}
                    </strong>
                  </div>
                </div>
                <div className="verification-actions">
                  {!cloud && (
                    <span className="review-copy">
                      Pending reconnect and reference upload.
                    </span>
                  )}
                  {cloud && status === "MASTER_RECORD_NOT_FOUND" && (
                    <button
                      className="secondary-button"
                      onClick={() => manualUpdate(local)}
                    >
                      Record manual Master Hub update
                    </button>
                  )}
                  {cloud && status === "MATCHED" && canVerify && (
                    <button
                      className="primary-button"
                      onClick={() => verify(cloud)}
                    >
                      <AppGlyph name="policy" size={21} /> Verify & link
                    </button>
                  )}
                  {status === "VERIFIED" && (
                    <span className="verified-copy">
                      <Check size={15} /> Verified
                    </span>
                  )}
                </div>
              </article>
            );
          })
        )}
      </section>
    </>
  );
}
