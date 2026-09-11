"use client";
/* eslint-disable @typescript-eslint/no-unused-vars */
import { ArrowRight, CalendarDays, Check, Download, Plus, X } from "lucide-react";
import { useEffect, useState } from "react";
import { roleCan } from "@hotel/shared/domain";
import { apiUrl } from "@/lib/api/client";
import type { MealService } from "@/lib/offline-db";
import { ProductionFrontDesk, ProductionGuests } from "@/app/production-front-desk";
import { DamageReviewPanel, HousekeepingOverviewView } from "@/components/hotel/HousekeepingView";
import { AppGlyph, AvailabilityGrid, InspectionStatusBadge, Kpi, Metric, MiniModule, PageHeading, ReservationCompact, SandboxBadge, Status, dateTime, downloadBlob, money, mealLabel, mealOptions, productionApi, shortDate, type PlatformViewProps, type Row } from "@/app/hotel-platform";
export function FoliosBillingView({
  state,
  setSelectedReservation,
  productionMode,
  role,
  refresh,
  notify,
}: PlatformViewProps) {
  const [selected, setSelected] = useState<Row | null>(null);
  const [busy, setBusy] = useState(false);
  const reservationMap = new Map(
    state.reservations.map((reservation) => [
      String(reservation.id),
      reservation,
    ]),
  );
  async function open(folio: Row) {
    if (!productionMode) {
      const reservation = reservationMap.get(String(folio.reservationId));
      if (reservation) setSelectedReservation(reservation);
      return;
    }
    try {
      setBusy(true);
      setSelected(await productionApi(`/api/folios/${String(folio.id)}`));
    } catch (cause) {
      notify(
        cause instanceof Error ? cause.message : "Folio could not be loaded.",
      );
    } finally {
      setBusy(false);
    }
  }
  async function action(path: string, body: Row = {}) {
    if (!selected) return;
    try {
      setBusy(true);
      await productionApi(path, { method: "POST", body: JSON.stringify(body) });
      setSelected(
        await productionApi(
          `/api/folios/${String((selected.folio as Row).id)}`,
        ),
      );
      await refresh();
      notify("Financial ledger updated.");
    } catch (cause) {
      notify(
        cause instanceof Error ? cause.message : "Financial operation failed.",
      );
    } finally {
      setBusy(false);
    }
  }
  const detail = selected?.folio as Row | undefined;
  const lines = (selected?.lines ?? []) as Row[];
  const payments = (selected?.payments ?? []) as Row[];
  const refunds = (selected?.refunds ?? []) as Row[];
  const invoices = (selected?.invoices ?? []) as Row[];
  return (
    <>
      <PageHeading
        eyebrow="Hotel / Billing"
        title="Folios & billing"
        description="Backend-calculated charges, GST, payments, refunds, invoices and outstanding balances."
      />
      <div className="table-card">
        <table>
          <thead>
            <tr>
              <th>Folio</th>
              <th>Guest / booking</th>
              <th>Gross</th>
              <th>Discount</th>
              <th>Tax</th>
              <th>Paid</th>
              <th>Outstanding</th>
              <th>Status</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {state.folios.map((folio) => {
              const reservation = reservationMap.get(
                String(folio.reservationId),
              );
              return (
                <tr key={String(folio.id)}>
                  <td>
                    <strong>{String(folio.id).slice(0, 16)}</strong>
                    <small>Version {Number(folio.version)}</small>
                  </td>
                  <td>
                    {String(reservation?.guestName ?? "Restricted")}
                    <small>{String(reservation?.reference ?? "")}</small>
                  </td>
                  <td>{money(folio.subtotalPaise)}</td>
                  <td>{money(folio.discountPaise ?? 0)}</td>
                  <td>{money(folio.taxPaise)}</td>
                  <td>{money(folio.paidPaise ?? 0)}</td>
                  <td>
                    <strong>
                      {money(folio.outstandingPaise ?? folio.totalPaise)}
                    </strong>
                  </td>
                  <td>
                    <Status value={String(folio.status)} />
                  </td>
                  <td>
                    <button
                      className="row-action"
                      disabled={busy}
                      onClick={() => void open(folio)}
                    >
                      Open ledger
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {detail && (
        <div className="modal-backdrop">
          <section className="modal-card reservation-modal">
            <div className="modal-heading">
              <div>
                <p className="section-kicker">
                  {String((selected?.reservation as Row)?.reference ?? "Folio")}
                </p>
                <h2>Financial folio</h2>
                <p>
                  {String((selected?.guest as Row)?.fullName ?? "Guest")} · Room{" "}
                  {String((selected?.room as Row)?.number ?? "TBA")}
                </p>
              </div>
              <button className="icon-button" onClick={() => setSelected(null)}>
                <X size={17} />
              </button>
            </div>
            <div className="table-card embedded-table">
              <table>
                <thead>
                  <tr>
                    <th>Posted</th>
                    <th>Charge</th>
                    <th>Taxable</th>
                    <th>GST</th>
                    <th>Total</th>
                  </tr>
                </thead>
                <tbody>
                  {lines.map((line) => (
                    <tr key={String(line.id)}>
                      <td>{shortDate(line.serviceDate ?? line.createdAt)}</td>
                      <td>
                        {String(line.description)}
                        <small>
                          {String(line.category).replaceAll("_", " ")}
                        </small>
                      </td>
                      <td>{money(line.taxableAmountPaise)}</td>
                      <td>{money(line.taxPaise)}</td>
                      <td>{money(line.lineTotalPaise)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="bill-total">
              <span>
                <small>Gross charges</small>
                <strong>{money(detail.subtotalPaise)}</strong>
              </span>
              <span>
                <small>Discount</small>
                <strong>{money(detail.discountPaise)}</strong>
              </span>
              <span>
                <small>Taxable</small>
                <strong>{money(detail.taxableAmountPaise)}</strong>
              </span>
              <span>
                <small>CGST / SGST / IGST</small>
                <strong>
                  {money(detail.cgstPaise)} / {money(detail.sgstPaise)} /{" "}
                  {money(detail.igstPaise)}
                </strong>
              </span>
              <span>
                <small>Net charges</small>
                <strong>{money(detail.totalPaise)}</strong>
              </span>
              <span>
                <small>Outstanding</small>
                <strong>{money(detail.outstandingPaise)}</strong>
              </span>
            </div>
            <section className="drawer-folio">
              <div className="card-heading">
                <h3>Payments & refunds</h3>
                <strong>{money(detail.paidPaise)}</strong>
              </div>
              {payments.map((payment) => (
                <div key={String(payment.id)}>
                  <span>
                    {String(payment.paymentNumber)} · {String(payment.method)} ·{" "}
                    {String(payment.status)}
                  </span>
                  <strong>{money(payment.amountPaise)}</strong>
                  {productionMode &&
                    payment.status === "RECEIVED" &&
                    roleCan(role, "billing.reverse_payment") && (
                      <button
                        className="row-action"
                        onClick={() =>
                          void action(
                            `/api/payments/${String(payment.id)}/reverse`,
                            {
                              reason:
                                "Correction approved in billing workspace",
                            },
                          )
                        }
                      >
                        Reverse
                      </button>
                    )}
                  {payment.status === "RECEIVED" &&
                    roleCan(role, "billing.refund") && (
                      <button
                        className="row-action"
                        onClick={() => {
                          const amount = Number(
                            window.prompt("Refund amount in rupees", "100"),
                          );
                          const reason = window.prompt(
                            "Refund reason",
                            "Approved refund",
                          );
                          if (amount > 0 && reason)
                            void action(
                              `/api/payments/${String(payment.id)}/refund`,
                              {
                                amountPaise: Math.round(amount * 100),
                                reason,
                                idempotencyKey: crypto.randomUUID(),
                              },
                            );
                        }}
                      >
                        Refund
                      </button>
                    )}
                  <a
                    className="row-action"
                    href={apiUrl(`/api/payments/${String(payment.id)}/receipt`)}
                    target="_blank"
                  >
                    Receipt
                  </a>
                </div>
              ))}
              {refunds.map((refund) => (
                <div key={String(refund.id)}>
                  <span>Refund · {String(refund.reason)}</span>
                  <strong>{money(refund.amountPaise)}</strong>
                </div>
              ))}
            </section>
            <div className="drawer-actions">
              <button
                className="secondary-button"
                disabled={busy}
                onClick={() =>
                  void action(`/api/folios/${String(detail.id)}/room-charges`)
                }
              >
                Post due room charges
              </button>
              {roleCan(role, "billing.post_charge") && (
                <button
                  className="secondary-button"
                  disabled={busy}
                  onClick={() => {
                    const amount = Number(
                      window.prompt("Charge amount in rupees", "500"),
                    );
                    if (amount > 0)
                      void action(`/api/folios/${String(detail.id)}/charges`, {
                        category: "OTHER_SERVICE",
                        description: "Other service",
                        quantity: 1,
                        unitAmountPaise: Math.round(amount * 100),
                        idempotencyKey: crypto.randomUUID(),
                      });
                  }}
                >
                  Add charge
                </button>
              )}
              {roleCan(role, "billing.take_payment") && (
                <button
                  className="primary-button"
                  disabled={busy}
                  onClick={() => {
                    const amount = Number(
                      window.prompt(
                        "Payment amount in rupees",
                        String(Number(detail.outstandingPaise) / 100),
                      ),
                    );
                    if (amount > 0)
                      void action(`/api/folios/${String(detail.id)}/payments`, {
                        method: "UPI",
                        amountPaise: Math.round(amount * 100),
                        idempotencyKey: crypto.randomUUID(),
                      });
                  }}
                >
                  Add payment
                </button>
              )}
              {roleCan(role, "billing.discount") && (
                <button
                  className="secondary-button"
                  disabled={busy}
                  onClick={() => {
                    const amount = Number(
                      window.prompt("Fixed discount in rupees", "500"),
                    );
                    const reason = window.prompt(
                      "Discount reason",
                      "Manager-approved service recovery",
                    );
                    if (amount > 0 && reason)
                      void action(
                        `/api/folios/${String(detail.id)}/discounts`,
                        {
                          kind: "FIXED",
                          amountPaise: Math.round(amount * 100),
                          reason,
                          idempotencyKey: crypto.randomUUID(),
                        },
                      );
                  }}
                >
                  Apply discount
                </button>
              )}
              {roleCan(role, "billing.invoice") && (
                <button
                  className="primary-button"
                  disabled={busy}
                  onClick={() =>
                    void action(`/api/folios/${String(detail.id)}/invoice`)
                  }
                >
                  Generate invoice
                </button>
              )}
              {roleCan(role, "billing.checkout") && (
                <button
                  className="primary-button"
                  disabled={busy}
                  onClick={() =>
                    void action(
                      `/api/reservations/${String(detail.reservationId)}/financial-checkout`,
                    )
                  }
                >
                  Checkout
                </button>
              )}
              {roleCan(role, "billing.override_checkout") &&
                Number(detail.outstandingPaise) > 0 && (
                  <button
                    className="secondary-button"
                    disabled={busy}
                    onClick={() => {
                      const reason = window.prompt(
                        "Reason for unpaid checkout override",
                      );
                      if (reason)
                        void action(
                          `/api/reservations/${String(detail.reservationId)}/financial-checkout`,
                          { allowOutstanding: true, overrideReason: reason },
                        );
                    }}
                  >
                    Override unpaid checkout
                  </button>
                )}
            </div>
            {invoices.map((invoice) => (
              <a
                key={String(invoice.id)}
                className="primary-button full-button"
                href={apiUrl(`/api/invoices/${String(invoice.id)}/pdf`)}
                target="_blank"
              >
                <Download size={16} /> Download {String(invoice.invoiceNumber)}
              </a>
            ))}
          </section>
        </div>
      )}
    </>
  );
}
