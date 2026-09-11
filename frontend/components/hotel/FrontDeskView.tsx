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
export function FrontDeskView(props: PlatformViewProps) {
  const { state, propertyRestricted, openReservation, setSelectedReservation } =
    props;
  const [tab, setTab] = useState("Arrivals");
  const rows =
    tab === "Arrivals"
      ? state.reservations.filter(
          (reservation) =>
            reservation.arrivalDate === "2026-08-24" &&
            reservation.status === "CONFIRMED",
        )
      : tab === "Departures"
        ? state.reservations.filter(
            (reservation) =>
              reservation.departureDate === "2026-08-24" &&
              reservation.status === "CHECKED_IN",
          )
        : state.reservations.filter(
            (reservation) => reservation.status === "CHECKED_IN",
          );
  return (
    <>
      <PageHeading
        eyebrow="Hotel / Front Desk"
        title="Front desk command board"
        description={
          propertyRestricted
            ? "Walk-ins are saved on this device and will sync when the connection returns."
            : "Arrivals, departures, guests and room readiness in one operating view."
        }
        actions={
          <button className="primary-button" onClick={openReservation}>
            <Plus size={16} />{" "}
            {propertyRestricted ? "Save offline walk-in" : "New reservation"}
          </button>
        }
      />
      <section className="front-desk-kpis">
        <Metric
          label="Occupancy"
          value={`${state.metrics.occupancyPercent}%`}
        />
        <Metric label="Available" value={state.metrics.availableRooms} />
        <Metric label="Arrivals" value={state.metrics.arrivalsToday} />
        <Metric label="Departures" value={state.metrics.departuresToday} />
        <Metric label="In-house" value={state.metrics.inHouseGuests} />
        <Metric
          label="Pending payments"
          value={state.metrics.pendingPayments}
        />
      </section>
      <div className="toolbar">
        <div className="segmented">
          {["Arrivals", "Departures", "In-house"].map((item) => (
            <button
              key={item}
              className={tab === item ? "active" : ""}
              onClick={() => setTab(item)}
            >
              {item}
            </button>
          ))}
        </div>
        <span>{rows.length} guests</span>
      </div>
      <div className="record-grid">
        {rows.map((reservation) => (
          <button
            className="guest-card"
            key={String(reservation.id)}
            onClick={() => setSelectedReservation(reservation)}
          >
            <span className="record-icon" aria-hidden="true">
              <AppGlyph name="arrivals-departures" size={25} />
            </span>
            <div>
              <strong>{String(reservation.guestName)}</strong>
              <small>
                {String(reservation.reference)} ·{" "}
                {shortDate(reservation.arrivalDate)} –{" "}
                {shortDate(reservation.departureDate)}
              </small>
              {Boolean(reservation.localOnly) && (
                <small className="inline-alert">
                  Saved locally ·{" "}
                  {String(reservation.syncStatus).replaceAll("_", " ")}
                </small>
              )}
            </div>
            <span className="room-chip">
              {reservation.roomNumber
                ? `Room ${String(reservation.roomNumber)}`
                : "Provisional room"}
            </span>
            <Status value={String(reservation.status)} />
          </button>
        ))}
      </div>
    </>
  );
}
