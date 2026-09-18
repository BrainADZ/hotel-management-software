"use client";

/* eslint-disable @typescript-eslint/no-unused-vars */

import {
  AlertTriangle,
  Check,
  Clock3,
  IndianRupee,
  Pencil,
  Plus,
  X,
} from "lucide-react";

import {
  useState,
  type FormEvent,
} from "react";

import type { AppRole } from "@hotel/shared/domain";

import {
  AppGlyph,
  Metric,
  PageHeading,
  Status,
  dateTime,
  localDateTimeInputValue,
  money,
  type DamageSeverity,
  type PlatformViewProps,
  type ReservationInspectionSummary,
  type Row,
  type Surface,
} from "@/app/hotel-platform";

export function RestaurantOrdersView({
  state,
  role,
}: PlatformViewProps) {
  return (
    <>
      <PageHeading
        eyebrow="Restaurant"
        title="Orders & room service"
        description="Room postings validate an active checked-in stay before changing the cloud folio."
      />

      <div className="table-card">
        <table>
          <thead>
            <tr>
              <th>Order</th>
              <th>Room</th>
              <th>Type</th>
              <th>Total</th>
              <th>Kitchen / service</th>
              <th>Payment</th>
            </tr>
          </thead>

          <tbody>
            {state.restaurantOrders.map((order) => (
              <tr key={String(order.id)}>
                <td>
                  <strong>
                    {String(order.id)}
                  </strong>

                  <small>
                    {dateTime(order.createdAt)}
                  </small>
                </td>

                <td>
                  {String(
                    order.roomNumber ??
                      "Restaurant",
                  )}
                </td>

                <td>
                  {String(
                    order.orderType,
                  ).replaceAll("_", " ")}
                </td>

                <td>
                  {money(order.totalRupees)}
                </td>

                <td>
                  <Status
                    value={String(
                      order.status,
                    )}
                  />
                </td>

                <td>
                  <Status
                    value={String(
                      order.paymentStatus,
                    )}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {role === "HOUSEKEEPING" && (
        <p className="privacy-note">
          <AppGlyph
            name="policy"
            size={22}
          />

          Financial order details are
          restricted for this role.
        </p>
      )}
    </>
  );
}