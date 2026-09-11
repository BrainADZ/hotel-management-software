"use client";
/* eslint-disable @typescript-eslint/no-unused-vars */
import { useMemo, useState } from "react";
import { DataGrid, Empty, Heading, StatCards, Status, money, shortDate, today, type ExtraFeatureProps, type FeatureState, type Row } from "@/components/shared/feature-ui";
import type { PlatformViewProps } from "@/app/hotel-platform";
export function FollowUpsView(props: PlatformViewProps) {
  const { state, notify, command, refresh, productionMode } = props;
  const followUps = productionMode ? state.followUps : state.inquiries.filter(
    (item) => !["CONVERTED", "LOST"].includes(String(item.status)),
  );
    return (
      <>
        <Heading
          title="Follow-ups"
          description="Due-date queue for calls, emails, WhatsApp and client visits."
        />
        <article className="glass-card">
          <DataGrid
            headers={[
              "Inquiry",
              "Customer",
              "Owner",
              "Due",
              "Channel",
              "Action",
            ]}
            rows={followUps
              .map((item, index) => [
                String(item.inquiryId ?? item.reference),
                String(item.customerName ?? item.inquiryId),
                String(item.assignedToName ?? item.owner),
                String(item.dueAt ?? item.followUpAt)
                  ? new Date(String(item.dueAt ?? item.followUpAt)).toLocaleString("en-IN")
                  : "Not set",
                String(item.channel ?? ["Call", "Email", "WhatsApp"][index % 3]).replaceAll("_", " "),
                <button
                  className="text-button"
                  key="action"
                  onClick={async () => {
                    if (productionMode) {
                      await command({ action: "COMPLETE_FOLLOW_UP", followUpId: item.id, expectedVersion: item.version, status: "COMPLETED" });
                      await refresh();
                    }
                    notify(`Follow-up completed for ${String(item.reference ?? item.id)}.`);
                  }}
                >
                  Mark done
                </button>,
              ])}
          />
        </article>
      </>
    );
}
