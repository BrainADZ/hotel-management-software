"use client";
/* eslint-disable @typescript-eslint/no-unused-vars */
import { useMemo, useState } from "react";
import { DataGrid, Empty, Heading, StatCards, Status, money, shortDate, today, type ExtraFeatureProps, type FeatureState, type Row } from "@/components/shared/feature-ui";
import type { PlatformViewProps } from "@/app/hotel-platform";
export function CommunicationsView(props: ExtraFeatureProps) {
  const { state, notify } = props;
  return (
    <>
      <Heading
        title="Communications"
        description="Unified outbound message history linked to inquiries and reservations."
        actions={
          <button
            className="primary-button"
            onClick={() => notify("Message composer opened in demo mode.")}
          >
            + New message
          </button>
        }
      />
      <article className="glass-card">
        <DataGrid
          headers={[
            "Channel",
            "Recipient",
            "Subject",
            "Related record",
            "Status",
          ]}
          rows={[
            ...state.inquiries
              .slice(0, 4)
              .map((item, index) => [
                index % 2 ? "Email" : "WhatsApp",
                String(item.customerName),
                index % 2
                  ? "Your hospitality proposal"
                  : "Follow-up on your enquiry",
                String(item.reference),
                <Status key="status" value="DELIVERED" />,
              ]),
            ...state.reservations
              .slice(0, 3)
              .map((item) => [
                "Email",
                String(item.guestName),
                "Reservation confirmation",
                String(item.reference),
                <Status key="status" value="SENT" />,
              ]),
          ]}
        />
      </article>
    </>
  );
}
