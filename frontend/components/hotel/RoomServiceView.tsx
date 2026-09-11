"use client";
/* eslint-disable @typescript-eslint/no-unused-vars */
import { useMemo, useState } from "react";
import { DataGrid, Empty, Heading, StatCards, Status, money, shortDate, today, type ExtraFeatureProps, type FeatureState, type Row } from "@/components/shared/feature-ui";
import type { PlatformViewProps } from "@/app/hotel-platform";
export function RoomServiceView(props: ExtraFeatureProps) {
  const { state } = props;
  const roomOrders = state.restaurantOrders.filter((item) =>
    String(item.orderType).includes("ROOM"),
  );
  return (
    <>
      <Heading
        title="Room service"
        description="Room-delivery order queue with folio posting and fulfilment status."

      />
      <StatCards
        items={[
          ["Room orders", String(roomOrders.length)],
          [
            "Open",
            String(
              roomOrders.filter(
                (item) =>
                  !["DELIVERED", "CLOSED"].includes(String(item.status)),
              ).length,
            ),
          ],
          [
            "Order value",
            money(
              roomOrders.reduce(
                (sum, item) => sum + Number(item.totalPaise),
                0,
              ),
            ),
          ],
        ]}
      />
      <article className="glass-card">
        <DataGrid
          headers={["Order", "Room", "Booking", "Total", "Payment", "Status"]}
          rows={roomOrders.map((item) => [
            String(item.id),
            String(item.roomNumber),
            String(item.reservationId),
            money(item.totalPaise),
            <Status key="payment" value={item.paymentStatus} />,
            <Status key="status" value={item.status} />,
          ])}
        />
      </article>
    </>
  );
}
