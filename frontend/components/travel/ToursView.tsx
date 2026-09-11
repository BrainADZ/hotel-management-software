"use client";
/* eslint-disable @typescript-eslint/no-unused-vars */
import { useMemo, useState } from "react";
import { DataGrid, Empty, Heading, StatCards, Status, money, shortDate, today, type ExtraFeatureProps, type FeatureState, type Row } from "@/components/shared/feature-ui";
import type { PlatformViewProps } from "@/app/hotel-platform";
export function ToursView(props: ExtraFeatureProps) {
  const { state } = props;
    return (
      <>
        <Heading
          title="Tour departures"
          description="Scheduled departures derived from active travel packages."
        />
        <article className="glass-card">
          <DataGrid
            headers={[
              "Tour",
              "Package",
              "Duration",
              "Route",
              "Capacity",
              "Status",
            ]}
            rows={state.packages.map((item, index) => [
              `TOUR-${2601 + index}`,
              String(item.name),
              `${String(item.durationDays)} days`,
              String(item.locations),
              `${String(item.booked)}/${String(item.capacity)}`,
              <Status
                key="status"
                value={index === 0 ? "CONFIRMED" : "SELLING"}
              />,
            ])}
          />
        </article>
      </>
    );
}
