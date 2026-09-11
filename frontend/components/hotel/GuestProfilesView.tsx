"use client";
/* eslint-disable @typescript-eslint/no-unused-vars */
import { useMemo, useState } from "react";
import { DataGrid, Empty, Heading, StatCards, Status, money, shortDate, today, type ExtraFeatureProps, type FeatureState, type Row } from "@/components/shared/feature-ui";
import type { PlatformViewProps } from "@/app/hotel-platform";
export function GuestProfilesView({ state }: { state: FeatureState }) {
  const guests = Object.values(
    state.reservations.reduce<Record<string, Row>>((all, reservation) => {
      const id = String(reservation.guestId ?? reservation.guestName);
      const previous = all[id];
      all[id] = {
        id,
        guestName: reservation.guestName,
        email: reservation.email,
        phone: reservation.phone,
        city: reservation.city,
        loyaltyTier: reservation.loyaltyTier,
        preferences: reservation.preferences,
        dietaryRequirements: reservation.dietaryRequirements,
        stays: Number(previous?.stays ?? 0) + 1,
        lastStay:
          String(previous?.lastStay ?? "") > String(reservation.departureDate)
            ? previous?.lastStay
            : reservation.departureDate,
      };
      return all;
    }, {}),
  );
  return (
    <>
      <Heading
        title="Guest profiles"
        description="Consolidated contact, loyalty, preferences, dietary notes and stay history."
      />
      <article className="glass-card">
        <DataGrid
          headers={[
            "Guest",
            "Contact",
            "City",
            "Loyalty",
            "Preferences",
            "Stays",
            "Last stay",
          ]}
          rows={guests.map((guest) => [
            <strong key="guest">{String(guest.guestName)}</strong>,
            <span key="contact">
              {String(guest.phone ?? "—")}
              <small className="extra-cell-note">
                {String(guest.email ?? "")}
              </small>
            </span>,
            String(guest.city ?? "—"),
            String(guest.loyaltyTier ?? "None"),
            String(guest.preferences ?? guest.dietaryRequirements ?? "—"),
            String(guest.stays),
            shortDate(guest.lastStay),
          ])}
        />
      </article>
    </>
  );
}
