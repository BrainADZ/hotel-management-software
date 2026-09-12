"use client";

import {
  AlertTriangle,
  Banknote,
  CheckCircle2,
  CreditCard,
  Download,
  Landmark,
  Plus,
  ReceiptText,
  RotateCcw,
  Smartphone,
  Undo2,
  X,
} from "lucide-react";
import { useMemo, useState } from "react";
import { roleCan } from "@hotel/shared/domain";
import { apiUrl } from "@/lib/api/client";
import {
  PageHeading,
  Status,
  money,
  productionApi,
  shortDate,
  type PlatformViewProps,
  type Row,
} from "@/app/hotel-platform";

type DialogState =
  | { type: "PAYMENT" }
  | { type: "DISCOUNT" }
  | { type: "CHARGE" }
  | { type: "REFUND"; payment: Row }
  | { type: "REVERSE"; payment: Row }
  | { type: "CHECKOUT" }
  | null;

type PaymentMethod = "CASH" | "UPI" | "CARD" | "BANK_TRANSFER";

const paymentMethods: Array<{
  value: PaymentMethod;
  label: string;
  description: string;
}> = [
  { value: "CASH", label: "Cash", description: "Cash received at desk" },
  { value: "UPI", label: "UPI", description: "UPI / QR payment" },
  { value: "CARD", label: "Card", description: "Credit or debit card" },
  {
    value: "BANK_TRANSFER",
    label: "Bank transfer",
    description: "NEFT / IMPS / bank",
  },
];

const chargeCategories = [
  "OTHER_SERVICE",
  "LAUNDRY",
  "MINIBAR",
  "ROOM_SERVICE",
  "RESTAURANT",
  "EXTRA_BED",
  "EARLY_CHECKIN",
  "LATE_CHECKOUT",
  "DAMAGE",
  "ADJUSTMENT",
] as const;

function paymentMethodIcon(method: PaymentMethod) {
  if (method === "CASH") return <Banknote size={18} />;
  if (method === "UPI") return <Smartphone size={18} />;
  if (method === "CARD") return <CreditCard size={18} />;
  return <Landmark size={18} />;
}

