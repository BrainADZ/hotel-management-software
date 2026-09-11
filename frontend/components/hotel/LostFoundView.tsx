"use client";
/* eslint-disable @typescript-eslint/no-unused-vars */
import { useMemo, useState } from "react";
import { DataGrid, Empty, Heading, StatCards, Status, money, shortDate, today, type ExtraFeatureProps, type FeatureState, type Row } from "@/components/shared/feature-ui";
import type { PlatformViewProps } from "@/app/hotel-platform";
const seedLostFound = [
  { id: "LF-104", item: "Black wireless earbuds", location: "Room 204", custody: "Front desk locker 2", status: "STORED" },
  { id: "LF-103", item: "Passport wallet", location: "Restaurant", custody: "Manager safe", status: "FOUND" },
  { id: "LF-102", item: "Blue travel bag", location: "Lobby", custody: "Bell desk", status: "CLAIMED" },
];
export function LostFoundView({ notify }: { notify: ExtraFeatureProps["notify"] }) {
  const [items, setItems] = useState(seedLostFound);
  const add = () => {
    const description = window.prompt("Item description");
    if (!description?.trim()) return;
    setItems((current) => [
      {
        id: `LF-${105 + current.length}`,
        item: description.trim(),
        location: "To be recorded",
        custody: "Front desk",
        status: "FOUND",
      },
      ...current,
    ]);
    notify("Lost & found item recorded.");
  };
  return (
    <>
      <Heading
        title="Lost & found"
        description="Custody register for items found, stored, claimed and released."
        actions={
          <button className="primary-button" onClick={add}>
            + Record item
          </button>
        }
      />
      <article className="glass-card">
        <DataGrid
          headers={[
            "Reference",
            "Item",
            "Found at",
            "Custody",
            "Status",
            "Action",
          ]}
          rows={items.map((item) => [
            item.id,
            <strong key="item">{item.item}</strong>,
            item.location,
            item.custody,
            <Status key="status" value={item.status} />,
            item.status !== "RELEASED" ? (
              <button
                className="text-button"
                key="action"
                onClick={() => {
                  setItems((current) =>
                    current.map((row) =>
                      row.id === item.id ? { ...row, status: "RELEASED" } : row,
                    ),
                  );
                  notify(`${item.id} released with custody trail.`);
                }}
              >
                Release
              </button>
            ) : (
              "Complete"
            ),
          ])}
        />
      </article>
    </>
  );
}
