"use client";
/* eslint-disable @typescript-eslint/no-unused-vars */
import { useMemo, useState } from "react";
import { DataGrid, Empty, Heading, StatCards, Status, money, shortDate, today, type ExtraFeatureProps, type FeatureState, type Row } from "@/components/shared/feature-ui";
import type { PlatformViewProps } from "@/app/hotel-platform";
export function InvoicesView({
  state,
  notify,
}: {
  state: FeatureState;
  notify: ExtraFeatureProps["notify"];
}) {
  return (
    <>
      <Heading
        title="Invoices"
        description="Tax invoice register generated from primary folios; split-billing readiness is visible per folio."
      />
      <StatCards
        items={[
          ["Invoices", String(state.folios.length)],
          [
            "Open",
            String(
              state.folios.filter((item) => item.status === "OPEN").length,
            ),
          ],
          [
            "Billed value",
            money(
              state.folios.reduce(
                (sum, item) => sum + Number(item.totalPaise),
                0,
              ),
            ),
          ],
        ]}
      />
      <article className="glass-card">
        <DataGrid
          headers={[
            "Invoice",
            "Booking",
            "Status",
            "Subtotal",
            "Tax",
            "Total",
            "Action",
          ]}
          rows={state.folios.map((folio, index) => {
            const reservation = state.reservations.find(
              (item) => item.id === folio.reservationId,
            );
            return [
              `INV-${String(index + 1).padStart(5, "0")}`,
              String(reservation?.reference ?? folio.reservationId),
              <Status key="status" value={folio.status} />,
              money(folio.subtotalPaise),
              money(folio.taxPaise),
              <strong key="total">{money(folio.totalPaise)}</strong>,
              <button
                className="text-button"
                key="action"
                onClick={() =>
                  notify(
                    `Invoice preview ready for ${String(reservation?.reference ?? folio.id)}.`,
                  )
                }
              >
                Preview / split
              </button>,
            ];
          })}
        />
      </article>
    </>
  );
}
