"use client";
/* eslint-disable @typescript-eslint/no-unused-vars */
import { useMemo, useState } from "react";
import { DataGrid, Empty, Heading, StatCards, Status, money, shortDate, today, type ExtraFeatureProps, type FeatureState, type Row } from "@/components/shared/feature-ui";
import type { PlatformViewProps } from "@/app/hotel-platform";
export function MenuManagementView(props: ExtraFeatureProps) {
  const { notify } = props;
    const menu = [
      ["Masala dosa", "Breakfast", 28000, true],
      ["Paneer tikka", "Starters", 44000, true],
      ["Butter chicken", "Main course", 62000, true],
      ["Dal khichdi", "Main course", 36000, true],
      ["Fresh lime soda", "Beverages", 16000, true],
    ] as Array<[string, string, number, boolean]>;

    return (
      <>
        <Heading
          title="Menu management"
          description="Availability, pricing and preparation catalogue for restaurant and room service."
        />
        <article className="glass-card">
          <DataGrid
            headers={["Item", "Category", "Price", "Availability", "Action"]}
            rows={menu.map((item) => [
              <strong key="name">{item[0]}</strong>,
              item[1],
              money(item[2]),
              <Status
                key="status"
                value={item[3] ? "AVAILABLE" : "UNAVAILABLE"}
              />,
              <button
                className="text-button"
                key="action"
                onClick={() => notify(`${item[0]} availability updated.`)}
              >
                Toggle
              </button>,
            ])}
          />
        </article>
      </>
    );
}
