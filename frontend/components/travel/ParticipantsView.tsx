"use client";
/* eslint-disable @typescript-eslint/no-unused-vars */
import { useMemo, useState } from "react";
import { DataGrid, Empty, Heading, StatCards, Status, money, shortDate, today, type ExtraFeatureProps, type FeatureState, type Row } from "@/components/shared/feature-ui";
import type { PlatformViewProps } from "@/app/hotel-platform";
export function ParticipantsView(props: ExtraFeatureProps) {
  const { state } = props;
    return (
      <>
        <Heading
          title="Tour participants"
          description="Traveller roster, room-sharing preference, documents and payment position."
        />
        <article className="glass-card">
          <DataGrid
            headers={[
              "Participant",
              "Tour",
              "Sharing",
              "Documents",
              "Payable",
              "Balance",
            ]}
            rows={state.inquiries
              .slice(0, 8)
              .map((item, index) => [
                String(item.customerName),
                `TOUR-${2601 + (index % Math.max(state.packages.length, 1))}`,
                index % 3 === 0 ? "Single" : "Double",
                index % 2 ? "Received" : "Pending",
                money(item.estimatedValuePaise),
                money(
                  Math.round(
                    Number(item.estimatedValuePaise) * (index % 2 ? 0 : 0.35),
                  ),
                ),
              ])}
          />
        </article>
      </>
    );
}
