"use client";
/* eslint-disable @typescript-eslint/no-unused-vars */
import { useMemo, useState } from "react";
import { DataGrid, Empty, Heading, StatCards, Status, money, shortDate, today, type ExtraFeatureProps, type FeatureState, type Row } from "@/components/shared/feature-ui";
import type { PlatformViewProps } from "@/app/hotel-platform";
export function RoomTypesRatesView({ state }: { state: FeatureState }) {
  const groups = Object.values(
    state.rooms.reduce<
      Record<
        string,
        {
          type: string;
          rooms: number;
          rate: number;
          adults: number;
          children: number;
        }
      >
    >((all, room) => {
      const type = String(room.roomType);
      const current = all[type] ?? {
        type,
        rooms: 0,
        rate: Number(room.baseRateRupees),
        adults: type.includes("Suite") ? 3 : 2,
        children: type.includes("Suite") ? 2 : 1,
      };
      current.rooms += 1;
      current.rate = Math.min(current.rate, Number(room.baseRateRupees));
      all[type] = current;
      return all;
    }, {}),
  );
  return (
    <>
      <Heading
        title="Room types & rate plans"
        description="Room inventory grouped into sellable types with the current base rate and common pricing plans."
      />
      <article className="glass-card">
        <DataGrid
          headers={[
            "Room type",
            "Rooms",
            "Base rate",
            "Occupancy",
            "Rate plans",
          ]}
          rows={groups.map((group) => [
            <strong key={group.type}>{group.type}</strong>,
            String(group.rooms),
            money(group.rate),
            `${group.adults} adults · ${group.children} children`,
            "Best Available · Advance Purchase · Corporate",
          ])}
        />
      </article>
    </>
  );
}
