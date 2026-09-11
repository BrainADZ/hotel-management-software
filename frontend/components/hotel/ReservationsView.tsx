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
export function ReservationsView({
  state,
  productionMode,
  propertyRestricted,
  openReservation,
  setSelectedReservation,
  command,
  refresh,
  notify,
}: PlatformViewProps) {
  const [filter, setFilter] = useState("ALL");
  const [page, setPage] = useState(1);
  const [productionRows, setProductionRows] = useState<Row[]>(
    state.reservations,
  );
  const [productionTotal, setProductionTotal] = useState(
    state.reservations.length,
  );
  useEffect(() => {
    if (!productionMode) return;
    const params = new URLSearchParams({ page: String(page), pageSize: "25" });
    if (filter !== "ALL") params.set("status", filter);
    void productionApi(`/api/reservations?${params}`)
      .then((body) => {
        setProductionRows(
          (body.items as Row[]).map((item) => ({
            ...item,
            guestName: item.primaryGuestName,
            email: item.guestEmail,
            phone: item.guestPhone,
            contactStatus: "ACKNOWLEDGED",
          })),
        );
        setProductionTotal(Number(body.total ?? 0));
      })
      .catch(() => undefined);
  }, [filter, page, productionMode, state.reservations]);
  const reservations = productionMode
    ? productionRows
    : filter === "ALL"
      ? state.reservations
      : state.reservations.filter(
          (reservation) => reservation.status === filter,
        );
  const inspectionByReservation = new Map(
    (state.reservationInspectionSummaries ?? []).map((summary) => [
      String(summary.reservationId),
      summary,
    ]),
  );
  return (
    <>
      <PageHeading
        eyebrow="Master Hub / Live booking feed"
        title="Reservation control"
        description="Front-desk, website and OTA bookings flow into one list and refresh automatically."
        actions={
          <button className="primary-button" onClick={openReservation}>
            <Plus size={16} />{" "}
            {propertyRestricted ? "Offline walk-in" : "New reservation"}
          </button>
        }
      />
      <div className="toolbar">
        <div className="segmented">
          {[
            "ALL",
            "PENDING",
            "HOLD",
            "CONFIRMED",
            "CHECKED_IN",
            "CHECKED_OUT",
            "CANCELLED",
            "NO_SHOW",
          ].map((item) => (
            <button
              key={item}
              className={filter === item ? "active" : ""}
              onClick={() => {
                setFilter(item);
                setPage(1);
              }}
            >
              {item.replace("_", " ")}
            </button>
          ))}
        </div>
        <span>
          {productionMode ? productionTotal : reservations.length} records
        </span>
      </div>
      <div className="table-card">
        <table>
          <thead>
            <tr>
              <th>Booking</th>
              <th>Guest</th>
              <th>Stay</th>
              <th>Room</th>
              <th>Source</th>
              <th>Status</th>
              <th>Housekeeping</th>
              <th>Sync</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {reservations.map((reservation) => {
              const inspection = inspectionByReservation.get(
                String(reservation.id),
              );
              return (
                <tr key={String(reservation.id)}>
                  <td>
                    <strong>{String(reservation.reference)}</strong>
                    {Boolean(reservation.localOnly) && (
                      <small className="inline-alert">
                        Saved on this device
                      </small>
                    )}
                    {Boolean(reservation.createdWhilePropertyOffline) &&
                      !reservation.localOnly && (
                        <small className="inline-alert">
                          Created during outage
                        </small>
                      )}
                  </td>
                  <td>{String(reservation.guestName)}</td>
                  <td>
                    {shortDate(reservation.arrivalDate)} –{" "}
                    {shortDate(reservation.departureDate)}
                  </td>
                  <td>
                    {String(reservation.roomNumber ?? "Provisional")} ·{" "}
                    {String(reservation.roomType)}
                  </td>
                  <td>
                    <SandboxBadge value={String(reservation.source)} />
                  </td>
                  <td>
                    <Status value={String(reservation.status)} />
                  </td>
                  <td>
                    <InspectionStatusBadge
                      summary={inspection}
                      reservationStatus={String(reservation.status)}
                    />
                  </td>
                  <td>
                    {reservation.localOnly ? (
                      <>
                        <Status value={String(reservation.syncStatus)} />
                        {Boolean(reservation.syncError) && (
                          <small>{String(reservation.syncError)}</small>
                        )}
                      </>
                    ) : reservation.contactStatus === "NOT_CONTACTED" ? (
                      <button
                        className="compact-button warning"
                        onClick={async () => {
                          try {
                            await command({
                              action: "MARK_CONTACTED",
                              reservationId: reservation.id,
                            });
                            await refresh();
                            notify("Property contact recorded.");
                          } catch (cause) {
                            notify(
                              cause instanceof Error
                                ? cause.message
                                : "Could not update contact status.",
                            );
                          }
                        }}
                      >
                        Mark contacted
                      </button>
                    ) : (
                      <span className="contacted">
                        <Check size={13} /> Synced
                      </span>
                    )}
                  </td>
                  <td>
                    <button
                      className="row-action"
                      onClick={() => setSelectedReservation(reservation)}
                    >
                      Open
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {productionMode && productionTotal > 25 && (
        <div className="modal-actions">
          <button
            className="secondary-button"
            disabled={page === 1}
            onClick={() => setPage((value) => Math.max(1, value - 1))}
          >
            Previous
          </button>
          <span>Page {page}</span>
          <button
            className="secondary-button"
            disabled={page * 25 >= productionTotal}
            onClick={() => setPage((value) => value + 1)}
          >
            Next
          </button>
        </div>
      )}
    </>
  );
}
