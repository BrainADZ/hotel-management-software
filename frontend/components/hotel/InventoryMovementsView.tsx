"use client";
/* eslint-disable @typescript-eslint/no-unused-vars */
import { useMemo, useState } from "react";
import { DataGrid, Empty, Heading, StatCards, Status, money, shortDate, today, type ExtraFeatureProps, type FeatureState, type Row } from "@/components/shared/feature-ui";
import type { PlatformViewProps } from "@/app/hotel-platform";
export function InventoryMovementsView({ state }: { state: FeatureState }) {
  const movements = state.rooms.slice(0, 0);
  const sample = [
    [
      "MOV-3208",
      "Premium bath towel",
      "STOCK OUT",
      "12",
      "Housekeeping issue",
      "Sonal Pawar",
    ],
    [
      "MOV-3207",
      "Mineral water 500ml",
      "STOCK IN",
      "96",
      "Supplier receipt",
      "Arjun Khanna",
    ],
    [
      "MOV-3206",
      "Coffee sachets",
      "ADJUSTMENT",
      "8",
      "Cycle count",
      "Kabir Shaikh",
    ],
  ];
  void movements;
  return (
    <>
      <Heading
        title="Inventory movements"
        description="Stock-in, stock-out and adjustment ledger with running operational reasons."
      />
      <StatCards
        items={[
          ["Movements today", String(sample.length)],
          ["Stock receipts", "96 units"],
          ["Department issues", "20 units"],
        ]}
      />
      <article className="glass-card">
        <DataGrid
          headers={[
            "Movement",
            "Item",
            "Type",
            "Quantity",
            "Reason",
            "Recorded by",
          ]}
          rows={sample}
        />
      </article>
    </>
  );
}

const seedLostFound = [
  {
    id: "LF-104",
    item: "Black wireless earbuds",
    location: "Room 204",
    custody: "Front desk locker 2",
    status: "STORED",
  },
  {
    id: "LF-103",
    item: "Passport wallet",
    location: "Restaurant",
    custody: "Manager safe",
    status: "FOUND",
  },
  {
    id: "LF-102",
    item: "Blue travel bag",
    location: "Lobby",
    custody: "Bell desk",
    status: "CLAIMED",
  },
];