function humanize(value: unknown) {
  return String(value ?? "")
    .replaceAll("_", " ")
    .toLowerCase()
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function rupeesInput(paise: unknown) {
  const value = Number(paise ?? 0) / 100;
  if (!Number.isFinite(value) || value <= 0) return "";
  return value.toFixed(2).replace(/\.00$/, "");
}

function toPaise(value: string) {
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount <= 0) return null;
  return Math.round(amount * 100);
}

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
  const [dialog, setDialog] = useState<DialogState>(null);
  const [formError, setFormError] = useState("");

  const [paymentForm, setPaymentForm] = useState({
    method: "UPI" as PaymentMethod,
    amount: "",
    reference: "",
    notes: "",
  });

  const [discountForm, setDiscountForm] = useState({
    kind: "FIXED" as "FIXED" | "PERCENTAGE",
    value: "",
    reason: "",
  });

  const [chargeForm, setChargeForm] = useState({
    category: "OTHER_SERVICE",
    description: "",
    amount: "",
  });

  const [refundForm, setRefundForm] = useState({
    amount: "",
    reason: "",
    reference: "",
  });

  const [reverseReason, setReverseReason] = useState("");
  const [checkoutOverrideReason, setCheckoutOverrideReason] = useState("");

  const reservationMap = useMemo(
    () =>
      new Map(
        state.reservations.map((reservation) => [
          String(reservation.id),
          reservation,
        ]),
      ),
    [state.reservations],
  );

  const detail = selected?.folio as Row | undefined;
  const reservation = selected?.reservation as Row | undefined;
  const guest = selected?.guest as Row | undefined;
  const room = selected?.room as Row | undefined;
  const lines = (selected?.lines ?? []) as Row[];
  const payments = (selected?.payments ?? []) as Row[];
  const refunds = (selected?.refunds ?? []) as Row[];
  const invoices = (selected?.invoices ?? []) as Row[];

  const outstandingPaise = Number(detail?.outstandingPaise ?? 0);
  const duePaise = Math.max(0, outstandingPaise);
  const creditPaise = Math.max(0, -outstandingPaise);

  const latestReceivedPayment = useMemo(
    () =>
      [...payments]
        .reverse()
        .find((payment) => String(payment.status) === "RECEIVED"),
    [payments],
  );

  const latestInvoice = invoices.length
    ? invoices[invoices.length - 1]
    : undefined;

  async function open(folio: Row) {
    if (!productionMode) {
      const currentReservation = reservationMap.get(String(folio.reservationId));
      if (currentReservation) setSelectedReservation(currentReservation);
      return;
    }

    try {
      setBusy(true);
      const data = await productionApi(`/api/folios/${String(folio.id)}`);
      setSelected(data);
    } catch (cause) {
      notify(
        cause instanceof Error
          ? cause.message
          : "Folio could not be loaded.",
      );
    } finally {
      setBusy(false);
    }
  }

  function closeDialog() {
    if (busy) return;
    setDialog(null);
    setFormError("");
    setReverseReason("");
    setCheckoutOverrideReason("");
  }

  async function reloadSelected(folioId: string) {
    setSelected(await productionApi(`/api/folios/${folioId}`));
  }

  async function postAction(
    path: string,
    body: Row = {},
    options?: {
      success?: string;
      closeLedger?: boolean;
      keepDialog?: boolean;
    },
  ) {
    if (!selected) return false;

    const folioId = String((selected.folio as Row).id);

    try {
      setBusy(true);
      setFormError("");

      await productionApi(path, {
        method: "POST",
        body: JSON.stringify(body),
      });

      await refresh();

      if (options?.closeLedger) {
        setDialog(null);
        setSelected(null);
      } else {
        await reloadSelected(folioId);
        if (!options?.keepDialog) setDialog(null);
      }

      notify(options?.success ?? "Financial ledger updated.");
      return true;
    } catch (cause) {
      const message =
        cause instanceof Error
          ? cause.message
          : "Financial operation failed.";

      setFormError(message);
      notify(message);
      return false;
    } finally {
      setBusy(false);
    }
  }

  function openPaymentDialog() {
    setFormError("");
    setPaymentForm({
      method: "UPI",
      amount: duePaise > 0 ? rupeesInput(duePaise) : "",
      reference: "",
      notes: "",
    });
    setDialog({ type: "PAYMENT" });
  }

  function openDiscountDialog() {
    setFormError("");
    setDiscountForm({
      kind: "FIXED",
      value: "",
      reason: "",
    });
    setDialog({ type: "DISCOUNT" });
  }

  function openChargeDialog() {
    setFormError("");
    setChargeForm({
      category: "OTHER_SERVICE",
      description: "",
      amount: "",
    });
    setDialog({ type: "CHARGE" });
  }

  function openRefundDialog(payment: Row) {
    const alreadyRefunded = refunds
      .filter(
        (refund) =>
          String(refund.paymentId) === String(payment.id) &&
          String(refund.status) === "RECORDED",
      )
      .reduce((sum, refund) => sum + Number(refund.amountPaise ?? 0), 0);

    const refundable = Math.max(
      0,
      Number(payment.amountPaise ?? 0) - alreadyRefunded,
    );

    const suggested =
      creditPaise > 0
        ? Math.min(refundable, creditPaise)
        : refundable;

    setFormError("");
    setRefundForm({
      amount: rupeesInput(suggested),
      reason: "",
      reference: "",
    });
    setDialog({ type: "REFUND", payment });
  }

  function openReverseDialog(payment: Row) {
    setFormError("");
    setReverseReason("");
    setDialog({ type: "REVERSE", payment });
  }

  function openCheckoutDialog() {
    setFormError("");
    setCheckoutOverrideReason("");
    setDialog({ type: "CHECKOUT" });
  }

  async function submitPayment() {
    if (!detail) return;

    const amountPaise = toPaise(paymentForm.amount);

    if (!amountPaise) {
      setFormError("Enter a valid payment amount.");
      return;
    }

    await postAction(
      `/api/folios/${String(detail.id)}/payments`,
      {
        method: paymentForm.method,
        amountPaise,
        reference: paymentForm.reference.trim() || undefined,
        notes: paymentForm.notes.trim() || undefined,
        idempotencyKey: crypto.randomUUID(),
      },
      { success: `${humanize(paymentForm.method)} payment recorded.` },
    );
  }

  async function submitDiscount() {
    if (!detail) return;

    const value = Number(discountForm.value);

    if (!Number.isFinite(value) || value <= 0) {
      setFormError("Enter a valid discount value.");
      return;
    }

    if (discountForm.reason.trim().length < 3) {
      setFormError("Enter a short reason for the discount.");
      return;
    }

    const body: Row =
      discountForm.kind === "FIXED"
        ? {
            kind: "FIXED",
            amountPaise: Math.round(value * 100),
            reason: discountForm.reason.trim(),
            idempotencyKey: crypto.randomUUID(),
          }
        : {
            kind: "PERCENTAGE",
            percentageBps: Math.round(value * 100),
            reason: discountForm.reason.trim(),
            idempotencyKey: crypto.randomUUID(),
          };

    if (discountForm.kind === "PERCENTAGE" && value > 100) {
      setFormError("Percentage discount cannot exceed 100%.");
      return;
    }

    await postAction(
      `/api/folios/${String(detail.id)}/discounts`,
      body,
      { success: "Discount applied successfully." },
    );
  }

  async function submitCharge() {
    if (!detail) return;

    const amountPaise = toPaise(chargeForm.amount);

    if (!amountPaise) {
      setFormError("Enter a valid charge amount.");
      return;
    }

    if (chargeForm.description.trim().length < 2) {
      setFormError("Enter a description for the charge.");
      return;
    }

    await postAction(
      `/api/folios/${String(detail.id)}/charges`,
      {
        category: chargeForm.category,
        description: chargeForm.description.trim(),
        quantity: 1,
        unitAmountPaise: amountPaise,
        idempotencyKey: crypto.randomUUID(),
      },
      { success: "Charge added to the folio." },
    );
  }

  async function submitRefund(payment: Row) {
    const amountPaise = toPaise(refundForm.amount);

    if (!amountPaise) {
      setFormError("Enter a valid refund amount.");
      return;
    }

    if (refundForm.reason.trim().length < 3) {
      setFormError("Enter a reason for the refund.");
      return;
    }

    await postAction(
      `/api/payments/${String(payment.id)}/refund`,
      {
        amountPaise,
        reason: refundForm.reason.trim(),
        reference: refundForm.reference.trim() || undefined,
        idempotencyKey: crypto.randomUUID(),
      },
      { success: "Refund recorded successfully." },
    );
  }

  async function submitReverse(payment: Row) {
    if (reverseReason.trim().length < 3) {
      setFormError("Enter a reason for reversing this payment.");
      return;
    }

    await postAction(
      `/api/payments/${String(payment.id)}/reverse`,
      {
        reason: reverseReason.trim(),
        idempotencyKey: crypto.randomUUID(),
      },
      { success: "Payment reversed successfully." },
    );
  }

  async function submitCheckout() {
    if (!detail) return;

    if (duePaise > 0) {
      if (!roleCan(role, "billing.override_checkout")) {
        setFormError(
          "Checkout is blocked until the outstanding balance is settled.",
        );
        return;
      }

      if (checkoutOverrideReason.trim().length < 3) {
        setFormError("Enter a reason for checkout with an outstanding balance.");
        return;
      }

      await postAction(
        `/api/reservations/${String(detail.reservationId)}/financial-checkout`,
        {
          allowOutstanding: true,
          overrideReason: checkoutOverrideReason.trim(),
        },
        {
          success: "Guest checked out with approved balance override.",
          closeLedger: true,
        },
      );

      return;
    }

    await postAction(
      `/api/reservations/${String(detail.reservationId)}/financial-checkout`,
      { allowOutstanding: false },
      {
        success: "Checkout completed successfully.",
        closeLedger: true,
      },
    );
  }

  return (
    <>
      <PageHeading
        eyebrow="Hotel / Billing"
        title="Folios & billing"
        description="Review charges, collect payments, manage refunds and complete checkout from one clear ledger."
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
              const currentReservation = reservationMap.get(
                String(folio.reservationId),
              );

              return (
                <tr key={String(folio.id)}>
                  <td>
                    <strong>{String(folio.id).slice(0, 16)}</strong>
                    <small>Version {Number(folio.version)}</small>
                  </td>

                  <td>
                    {String(currentReservation?.guestName ?? "Restricted")}
                    <small>{String(currentReservation?.reference ?? "")}</small>
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
                      type="button"
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
        <div
          className="modal-backdrop"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget && !busy) {
              setSelected(null);
            }
          }}
        >
          <section className="modal-card financial-folio-modal">
            <header className="folio-modal-header">
              <div>
                <div className="folio-heading-line">
                  <p className="section-kicker">
                    {String(reservation?.reference ?? "Financial folio")}
                  </p>
                  <span
                    className={`folio-state-pill ${String(
                      detail.status ?? "OPEN",
                    ).toLowerCase()}`}
                  >
                    {humanize(detail.status ?? "OPEN")}
                  </span>
                </div>

                <h2>Financial folio</h2>

                <p>
                  {String(guest?.fullName ?? "Guest")}
                  <span>•</span>
                  Room {String(room?.number ?? "TBA")}
                </p>
              </div>

              <button
                type="button"
                className="folio-close-button"
                aria-label="Close financial folio"
                disabled={busy}
                onClick={() => setSelected(null)}
              >
                <X size={18} />
              </button>
            </header>

            <div className="folio-scroll-area">
              <section className="folio-summary-strip">
                <div>
                  <span>Gross</span>
                  <strong>{money(detail.subtotalPaise)}</strong>
                </div>

                <div>
                  <span>Discount</span>
                  <strong>{money(detail.discountPaise ?? 0)}</strong>
                </div>

                <div>
                  <span>Tax</span>
                  <strong>{money(detail.taxPaise ?? 0)}</strong>
                </div>

                <div>
                  <span>Paid</span>
                  <strong>{money(detail.paidPaise ?? 0)}</strong>
                </div>

                <div
                  className={
                    duePaise > 0
                      ? "attention"
                      : creditPaise > 0
                        ? "credit"
                        : "settled"
                  }
                >
                  <span>
                    {duePaise > 0
                      ? "Outstanding"
                      : creditPaise > 0
                        ? "Guest credit"
                        : "Balance"}
                  </span>

                  <strong>
                    {money(
                      duePaise > 0
                        ? duePaise
                        : creditPaise > 0
                          ? creditPaise
                          : 0,
                    )}
                  </strong>
                </div>
              </section>

              <section className="folio-section">
                <div className="folio-section-heading">
                  <div>
                    <span className="folio-section-index">01</span>
                    <div>
                      <h3>Charges</h3>
                      <p>Posted services and tax calculation for this stay.</p>
                    </div>
                  </div>

                  <span className="folio-tax-copy">
                    Taxable {money(detail.taxableAmountPaise ?? 0)}
                  </span>
                </div>

                <div className="folio-charge-table">
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
                      {lines.length ? (
                        lines.map((line) => (
                          <tr
                            key={String(line.id)}
                            className={
                              Number(line.lineTotalPaise ?? 0) < 0
                                ? "negative"
                                : undefined
                            }
                          >
                            <td>
                              {shortDate(line.serviceDate ?? line.createdAt)}
                            </td>

                            <td>
                              <strong>{String(line.description)}</strong>
                              <small>{humanize(line.category)}</small>
                            </td>

                            <td>{money(line.taxableAmountPaise ?? 0)}</td>
                            <td>{money(line.taxPaise ?? 0)}</td>
                            <td>
                              <strong>{money(line.lineTotalPaise ?? 0)}</strong>
                            </td>
                          </tr>
                        ))
                      ) : (
                        <tr>
                          <td colSpan={5}>
                            <div className="folio-empty-row">
                              No charges have been posted yet.
                            </div>
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>

                <div className="folio-tax-breakup">
                  <span>
                    CGST <strong>{money(detail.cgstPaise ?? 0)}</strong>
                  </span>
                  <span>
                    SGST <strong>{money(detail.sgstPaise ?? 0)}</strong>
                  </span>
                  <span>
                    IGST <strong>{money(detail.igstPaise ?? 0)}</strong>
                  </span>
                  <span className="folio-net-total">
                    Net charges <strong>{money(detail.totalPaise ?? 0)}</strong>
                  </span>
                </div>
              </section>

              <section className="folio-section">
                <div className="folio-section-heading">
                  <div>
                    <span className="folio-section-index">02</span>
                    <div>
                      <h3>Payment activity</h3>
                      <p>
                        Received payments, reversals, refunds and receipts.
                      </p>
                    </div>
                  </div>

                  <div className="folio-net-received">
                    <span>Net received</span>
                    <strong>{money(detail.paidPaise ?? 0)}</strong>
                  </div>
                </div>

                {creditPaise > 0 && (
                  <div className="folio-credit-banner">
                    <div>
                      <CheckCircle2 size={18} />
                      <span>
                        <strong>Guest has an advance / credit.</strong>
                        <small>
                          {money(creditPaise)} can be refunded before checkout
                          if required.
                        </small>
                      </span>
                    </div>

                    {latestReceivedPayment &&
                      roleCan(role, "billing.refund") && (
                        <button
                          type="button"
                          className="secondary-button"
                          onClick={() =>
                            openRefundDialog(latestReceivedPayment)
                          }
                        >
                          <Undo2 size={15} />
                          Refund credit
                        </button>
                      )}
                  </div>
                )}

                <div className="folio-payment-list">
                  {payments.length ? (
                    payments.map((payment) => {
                      const status = String(payment.status ?? "");
                      const isReceived = status === "RECEIVED";

                      return (
                        <article
                          key={String(payment.id)}
                          className={`folio-payment-row ${status.toLowerCase()}`}
                        >
                          <div className="folio-payment-icon">
                            {status === "REVERSED" ? (
                              <RotateCcw size={18} />
                            ) : (
                              <ReceiptText size={18} />
                            )}
                          </div>

                          <div className="folio-payment-copy">
                            <div>
                              <strong>
                                {isReceived
                                  ? "Payment received"
                                  : "Payment reversed"}
                              </strong>

                              <span
                                className={`payment-state ${status.toLowerCase()}`}
                              >
                                {humanize(status)}
                              </span>
                            </div>

                            <span>{String(payment.paymentNumber)}</span>

                            <small>
                              {humanize(payment.method)}
                              {payment.reference
                                ? ` • Ref: ${String(payment.reference)}`
                                : ""}
                              {payment.receivedAt
                                ? ` • ${shortDate(payment.receivedAt)}`
                                : ""}
                            </small>
                          </div>

                          <strong className="folio-payment-amount">
                            {money(payment.amountPaise)}
                          </strong>

                          <div className="folio-payment-actions">
                            <a
                              className="folio-action-link"
                              href={apiUrl(
                                `/api/payments/${String(payment.id)}/receipt`,
                              )}
                              target="_blank"
                              rel="noreferrer"
                            >
                              Receipt
                            </a>

                            {isReceived &&
                              roleCan(role, "billing.refund") && (
                                <button
                                  type="button"
                                  className="folio-action-link"
                                  onClick={() => openRefundDialog(payment)}
                                >
                                  Refund
                                </button>
                              )}

                            {productionMode &&
                              isReceived &&
                              roleCan(role, "billing.reverse_payment") && (
                                <button
                                  type="button"
                                  className="folio-action-link danger"
                                  onClick={() => openReverseDialog(payment)}
                                >
                                  Reverse
                                </button>
                              )}
                          </div>
                        </article>
                      );
                    })
                  ) : (
                    <div className="folio-empty-payment">
                      <ReceiptText size={20} />
                      <div>
                        <strong>No payments recorded</strong>
                        <span>
                          Add a payment when the guest settles the folio.
                        </span>
                      </div>
                    </div>
                  )}

                  {refunds.map((refund) => (
                    <article
                      key={String(refund.id)}
                      className="folio-payment-row refund"
                    >
                      <div className="folio-payment-icon">
                        <Undo2 size={18} />
                      </div>

                      <div className="folio-payment-copy">
                        <div>
                          <strong>Refund recorded</strong>
                          <span className="payment-state refunded">Refund</span>
                        </div>

                        <span>{String(refund.reason ?? "Approved refund")}</span>

                        <small>
                          {refund.reference
                            ? `Ref: ${String(refund.reference)}`
                            : "Payment refund"}
                          {refund.processedAt
                            ? ` • ${shortDate(refund.processedAt)}`
                            : ""}
                        </small>
                      </div>

                      <strong className="folio-payment-amount refund-amount">
                        -{money(refund.amountPaise)}
                      </strong>
                    </article>
                  ))}
                </div>
              </section>

              <section className="folio-section folio-settlement-section">
                <div className="folio-section-heading">
                  <div>
                    <span className="folio-section-index">03</span>
                    <div>
                      <h3>Settlement & checkout</h3>
                      <p>
                        Use these actions to finalize the guest account.
                      </p>
                    </div>
                  </div>
                </div>

                <div className="folio-settlement-grid">
                  {roleCan(role, "billing.take_payment") && (
                    <button
                      type="button"
                      className="folio-settlement-card primary"
                      disabled={busy}
                      onClick={openPaymentDialog}
                    >
                      <span className="folio-settlement-icon">
                        <CreditCard size={18} />
                      </span>

                      <span>
                        <strong>Add payment</strong>
                        <small>
                          Cash, UPI, card or bank transfer
                        </small>
                      </span>
                    </button>
                  )}

                  {roleCan(role, "billing.discount") && (
                    <button
                      type="button"
                      className="folio-settlement-card"
                      disabled={busy}
                      onClick={openDiscountDialog}
                    >
                      <span className="folio-settlement-icon">%</span>

                      <span>
                        <strong>Apply discount</strong>
                        <small>Fixed amount or percentage</small>
                      </span>
                    </button>
                  )}

                  {roleCan(role, "billing.post_charge") && (
                    <button
                      type="button"
                      className="folio-settlement-card"
                      disabled={busy}
                      onClick={openChargeDialog}
                    >
                      <span className="folio-settlement-icon">
                        <Plus size={18} />
                      </span>

                      <span>
                        <strong>Add charge</strong>
                        <small>Add an extra service or adjustment</small>
                      </span>
                    </button>
                  )}

                  <button
                    type="button"
                    className="folio-settlement-card"
                    disabled={busy}
                    onClick={() =>
                      void postAction(
                        `/api/folios/${String(detail.id)}/room-charges`,
                        {},
                        { success: "Due room charges posted." },
                      )
                    }
                  >
                    <span className="folio-settlement-icon">
                      <ReceiptText size={18} />
                    </span>

                    <span>
                      <strong>Post room charges</strong>
                      <small>Post any due room-night charges</small>
                    </span>
                  </button>
                </div>

                <div className="folio-final-actions">
                  <div>
                    {duePaise > 0 ? (
                      <>
                        <span className="folio-balance-label">
                          Outstanding balance
                        </span>
                        <strong className="folio-balance-due">
                          {money(duePaise)}
                        </strong>
                      </>
                    ) : creditPaise > 0 ? (
                      <>
                        <span className="folio-balance-label">
                          Guest credit
                        </span>
                        <strong className="folio-balance-credit">
                          {money(creditPaise)}
                        </strong>
                      </>
                    ) : (
                      <>
                        <span className="folio-balance-label">Ready</span>
                        <strong className="folio-balance-settled">
                          Fully settled
                        </strong>
                      </>
                    )}
                  </div>

                  <div className="folio-final-buttons">
                    {latestInvoice ? (
                      <a
                        className="secondary-button"
                        href={apiUrl(
                          `/api/invoices/${String(latestInvoice.id)}/pdf`,
                        )}
                        target="_blank"
                        rel="noreferrer"
                      >
                        <Download size={16} />
                        Download invoice
                      </a>
                    ) : (
                      roleCan(role, "billing.invoice") && (
                        <button
                          type="button"
                          className="secondary-button"
                          disabled={busy}
                          onClick={() =>
                            void postAction(
                              `/api/folios/${String(detail.id)}/invoice`,
                              {},
                              { success: "Tax invoice generated." },
                            )
                          }
                        >
                          <ReceiptText size={16} />
                          Generate invoice
                        </button>
                      )
                    )}

                    {roleCan(role, "billing.checkout") && (
                      <button
                        type="button"
                        className="primary-button folio-checkout-button"
                        disabled={busy}
                        onClick={openCheckoutDialog}
                      >
                        Checkout guest
                      </button>
                    )}
                  </div>
                </div>

                {invoices.length > 1 && (
                  <div className="folio-invoice-history">
                    <span>Invoice history</span>
                    <div>
                      {invoices.map((invoice) => (
                        <a
                          key={String(invoice.id)}
                          href={apiUrl(
                            `/api/invoices/${String(invoice.id)}/pdf`,
                          )}
                          target="_blank"
                          rel="noreferrer"
                        >
                          <Download size={13} />
                          {String(invoice.invoiceNumber)}
                        </a>
                      ))}
                    </div>
                  </div>
                )}
              </section>
            </div>
          </section>

          {dialog && (
            <div
              className="folio-submodal-backdrop"
              onMouseDown={(event) => {
                if (event.target === event.currentTarget) closeDialog();
              }}
            >
              <section className="folio-submodal">
                <header>
                  <div>
                    <span>
                      {dialog.type === "PAYMENT" && "SETTLEMENT"}
                      {dialog.type === "DISCOUNT" && "ADJUSTMENT"}
                      {dialog.type === "CHARGE" && "NEW CHARGE"}
                      {dialog.type === "REFUND" && "PAYMENT REFUND"}
                      {dialog.type === "REVERSE" && "PAYMENT REVERSAL"}
                      {dialog.type === "CHECKOUT" && "CHECKOUT"}
                    </span>

                    <h3>
                      {dialog.type === "PAYMENT" && "Add payment"}
                      {dialog.type === "DISCOUNT" && "Apply discount"}
                      {dialog.type === "CHARGE" && "Add charge"}
                      {dialog.type === "REFUND" && "Refund payment"}
                      {dialog.type === "REVERSE" && "Reverse payment"}
                      {dialog.type === "CHECKOUT" && "Confirm checkout"}
                    </h3>
                  </div>

                  <button
                    type="button"
                    className="folio-submodal-close"
                    disabled={busy}
                    onClick={closeDialog}
                  >
                    <X size={17} />
                  </button>
                </header>

                {formError && (
                  <div className="folio-form-error">
                    <AlertTriangle size={16} />
                    <span>{formError}</span>
                  </div>
                )}

                {dialog.type === "PAYMENT" && (
                  <div className="folio-form-body">
                    <label className="folio-field-label">
                      Payment method
                    </label>

                    <div className="folio-payment-methods">
                      {paymentMethods.map((method) => (
                        <button
                          key={method.value}
                          type="button"
                          className={
                            paymentForm.method === method.value
                              ? "selected"
                              : ""
                          }
                          onClick={() =>
                            setPaymentForm((current) => ({
                              ...current,
                              method: method.value,
                            }))
                          }
                        >
                          <span>{paymentMethodIcon(method.value)}</span>

                          <span>
                            <strong>{method.label}</strong>
                            <small>{method.description}</small>
                          </span>

                          {paymentForm.method === method.value && (
                            <CheckCircle2 size={16} />
                          )}
                        </button>
                      ))}
                    </div>

                    <label className="folio-form-field">
                      <span>Amount</span>
                      <div className="folio-money-input">
                        <span>₹</span>
                        <input
                          type="number"
                          min="0.01"
                          step="0.01"
                          inputMode="decimal"
                          value={paymentForm.amount}
                          onChange={(event) =>
                            setPaymentForm((current) => ({
                              ...current,
                              amount: event.target.value,
                            }))
                          }
                          placeholder="0.00"
                        />
                      </div>

                      {duePaise > 0 && (
                        <small>
                          Current outstanding: {money(duePaise)}
                        </small>
                      )}
                    </label>

                    {paymentForm.method !== "CASH" && (
                      <label className="folio-form-field">
                        <span>Reference / transaction ID</span>
                        <input
                          type="text"
                          value={paymentForm.reference}
                          onChange={(event) =>
                            setPaymentForm((current) => ({
                              ...current,
                              reference: event.target.value,
                            }))
                          }
                          placeholder="Optional"
                        />
                      </label>
                    )}

                    <label className="folio-form-field">
                      <span>Notes</span>
                      <textarea
                        rows={3}
                        value={paymentForm.notes}
                        onChange={(event) =>
                          setPaymentForm((current) => ({
                            ...current,
                            notes: event.target.value,
                          }))
                        }
                        placeholder="Optional payment note"
                      />
                    </label>

                    <div className="folio-form-actions">
                      <button
                        type="button"
                        className="secondary-button"
                        disabled={busy}
                        onClick={closeDialog}
                      >
                        Cancel
                      </button>

                      <button
                        type="button"
                        className="primary-button"
                        disabled={busy}
                        onClick={() => void submitPayment()}
                      >
                        {busy ? "Recording..." : "Record payment"}
                      </button>
                    </div>
                  </div>
                )}

                {dialog.type === "DISCOUNT" && (
                  <div className="folio-form-body">
                    <label className="folio-field-label">
                      Discount type
                    </label>

                    <div className="folio-segmented-control">
                      <button
                        type="button"
                        className={
                          discountForm.kind === "FIXED" ? "selected" : ""
                        }
                        onClick={() =>
                          setDiscountForm((current) => ({
                            ...current,
                            kind: "FIXED",
                            value: "",
                          }))
                        }
                      >
                        Fixed amount
                      </button>

                      <button
                        type="button"
                        className={
                          discountForm.kind === "PERCENTAGE"
                            ? "selected"
                            : ""
                        }
                        onClick={() =>
                          setDiscountForm((current) => ({
                            ...current,
                            kind: "PERCENTAGE",
                            value: "",
                          }))
                        }
                      >
                        Percentage
                      </button>
                    </div>

                    <label className="folio-form-field">
                      <span>
                        {discountForm.kind === "FIXED"
                          ? "Discount amount"
                          : "Discount percentage"}
                      </span>

                      <div className="folio-money-input">
                        <span>
                          {discountForm.kind === "FIXED" ? "₹" : "%"}
                        </span>

                        <input
                          type="number"
                          min="0.01"
                          max={
                            discountForm.kind === "PERCENTAGE"
                              ? "100"
                              : undefined
                          }
                          step="0.01"
                          value={discountForm.value}
                          onChange={(event) =>
                            setDiscountForm((current) => ({
                              ...current,
                              value: event.target.value,
                            }))
                          }
                          placeholder="0"
                        />
                      </div>
                    </label>

                    <label className="folio-form-field">
                      <span>Reason</span>
                      <textarea
                        rows={3}
                        value={discountForm.reason}
                        onChange={(event) =>
                          setDiscountForm((current) => ({
                            ...current,
                            reason: event.target.value,
                          }))
                        }
                        placeholder="Example: Manager-approved service recovery"
                      />
                    </label>

                    <div className="folio-form-actions">
                      <button
                        type="button"
                        className="secondary-button"
                        disabled={busy}
                        onClick={closeDialog}
                      >
                        Cancel
                      </button>

                      <button
                        type="button"
                        className="primary-button"
                        disabled={busy}
                        onClick={() => void submitDiscount()}
                      >
                        {busy ? "Applying..." : "Apply discount"}
                      </button>
                    </div>
                  </div>
                )}

                {dialog.type === "CHARGE" && (
                  <div className="folio-form-body">
                    <label className="folio-form-field">
                      <span>Charge category</span>
                      <select
                        value={chargeForm.category}
                        onChange={(event) =>
                          setChargeForm((current) => ({
                            ...current,
                            category: event.target.value,
                          }))
                        }
                      >
                        {chargeCategories.map((category) => (
                          <option key={category} value={category}>
                            {humanize(category)}
                          </option>
                        ))}
                      </select>
                    </label>

                    <label className="folio-form-field">
                      <span>Description</span>
                      <input
                        type="text"
                        value={chargeForm.description}
                        onChange={(event) =>
                          setChargeForm((current) => ({
                            ...current,
                            description: event.target.value,
                          }))
                        }
                        placeholder="Example: Airport pickup"
                      />
                    </label>

                    <label className="folio-form-field">
                      <span>Amount</span>
                      <div className="folio-money-input">
                        <span>₹</span>
                        <input
                          type="number"
                          min="0.01"
                          step="0.01"
                          value={chargeForm.amount}
                          onChange={(event) =>
                            setChargeForm((current) => ({
                              ...current,
                              amount: event.target.value,
                            }))
                          }
                          placeholder="0.00"
                        />
                      </div>
                    </label>

                    <div className="folio-form-actions">
                      <button
                        type="button"
                        className="secondary-button"
                        disabled={busy}
                        onClick={closeDialog}
                      >
                        Cancel
                      </button>

                      <button
                        type="button"
                        className="primary-button"
                        disabled={busy}
                        onClick={() => void submitCharge()}
                      >
                        {busy ? "Adding..." : "Add charge"}
                      </button>
                    </div>
                  </div>
                )}

                {dialog.type === "REFUND" && (
                  <div className="folio-form-body">
                    <div className="folio-operation-summary">
                      <span>
                        <small>Receipt</small>
                        <strong>
                          {String(dialog.payment.paymentNumber ?? "Payment")}
                        </strong>
                      </span>

                      <span>
                        <small>Method</small>
                        <strong>{humanize(dialog.payment.method)}</strong>
                      </span>

                      <span>
                        <small>Payment</small>
                        <strong>{money(dialog.payment.amountPaise)}</strong>
                      </span>
                    </div>

                    <label className="folio-form-field">
                      <span>Refund amount</span>
                      <div className="folio-money-input">
                        <span>₹</span>
                        <input
                          type="number"
                          min="0.01"
                          step="0.01"
                          value={refundForm.amount}
                          onChange={(event) =>
                            setRefundForm((current) => ({
                              ...current,
                              amount: event.target.value,
                            }))
                          }
                        />
                      </div>
                    </label>

                    <label className="folio-form-field">
                      <span>Reason</span>
                      <textarea
                        rows={3}
                        value={refundForm.reason}
                        onChange={(event) =>
                          setRefundForm((current) => ({
                            ...current,
                            reason: event.target.value,
                          }))
                        }
                        placeholder="Why is this refund being issued?"
                      />
                    </label>

                    <label className="folio-form-field">
                      <span>Refund reference</span>
                      <input
                        type="text"
                        value={refundForm.reference}
                        onChange={(event) =>
                          setRefundForm((current) => ({
                            ...current,
                            reference: event.target.value,
                          }))
                        }
                        placeholder="Optional transaction / bank reference"
                      />
                    </label>

                    <div className="folio-form-actions">
                      <button
                        type="button"
                        className="secondary-button"
                        disabled={busy}
                        onClick={closeDialog}
                      >
                        Cancel
                      </button>

                      <button
                        type="button"
                        className="primary-button"
                        disabled={busy}
                        onClick={() => void submitRefund(dialog.payment)}
                      >
                        {busy ? "Refunding..." : "Record refund"}
                      </button>
                    </div>
                  </div>
                )}

                {dialog.type === "REVERSE" && (
                  <div className="folio-form-body">
                    <div className="folio-warning-panel">
                      <AlertTriangle size={18} />
                      <div>
                        <strong>Reverse this payment?</strong>
                        <span>
                          This removes the payment from the folio balance. Use
                          refund instead when money is being returned to the
                          guest.
                        </span>
                      </div>
                    </div>

                    <div className="folio-operation-summary">
                      <span>
                        <small>Receipt</small>
                        <strong>
                          {String(dialog.payment.paymentNumber ?? "Payment")}
                        </strong>
                      </span>

                      <span>
                        <small>Method</small>
                        <strong>{humanize(dialog.payment.method)}</strong>
                      </span>

                      <span>
                        <small>Amount</small>
                        <strong>{money(dialog.payment.amountPaise)}</strong>
                      </span>
                    </div>

                    <label className="folio-form-field">
                      <span>Reason for reversal</span>
                      <textarea
                        rows={3}
                        value={reverseReason}
                        onChange={(event) =>
                          setReverseReason(event.target.value)
                        }
                        placeholder="Example: Duplicate payment entry"
                      />
                    </label>

                    <div className="folio-form-actions">
                      <button
                        type="button"
                        className="secondary-button"
                        disabled={busy}
                        onClick={closeDialog}
                      >
                        Cancel
                      </button>

                      <button
                        type="button"
                        className="folio-danger-button"
                        disabled={busy}
                        onClick={() => void submitReverse(dialog.payment)}
                      >
                        {busy ? "Reversing..." : "Reverse payment"}
                      </button>
                    </div>
                  </div>
                )}

                {dialog.type === "CHECKOUT" && (
                  <div className="folio-form-body">
                    <div className="folio-checkout-summary">
                      <div>
                        <span>Net charges</span>
                        <strong>{money(detail.totalPaise ?? 0)}</strong>
                      </div>

                      <div>
                        <span>Paid</span>
                        <strong>{money(detail.paidPaise ?? 0)}</strong>
                      </div>

                      <div
                        className={
                          duePaise > 0
                            ? "due"
                            : creditPaise > 0
                              ? "credit"
                              : "settled"
                        }
                      >
                        <span>
                          {duePaise > 0
                            ? "Outstanding"
                            : creditPaise > 0
                              ? "Guest credit"
                              : "Balance"}
                        </span>

                        <strong>
                          {money(
                            duePaise > 0
                              ? duePaise
                              : creditPaise > 0
                                ? creditPaise
                                : 0,
                          )}
                        </strong>
                      </div>
                    </div>

                    {duePaise === 0 && creditPaise === 0 && (
                      <div className="folio-success-panel">
                        <CheckCircle2 size={18} />
                        <div>
                          <strong>Folio is fully settled.</strong>
                          <span>
                            Checkout will close the folio and release the room
                            for housekeeping.
                          </span>
                        </div>
                      </div>
                    )}

                    {creditPaise > 0 && (
                      <div className="folio-warning-panel credit">
                        <AlertTriangle size={18} />
                        <div>
                          <strong>
                            Guest has {money(creditPaise)} credit.
                          </strong>
                          <span>
                            Refund the advance first if the amount should be
                            returned. Checkout can still be completed.
                          </span>
                        </div>
                      </div>
                    )}

                    {duePaise > 0 && (
                      <>
                        <div className="folio-warning-panel">
                          <AlertTriangle size={18} />
                          <div>
                            <strong>
                              {money(duePaise)} is still outstanding.
                            </strong>
                            <span>
                              Standard checkout is blocked until the balance is
                              paid.
                            </span>
                          </div>
                        </div>

                        {roleCan(role, "billing.override_checkout") ? (
                          <label className="folio-form-field">
                            <span>Override reason</span>
                            <textarea
                              rows={3}
                              value={checkoutOverrideReason}
                              onChange={(event) =>
                                setCheckoutOverrideReason(event.target.value)
                              }
                              placeholder="Why is checkout allowed with an unpaid balance?"
                            />
                            <small>
                              This action is audited as an unpaid checkout
                              override.
                            </small>
                          </label>
                        ) : (
                          <div className="folio-checkout-blocked">
                            You do not have permission to override an unpaid
                            checkout. Record payment first.
                          </div>
                        )}
                      </>
                    )}

                    <div className="folio-form-actions">
                      <button
                        type="button"
                        className="secondary-button"
                        disabled={busy}
                        onClick={closeDialog}
                      >
                        Cancel
                      </button>

                      {creditPaise > 0 &&
                        latestReceivedPayment &&
                        roleCan(role, "billing.refund") && (
                          <button
                            type="button"
                            className="secondary-button"
                            disabled={busy}
                            onClick={() =>
                              openRefundDialog(latestReceivedPayment)
                            }
                          >
                            Refund credit
                          </button>
                        )}

                      <button
                        type="button"
                        className="primary-button"
                        disabled={
                          busy ||
                          (duePaise > 0 &&
                            !roleCan(role, "billing.override_checkout"))
                        }
                        onClick={() => void submitCheckout()}
                      >
                        {busy
                          ? "Checking out..."
                          : duePaise > 0
                            ? "Checkout with override"
                            : "Complete checkout"}
                      </button>
                    </div>
                  </div>
                )}
              </section>
            </div>
          )}
        </div>
      )}
    </>
  );
}
