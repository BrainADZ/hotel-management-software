"use client";
/* eslint-disable @typescript-eslint/no-unused-vars */
import { ArrowRight, CalendarDays, Check, Download, Plus, X } from "lucide-react";
import { useEffect, useState } from "react";
import { roleCan } from "@hotel/shared/domain";
import { apiUrl } from "@/lib/api/client";
import type { MealService } from "@/lib/offline-db";
import { ProductionFrontDesk, ProductionGuests } from "@/app/production-front-desk";
import { DamageReviewPanel, HousekeepingOverviewView } from "@/components/hotel/HousekeepingView";
import { AppGlyph, AvailabilityGrid, InspectionStatusBadge, Kpi, Metric, MiniModule, PageHeading, ReservationCompact, SandboxBadge, Status, dateTime, downloadBlob, money, mealLabel, mealOptions, productionApi, shortDate, type PlatformViewProps, type Row } from "@/app/hotel-platform";
export function GuestsView({ state, setSelectedReservation }: PlatformViewProps) {
  const unique = new Map<string, Row>();
  state.reservations.forEach((reservation) =>
    unique.set(String(reservation.guestId), reservation),
  );
  return (
    <>
      <PageHeading
        eyebrow="Hotel / Guests"
        title="Guest profiles"
        description="Current stay, preferences and repeat-guest context are property-scoped."
      />
      <div className="record-grid">
        {[...unique.values()].map((guest) => (
          <button
            className="guest-card guest-profile-card"
            key={String(guest.guestId)}
            onClick={() => setSelectedReservation(guest)}
          >
            <span className="record-icon" aria-hidden="true">
              <AppGlyph name="guest" size={25} />
            </span>
            <div>
              <strong>{String(guest.guestName)}</strong>
              <small>
                {String(guest.city ?? "India")} ·{" "}
                {String(guest.loyaltyTier ?? "Member")}
              </small>
            </div>
            <div className="guest-meta">
              <span>{String(guest.phone ?? "No phone")}</span>
              <small>{String(guest.preferences ?? "No preferences")}</small>
            </div>
            <ArrowRight size={15} />
          </button>
        ))}
      </div>
    </>
  );
}
