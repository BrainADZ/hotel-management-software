"use client";
/* eslint-disable @typescript-eslint/no-unused-vars */
import { useMemo, useState } from "react";
import { DataGrid, Empty, Heading, StatCards, Status, money, shortDate, today, type ExtraFeatureProps, type FeatureState, type Row } from "@/components/shared/feature-ui";
import type { PlatformViewProps } from "@/app/hotel-platform";
export function MealServiceView(props: ExtraFeatureProps) {
  const { state } = props;
    return (
      <>
        <Heading
          title="Meal service"
          description="Breakfast, lunch and dinner entitlements linked to stays."
        />
        <StatCards
          items={[
            [
              "Today’s covers",
              String(
                state.restaurantMealBookings.reduce(
                  (sum, item) => sum + Number(item.guestCount ?? 0),
                  0,
                ),
              ),
            ],
            ["Booked meals", String(state.restaurantMealBookings.length)],
            [
              "Dietary notes",
              String(
                state.restaurantMealBookings.filter((item) => item.dietaryNotes)
                  .length,
              ),
            ],
          ]}
        />
        <article className="glass-card">
          <DataGrid
            headers={[
              "Booking",
              "Room",
              "Service date",
              "Meal",
              "Covers",
              "Status",
            ]}
            rows={state.restaurantMealBookings.map((item) => [
              String(item.bookingReference),
              String(item.roomNumber ?? "—"),
              shortDate(item.serviceDate),
              String(item.mealPeriod).replaceAll("_", " "),
              String(item.guestCount),
              <Status key="status" value={item.status} />,
            ])}
          />
        </article>
      </>
    );
}
