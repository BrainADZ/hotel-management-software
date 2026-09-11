"use client";
/* eslint-disable @typescript-eslint/no-unused-vars */
import { useMemo, useState } from "react";
import { DataGrid, Empty, Heading, StatCards, Status, money, shortDate, today, type ExtraFeatureProps, type FeatureState, type Row } from "@/components/shared/feature-ui";
import type { PlatformViewProps } from "@/app/hotel-platform";
export function ArrivalsDeparturesView({ state }: { state: FeatureState }) {
  const [date, setDate] = useState(today());
  const arrivals = state.reservations.filter(
    (item) => String(item.arrivalDate) === date && item.status !== "CANCELLED",
  );
  const departures = state.reservations.filter(
    (item) =>
      String(item.departureDate) === date && item.status !== "CANCELLED",
  );
  const rows = (items: Row[]) =>
    items.map((item) => [
      String(item.reference),
      String(item.guestName),
      String(item.roomNumber ?? "Unassigned"),
      String(item.roomType),
      <Status key="status" value={item.status} />,
    ]);
  return (
    <>
      <Heading
        title="Arrivals & departures"
        description="Daily movement sheet from the authoritative reservation list."
        actions={
          <input
            className="extra-input"
            type="date"
            value={date}
            onChange={(event) => setDate(event.target.value)}
          />
        }
      />
      <StatCards
        items={[
          ["Arrivals", String(arrivals.length)],
          ["Departures", String(departures.length)],
          [
            "Stayovers",
            String(
              state.reservations.filter(
                (item) =>
                  item.status === "CHECKED_IN" &&
                  String(item.arrivalDate) < date &&
                  String(item.departureDate) > date,
              ).length,
            ),
          ],
        ]}
      />
      <section className="extra-two-column">
        <article className="glass-card">
          <h2>Arrivals</h2>
          <DataGrid
            headers={["Booking", "Guest", "Room", "Type", "Status"]}
            rows={rows(arrivals)}
          />
        </article>
        <article className="glass-card">
          <h2>Departures</h2>
          <DataGrid
            headers={["Booking", "Guest", "Room", "Type", "Status"]}
            rows={rows(departures)}
          />
        </article>
      </section>
    </>
  );
}
