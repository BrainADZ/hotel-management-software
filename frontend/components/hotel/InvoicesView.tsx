"use client";

import { useMemo } from "react";
import type { PlatformViewProps } from "@/app/hotel-platform";
import {
  Heading,
  StatCards,
  Status,
  money,
} from "@/components/shared/feature-ui";
import { apiFetch } from "@/lib/api/client";

type Row = Record<string, unknown>;

export function InvoicesView({
  state,
  notify,
}: PlatformViewProps) {
  const invoices = useMemo(
    () => (state.operationalData?.invoices as Row[] | undefined) ?? [],
    [state.operationalData?.invoices],
  );

  const stats = useMemo(() => {
    const totalValue = invoices.reduce(
      (sum, invoice) =>
        sum + Number(invoice.grandTotalPaise ?? 0),
      0,
    );

    const issued = invoices.filter(
      (invoice) =>
        String(invoice.status ?? "").toUpperCase() === "ISSUED",
    ).length;

    return {
      count: invoices.length,
      issued,
      totalValue,
    };
  }, [invoices]);

  async function downloadInvoice(invoice: Row) {
    try {
      const invoiceId = String(invoice.id);

      const response = await apiFetch(
        `/api/invoices/${encodeURIComponent(invoiceId)}/pdf`,
      );

      if (!response.ok) {
        throw new Error("Invoice PDF could not be loaded.");
      }

      const blob = await response.blob();

      const url = URL.createObjectURL(blob);

      const link = document.createElement("a");

      link.href = url;

      link.download = `Invoice-${String(
        invoice.invoiceNumber,
      ).replaceAll("/", "-")}.pdf`;

      document.body.appendChild(link);

      link.click();

      link.remove();

      setTimeout(() => {
        URL.revokeObjectURL(url);
      }, 1000);
    } catch (cause) {
      notify(
        cause instanceof Error
          ? cause.message
          : "Invoice download failed.",
      );
    }
  }

  return (
    <>
      <Heading
        title="Issued Invoices"
        description="View and download GST tax invoices issued from guest folios."
      />

      <StatCards
        items={[
          ["Invoices", String(stats.count)],
          ["Issued", String(stats.issued)],
          ["Invoice Value", money(stats.totalValue)],
        ]}
      />

      <article className="glass-card">
        {invoices.length > 0 ? (
          <div className="table-card">
            <table>
              <thead>
                <tr>
                  <th>Invoice</th>
                  <th>Customer</th>
                  <th>Date</th>
                  <th>Total</th>
                  <th>Status</th>
                  <th>Document</th>
                </tr>
              </thead>

              <tbody>
                {invoices.map((invoice, index) => {
                  const key = String(
                    invoice.id ??
                      invoice.invoiceNumber ??
                      index,
                  );

                  return (
                    <tr key={key}>
                      <td>
                        <strong>
                          {String(
                            invoice.invoiceNumber ?? "—",
                          )}
                        </strong>
                      </td>

                      <td>
                        {String(
                          invoice.customerNameSnapshot ??
                            "Guest",
                        )}
                      </td>

                      <td>
                        {String(invoice.invoiceDate ?? "—")}
                      </td>

                      <td>
                        <strong>
                          {money(
                            invoice.grandTotalPaise ?? 0,
                          )}
                        </strong>
                      </td>

                      <td>
                        <Status
                          value={String(
                            invoice.status ?? "ISSUED",
                          )}
                        />
                      </td>

                      <td>
                        <button
                          type="button"
                          className="text-button"
                          onClick={() =>
                            void downloadInvoice(invoice)
                          }
                        >
                          Download PDF
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="empty-state">
            No invoices issued yet. Generate an invoice from
            Folios & Billing.
          </p>
        )}
      </article>
    </>
  );
}
