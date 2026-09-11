"use client";

/* eslint-disable @typescript-eslint/no-unused-vars */

import { useMemo, useState } from "react";
import {
  Heading,
  StatCards,
  Status,
  money,
  type ExtraFeatureProps,
  type FeatureState,
} from "@/components/shared/feature-ui";

type SelectedInvoice = {
  folio: FeatureState["folios"][number];
  invoiceNumber: string;
  reservation: FeatureState["reservations"][number] | undefined;
};

export function InvoicesView({
  state,
  notify,
}: {
  state: FeatureState;
  notify: ExtraFeatureProps["notify"];
}) {
  const [selectedInvoice, setSelectedInvoice] =
    useState<SelectedInvoice | null>(null);

  const invoiceStats = useMemo(() => {
    const billedValue = state.folios.reduce(
      (sum, item) => sum + Number(item.totalPaise),
      0,
    );

    const openInvoices = state.folios.filter(
      (item) => item.status === "OPEN",
    ).length;

    return {
      invoices: state.folios.length,
      openInvoices,
      billedValue,
    };
  }, [state.folios]);

  const openInvoice = (
    folio: FeatureState["folios"][number],
    index: number,
  ) => {
    const reservation = state.reservations.find(
      (item) => item.id === folio.reservationId,
    );

    const invoiceNumber = `INV-${String(index + 1).padStart(5, "0")}`;

    setSelectedInvoice({
      folio,
      invoiceNumber,
      reservation,
    });

    notify(
      `Invoice preview opened for ${String(
        reservation?.reference ?? folio.reservationId,
      )}.`,
    );
  };

  const handlePrint = () => {
    window.print();
  };

  /**
   * Keep a stable narrowed variable for JSX.
   * This prevents TypeScript from treating selectedInvoice as possibly null
   * inside nested JSX callbacks/events.
   */
  const activeInvoice = selectedInvoice;

  return (
    <>
      <div className="invoice-page">
        <Heading
          title="Invoices"
          description="Manage guest invoices, tax details and folio billing from one place."
        />

        <StatCards
          items={[
            ["Invoices", String(invoiceStats.invoices)],
            ["Open", String(invoiceStats.openInvoices)],
            ["Billed value", money(invoiceStats.billedValue)],
          ]}
        />

        <section className="invoice-register">
          <div className="invoice-register-header">
            <div>
              <span className="section-eyebrow">FINANCE</span>

              <h2>Invoice Register</h2>

              <p>
                View generated folio invoices and their current billing
                status.
              </p>
            </div>

            <div className="invoice-count">
              {state.folios.length}{" "}
              {state.folios.length === 1 ? "invoice" : "invoices"}
            </div>
          </div>

          {state.folios.length === 0 ? (
            <div className="invoice-empty">
              <div className="empty-icon">₹</div>

              <h3>No invoices yet</h3>

              <p>
                Invoices generated from guest folios will appear here.
              </p>
            </div>
          ) : (
            <div className="invoice-table-wrapper">
              <table className="invoice-table">
                <thead>
                  <tr>
                    <th>Invoice</th>
                    <th>Booking</th>
                    <th>Status</th>
                    <th className="amount-column">Subtotal</th>
                    <th className="amount-column">Tax</th>
                    <th className="amount-column">Total</th>
                    <th className="action-column">Action</th>
                  </tr>
                </thead>

                <tbody>
                  {state.folios.map((folio, index) => {
                    const reservation = state.reservations.find(
                      (item) => item.id === folio.reservationId,
                    );

                    const invoiceNumber = `INV-${String(
                      index + 1,
                    ).padStart(5, "0")}`;

                    /**
                     * folio.id is intentionally not used here because
                     * the current folio type may not expose an id field.
                     */
                    const rowKey = `${folio.reservationId}-${index}`;

                    return (
                      <tr key={rowKey}>
                        <td>
                          <div className="invoice-id-cell">
                            <div className="invoice-document-icon">
                              <svg
                                width="18"
                                height="18"
                                viewBox="0 0 24 24"
                                fill="none"
                                xmlns="http://www.w3.org/2000/svg"
                              >
                                <path
                                  d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8L14 2Z"
                                  stroke="currentColor"
                                  strokeWidth="1.7"
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                />

                                <path
                                  d="M14 2v6h6"
                                  stroke="currentColor"
                                  strokeWidth="1.7"
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                />
                              </svg>
                            </div>

                            <div>
                              <strong>{invoiceNumber}</strong>
                              <span>Tax invoice</span>
                            </div>
                          </div>
                        </td>

                        <td>
                          <div className="booking-reference">
                            {String(
                              reservation?.reference ??
                                folio.reservationId,
                            )}
                          </div>
                        </td>

                        <td>
                          <Status value={folio.status} />
                        </td>

                        <td className="amount-cell">
                          {money(folio.subtotalPaise)}
                        </td>

                        <td className="amount-cell tax-amount">
                          {money(folio.taxPaise)}
                        </td>

                        <td className="amount-cell">
                          <strong className="total-amount">
                            {money(folio.totalPaise)}
                          </strong>
                        </td>

                        <td className="action-cell">
                          <button
                            type="button"
                            className="invoice-view-button"
                            onClick={() =>
                              openInvoice(folio, index)
                            }
                          >
                            View Invoice

                            <svg
                              width="15"
                              height="15"
                              viewBox="0 0 24 24"
                              fill="none"
                              xmlns="http://www.w3.org/2000/svg"
                            >
                              <path
                                d="m9 18 6-6-6-6"
                                stroke="currentColor"
                                strokeWidth="2"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                              />
                            </svg>
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>

      {/* =========================================================
          INVOICE PREVIEW
      ========================================================= */}

      {activeInvoice !== null && (
        <div
          className="invoice-modal-overlay"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) {
              setSelectedInvoice(null);
            }
          }}
        >
          <div className="invoice-modal">
            {/* Toolbar */}

            <div className="invoice-modal-toolbar no-print">
              <div>
                <span>Invoice Preview</span>
                <strong>{activeInvoice.invoiceNumber}</strong>
              </div>

              <div className="toolbar-actions">
                <button
                  type="button"
                  className="print-button"
                  onClick={handlePrint}
                >
                  <svg
                    width="17"
                    height="17"
                    viewBox="0 0 24 24"
                    fill="none"
                    xmlns="http://www.w3.org/2000/svg"
                  >
                    <path
                      d="M6 9V2h12v7"
                      stroke="currentColor"
                      strokeWidth="1.8"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />

                    <path
                      d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"
                      stroke="currentColor"
                      strokeWidth="1.8"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />

                    <path
                      d="M6 14h12v8H6z"
                      stroke="currentColor"
                      strokeWidth="1.8"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>

                  Print
                </button>

                <button
                  type="button"
                  className="close-button"
                  aria-label="Close invoice"
                  onClick={() => setSelectedInvoice(null)}
                >
                  ×
                </button>
              </div>
            </div>

            {/* Actual invoice */}

            <div className="invoice-document">
              <div className="invoice-top-accent" />

              {/* Header */}

              <header className="document-header">
                <div className="hotel-brand">
                  <div className="hotel-logo">
                    <span>H</span>
                  </div>

                  <div>
                    <h1>Hotel</h1>
                    <p>Hospitality & Guest Services</p>
                  </div>
                </div>

                <div className="tax-invoice-heading">
                  <span>TAX INVOICE</span>

                  <h2>{activeInvoice.invoiceNumber}</h2>
                </div>
              </header>

              <div className="document-divider" />

              {/* Guest + invoice info */}

              <section className="invoice-meta-grid">
                <div className="meta-card">
                  <span className="meta-label">
                    BILLED TO
                  </span>

                  <h3>
                    Guest
                    {activeInvoice.reservation?.reference
                      ? ` • ${activeInvoice.reservation.reference}`
                      : ""}
                  </h3>

                  <p>
                    Reservation ID

                    <strong>
                      {String(
                        activeInvoice.reservation?.reference ??
                          activeInvoice.folio.reservationId,
                      )}
                    </strong>
                  </p>
                </div>

                <div className="meta-card meta-card-right">
                  <span className="meta-label">
                    INVOICE DETAILS
                  </span>

                  <div className="meta-row">
                    <span>Invoice No.</span>

                    <strong>
                      {activeInvoice.invoiceNumber}
                    </strong>
                  </div>

                  <div className="meta-row">
                    <span>Status</span>

                    <strong>
                      {String(activeInvoice.folio.status)}
                    </strong>
                  </div>
                </div>
              </section>

              {/* Billing items */}

              <section className="invoice-line-items">
                <div className="line-items-header">
                  <span>Description</span>
                  <span>Amount</span>
                </div>

                <div className="line-item">
                  <div>
                    <strong>
                      Accommodation & Services
                    </strong>

                    <span>
                      Charges posted to primary guest folio
                    </span>
                  </div>

                  <strong>
                    {money(
                      activeInvoice.folio.subtotalPaise,
                    )}
                  </strong>
                </div>
              </section>

              {/* Bottom */}

              <section className="invoice-bottom">
                <div className="invoice-note">
                  <span className="meta-label">
                    PAYMENT NOTE
                  </span>

                  <h3>
                    Thank you for staying with us.
                  </h3>

                  <p>
                    This invoice has been generated from the
                    primary reservation folio. Please retain
                    it for your records.
                  </p>
                </div>

                {/* Summary */}

                <div className="invoice-summary">
                  <div className="summary-row">
                    <span>Subtotal</span>

                    <strong>
                      {money(
                        activeInvoice.folio.subtotalPaise,
                      )}
                    </strong>
                  </div>

                  <div className="summary-row">
                    <span>Tax</span>

                    <strong>
                      {money(
                        activeInvoice.folio.taxPaise,
                      )}
                    </strong>
                  </div>

                  <div className="summary-separator" />

                  <div className="grand-total">
                    <div>
                      <span>GRAND TOTAL</span>

                      <small>
                        Inclusive of applicable taxes
                      </small>
                    </div>

                    <strong>
                      {money(
                        activeInvoice.folio.totalPaise,
                      )}
                    </strong>
                  </div>
                </div>
              </section>

              {/* Footer */}

              <footer className="invoice-footer">
                <div>
                  <strong>
                    Computer-generated invoice
                  </strong>

                  <span>
                    No physical signature is required.
                  </span>
                </div>

                <div className="signature">
                  <div className="signature-line" />
                  <span>Authorized Signature</span>
                </div>
              </footer>
            </div>
          </div>
        </div>
      )}

      <style jsx>{`
        .invoice-page {
          display: flex;
          flex-direction: column;
          gap: 22px;
        }

        /* ===============================
           REGISTER
        =============================== */

        .invoice-register {
          overflow: hidden;
          border: 1px solid rgba(148, 163, 184, 0.18);
          border-radius: 18px;
          background: rgba(255, 255, 255, 0.95);
          box-shadow:
            0 1px 2px rgba(15, 23, 42, 0.03),
            0 12px 30px rgba(15, 23, 42, 0.04);
        }

        .invoice-register-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 24px;
          padding: 24px 26px;
          border-bottom: 1px solid #edf0f4;
        }

        .section-eyebrow {
          display: block;
          margin-bottom: 6px;
          color: #64748b;
          font-size: 10px;
          font-weight: 800;
          letter-spacing: 0.14em;
        }

        .invoice-register-header h2 {
          margin: 0;
          color: #111827;
          font-size: 20px;
          font-weight: 750;
          letter-spacing: -0.02em;
        }

        .invoice-register-header p {
          margin: 5px 0 0;
          color: #6b7280;
          font-size: 13px;
        }

        .invoice-count {
          flex: 0 0 auto;
          padding: 8px 12px;
          border: 1px solid #e5e7eb;
          border-radius: 999px;
          background: #f8fafc;
          color: #475569;
          font-size: 12px;
          font-weight: 650;
        }

        /* ===============================
           TABLE
        =============================== */

        .invoice-table-wrapper {
          width: 100%;
          overflow-x: auto;
        }

        .invoice-table {
          width: 100%;
          min-width: 850px;
          border-collapse: collapse;
        }

        .invoice-table th {
          padding: 13px 20px;
          border-bottom: 1px solid #e8edf3;
          background: #fafbfc;
          color: #7b8492;
          font-size: 10px;
          font-weight: 800;
          letter-spacing: 0.08em;
          text-align: left;
          text-transform: uppercase;
        }

        .invoice-table td {
          padding: 17px 20px;
          border-bottom: 1px solid #eef1f5;
          color: #374151;
          font-size: 13px;
          vertical-align: middle;
        }

        .invoice-table tbody tr {
          transition: background 0.18s ease;
        }

        .invoice-table tbody tr:hover {
          background: #fafbfc;
        }

        .invoice-table tbody tr:last-child td {
          border-bottom: 0;
        }

        /* ===============================
           INVOICE ID
        =============================== */

        .invoice-id-cell {
          display: flex;
          align-items: center;
          gap: 11px;
        }

        .invoice-document-icon {
          display: grid;
          width: 38px;
          height: 38px;
          flex: 0 0 38px;
          place-items: center;
          border: 1px solid #e8edf4;
          border-radius: 10px;
          background: #f8fafc;
          color: #334155;
        }

        .invoice-id-cell > div:last-child {
          display: flex;
          flex-direction: column;
          gap: 3px;
        }

        .invoice-id-cell strong {
          color: #111827;
          font-size: 13px;
          font-weight: 750;
        }

        .invoice-id-cell span {
          color: #94a3b8;
          font-size: 11px;
        }

        .booking-reference {
          color: #475569;
          font-weight: 600;
        }

        /* ===============================
           MONEY
        =============================== */

        .amount-column,
        .amount-cell {
          text-align: right !important;
        }

        .amount-cell {
          color: #475569 !important;
          font-variant-numeric: tabular-nums;
        }

        .tax-amount {
          color: #64748b !important;
        }

        .total-amount {
          color: #101828;
          font-size: 14px;
          font-weight: 800;
          font-variant-numeric: tabular-nums;
        }

        /* ===============================
           BUTTON
        =============================== */

        .action-column,
        .action-cell {
          text-align: right !important;
        }

        .invoice-view-button {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 5px;
          padding: 8px 11px;
          border: 1px solid #dfe4ea;
          border-radius: 9px;
          background: #fff;
          color: #344054;
          cursor: pointer;
          font: inherit;
          font-size: 12px;
          font-weight: 700;
          transition: all 0.18s ease;
        }

        .invoice-view-button:hover {
          border-color: #cbd5e1;
          background: #f8fafc;
          color: #111827;
          transform: translateY(-1px);
        }

        /* ===============================
           EMPTY
        =============================== */

        .invoice-empty {
          padding: 70px 20px;
          text-align: center;
        }

        .empty-icon {
          display: grid;
          width: 52px;
          height: 52px;
          margin: 0 auto 14px;
          place-items: center;
          border: 1px solid #e5e7eb;
          border-radius: 14px;
          background: #f8fafc;
          color: #64748b;
          font-size: 22px;
          font-weight: 700;
        }

        .invoice-empty h3 {
          margin: 0;
          color: #1f2937;
          font-size: 15px;
        }

        .invoice-empty p {
          margin: 6px 0 0;
          color: #94a3b8;
          font-size: 13px;
        }

        /* ===============================
           MODAL
        =============================== */

        .invoice-modal-overlay {
          position: fixed;
          z-index: 9999;
          inset: 0;
          display: flex;
          align-items: flex-start;
          justify-content: center;
          overflow-y: auto;
          padding: 32px 20px;
          background: rgba(15, 23, 42, 0.64);
          backdrop-filter: blur(8px);
        }

        .invoice-modal {
          width: min(940px, 100%);
          overflow: hidden;
          border-radius: 18px;
          background: #eef1f5;
          box-shadow: 0 30px 80px rgba(0, 0, 0, 0.25);
        }

        /* ===============================
           TOOLBAR
        =============================== */

        .invoice-modal-toolbar {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 20px;
          padding: 14px 18px;
          border-bottom: 1px solid #e1e5eb;
          background: rgba(255, 255, 255, 0.96);
        }

        .invoice-modal-toolbar > div:first-child {
          display: flex;
          flex-direction: column;
          gap: 2px;
        }

        .invoice-modal-toolbar span {
          color: #98a2b3;
          font-size: 10px;
          font-weight: 700;
          letter-spacing: 0.08em;
          text-transform: uppercase;
        }

        .invoice-modal-toolbar strong {
          color: #101828;
          font-size: 13px;
        }

        .toolbar-actions {
          display: flex;
          align-items: center;
          gap: 8px;
        }

        .print-button {
          display: inline-flex;
          align-items: center;
          gap: 7px;
          padding: 9px 13px;
          border: 1px solid #d0d5dd;
          border-radius: 9px;
          background: #fff;
          color: #344054;
          cursor: pointer;
          font: inherit;
          font-size: 12px;
          font-weight: 700;
        }

        .print-button:hover {
          background: #f8fafc;
        }

        .close-button {
          display: grid;
          width: 36px;
          height: 36px;
          place-items: center;
          border: 1px solid #d0d5dd;
          border-radius: 9px;
          background: #fff;
          color: #475467;
          cursor: pointer;
          font-size: 22px;
          line-height: 1;
        }

        /* ===============================
           DOCUMENT
        =============================== */

        .invoice-document {
          position: relative;
          width: calc(100% - 48px);
          margin: 24px;
          overflow: hidden;
          border-radius: 5px;
          background: #fff;
          box-shadow: 0 5px 24px rgba(15, 23, 42, 0.08);
        }

        .invoice-top-accent {
          height: 5px;
          background: #172033;
        }

        /* ===============================
           HEADER
        =============================== */

        .document-header {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 30px;
          padding: 42px 46px 30px;
        }

        .hotel-brand {
          display: flex;
          align-items: center;
          gap: 14px;
        }

        .hotel-logo {
          display: grid;
          width: 52px;
          height: 52px;
          place-items: center;
          border-radius: 13px;
          background: #172033;
          color: white;
          font-size: 21px;
          font-weight: 800;
        }

        .hotel-brand h1 {
          margin: 0;
          color: #101828;
          font-size: 23px;
          font-weight: 800;
          letter-spacing: -0.03em;
        }

        .hotel-brand p {
          margin: 4px 0 0;
          color: #98a2b3;
          font-size: 11px;
        }

        .tax-invoice-heading {
          text-align: right;
        }

        .tax-invoice-heading span {
          color: #98a2b3;
          font-size: 10px;
          font-weight: 800;
          letter-spacing: 0.16em;
        }

        .tax-invoice-heading h2 {
          margin: 7px 0 0;
          color: #101828;
          font-size: 19px;
          font-weight: 800;
        }

        .document-divider {
          height: 1px;
          margin: 0 46px;
          background: #e9edf2;
        }

        /* ===============================
           META
        =============================== */

        .invoice-meta-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 48px;
          padding: 30px 46px;
        }

        .meta-card {
          min-width: 0;
        }

        .meta-card-right {
          padding-left: 30px;
          border-left: 1px solid #edf0f3;
        }

        .meta-label {
          display: block;
          margin-bottom: 11px;
          color: #98a2b3;
          font-size: 9px;
          font-weight: 800;
          letter-spacing: 0.14em;
        }

        .meta-card h3 {
          margin: 0 0 9px;
          color: #1d2939;
          font-size: 14px;
          font-weight: 750;
        }

        .meta-card p {
          display: flex;
          flex-direction: column;
          gap: 3px;
          margin: 0;
          color: #98a2b3;
          font-size: 10px;
        }

        .meta-card p strong {
          color: #475467;
          font-size: 11px;
          font-weight: 600;
        }

        .meta-row {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 18px;
          padding: 5px 0;
          color: #667085;
          font-size: 11px;
        }

        .meta-row strong {
          color: #344054;
          font-weight: 700;
        }

        /* ===============================
           LINE ITEMS
        =============================== */

        .invoice-line-items {
          margin: 4px 46px 0;
          overflow: hidden;
          border: 1px solid #eaecf0;
          border-radius: 10px;
        }

        .line-items-header {
          display: grid;
          grid-template-columns: 1fr 150px;
          padding: 11px 16px;
          background: #f8fafc;
          color: #98a2b3;
          font-size: 9px;
          font-weight: 800;
          letter-spacing: 0.1em;
          text-transform: uppercase;
        }

        .line-items-header span:last-child {
          text-align: right;
        }

        .line-item {
          display: grid;
          grid-template-columns: 1fr 150px;
          align-items: center;
          gap: 20px;
          padding: 19px 16px;
        }

        .line-item > div {
          display: flex;
          flex-direction: column;
          gap: 4px;
        }

        .line-item strong {
          color: #344054;
          font-size: 12px;
          font-variant-numeric: tabular-nums;
        }

        .line-item > strong {
          text-align: right;
          font-size: 13px;
        }

        .line-item span {
          color: #98a2b3;
          font-size: 10px;
        }

        /* ===============================
           BOTTOM
        =============================== */

        .invoice-bottom {
          display: grid;
          grid-template-columns: minmax(0, 1fr) 320px;
          gap: 50px;
          padding: 36px 46px 42px;
        }

        .invoice-note {
          padding-top: 6px;
        }

        .invoice-note h3 {
          margin: 0 0 8px;
          color: #344054;
          font-size: 13px;
          font-weight: 750;
        }

        .invoice-note p {
          max-width: 360px;
          margin: 0;
          color: #98a2b3;
          font-size: 10px;
          line-height: 1.7;
        }

        /* ===============================
           SUMMARY
        =============================== */

        .invoice-summary {
          padding: 18px;
          border: 1px solid #e6e9ee;
          border-radius: 12px;
          background: #fafbfc;
        }

        .summary-row {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 16px;
          padding: 6px 0;
          color: #667085;
          font-size: 11px;
        }

        .summary-row strong {
          color: #344054;
          font-size: 12px;
          font-weight: 700;
          font-variant-numeric: tabular-nums;
        }

        .summary-separator {
          height: 1px;
          margin: 12px 0 14px;
          background: #e4e7ec;
        }

        .grand-total {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 15px;
        }

        .grand-total > div {
          display: flex;
          flex-direction: column;
          gap: 3px;
        }

        .grand-total span {
          color: #344054;
          font-size: 9px;
          font-weight: 800;
          letter-spacing: 0.08em;
        }

        .grand-total small {
          color: #98a2b3;
          font-size: 8px;
        }

        .grand-total > strong {
          color: #101828;
          font-size: 21px;
          font-weight: 850;
          letter-spacing: -0.03em;
          font-variant-numeric: tabular-nums;
        }

        /* ===============================
           FOOTER
        =============================== */

        .invoice-footer {
          display: flex;
          align-items: flex-end;
          justify-content: space-between;
          gap: 30px;
          padding: 20px 46px 30px;
          border-top: 1px solid #edf0f3;
        }

        .invoice-footer > div:first-child {
          display: flex;
          flex-direction: column;
          gap: 3px;
        }

        .invoice-footer strong {
          color: #667085;
          font-size: 9px;
          font-weight: 700;
        }

        .invoice-footer span {
          color: #b0b7c3;
          font-size: 8px;
        }

        .signature {
          width: 160px;
          text-align: center;
        }

        .signature-line {
          height: 1px;
          margin-bottom: 7px;
          background: #d0d5dd;
        }

        .signature span {
          color: #98a2b3;
          font-size: 8px;
        }

        /* ===============================
           MOBILE
        =============================== */

        @media (max-width: 720px) {
          .invoice-register-header {
            align-items: flex-start;
            flex-direction: column;
          }

          .invoice-modal-overlay {
            padding: 0;
          }

          .invoice-modal {
            min-height: 100vh;
            border-radius: 0;
          }

          .invoice-document {
            width: calc(100% - 24px);
            margin: 12px;
          }

          .document-header {
            flex-direction: column;
            padding: 28px 24px 22px;
          }

          .tax-invoice-heading {
            text-align: left;
          }

          .document-divider {
            margin: 0 24px;
          }

          .invoice-meta-grid {
            grid-template-columns: 1fr;
            gap: 25px;
            padding: 25px 24px;
          }

          .meta-card-right {
            padding-top: 22px;
            padding-left: 0;
            border-top: 1px solid #edf0f3;
            border-left: 0;
          }

          .invoice-line-items {
            margin: 0 24px;
          }

          .line-items-header,
          .line-item {
            grid-template-columns: 1fr 120px;
          }

          .invoice-bottom {
            grid-template-columns: 1fr;
            gap: 25px;
            padding: 28px 24px;
          }

          .invoice-footer {
            flex-direction: column;
            align-items: stretch;
            padding: 20px 24px 28px;
          }

          .signature {
            margin-left: auto;
          }
        }

        /* ===============================
           PRINT
        =============================== */

        @media print {
          :global(body *) {
            visibility: hidden;
          }

          .invoice-modal-overlay,
          .invoice-modal-overlay * {
            visibility: visible;
          }

          .invoice-modal-overlay {
            position: absolute;
            inset: 0;
            display: block;
            overflow: visible;
            padding: 0;
            background: #fff;
            backdrop-filter: none;
          }

          .invoice-modal {
            width: 100%;
            overflow: visible;
            border-radius: 0;
            background: #fff;
            box-shadow: none;
          }

          .no-print {
            display: none !important;
          }

          .invoice-document {
            width: 100%;
            margin: 0;
            border-radius: 0;
            box-shadow: none;
          }

          .invoice-line-items,
          .invoice-summary {
            break-inside: avoid;
          }
        }
      `}</style>
    </>
  );
}