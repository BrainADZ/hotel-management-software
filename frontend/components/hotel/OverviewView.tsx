"use client";

/* eslint-disable @typescript-eslint/no-unused-vars */

import {
  ArrowRight,
  CalendarDays,
  Check,
  Download,
  Plus,
  X,
} from "lucide-react";
import { useState } from "react";
import { roleCan } from "@hotel/shared/domain";
import { apiUrl } from "@/lib/api/client";
import type { MealService } from "@/lib/offline-db";
import {
  ProductionFrontDesk,
  ProductionGuests,
} from "@/app/production-front-desk";
import {
  DamageReviewPanel,
  HousekeepingOverviewView,
} from "@/components/hotel/HousekeepingView";
import {
  AppGlyph,
  AvailabilityGrid,
  InspectionStatusBadge,
  Kpi,
  Metric,
  MiniModule,
  PageHeading,
  ReservationCompact,
  SandboxBadge,
  Status,
  dateTime,
  downloadBlob,
  money,
  mealLabel,
  mealOptions,
  productionApi,
  shortDate,
  type PlatformViewProps,
  type Row,
} from "@/app/hotel-platform";

function getTodayIsoDate() {
  const now = new Date();

  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function getCurrentDateLabel() {
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  }).format(new Date());
}

export function RestaurantOverviewView({
  state,
  setView,
  notify,
}: PlatformViewProps) {
  const [mealFilter, setMealFilter] =
    useState<"ALL" | MealService>("ALL");

  const [serviceDate, setServiceDate] = useState(
    () => getTodayIsoDate(),
  );

  const rows = state.restaurantMealBookings.filter(
    (booking) =>
      booking.serviceDate === serviceDate &&
      (mealFilter === "ALL" ||
        booking.mealPeriod === mealFilter),
  );

  const roomCount = new Set(
    rows.map((booking) =>
      String(booking.reservationId),
    ),
  ).size;

  const arrivals = state.restaurantArrivals
    .filter(
      (arrival) =>
        arrival.arrivalDate === serviceDate,
    )
    .map((arrival) => {
      const reservationId = String(
        arrival.reservationId,
      );

      const bookings =
        state.restaurantMealBookings.filter(
          (booking) =>
            booking.reservationId ===
              reservationId &&
            booking.serviceDate === serviceDate,
        );

      const dietaryNotes = [
        ...new Set(
          bookings
            .map((booking) =>
              String(
                booking.dietaryNotes ?? "",
              ),
            )
            .filter(Boolean),
        ),
      ].join("; ");

      return {
        reservationId,
        bookingReference:
          arrival.bookingReference,
        roomNumber: arrival.roomNumber,
        guestCount: arrival.guestCount,
        dietaryNotes,
        meals: bookings.map((booking) =>
          String(booking.mealPeriod),
        ),
      };
    });

  function downloadMealList() {
    const header = [
      "Room",
      "Booking",
      "Service date",
      "Meal period",
      "Guests",
      "Dietary notes",
    ];

    const csvRows = rows.map((booking) => [
      booking.roomNumber,
      booking.bookingReference,
      booking.serviceDate,
      mealLabel(booking.mealPeriod),
      booking.guestCount,
      booking.dietaryNotes ?? "",
    ]);

    const csv = [header, ...csvRows]
      .map((row) =>
        row
          .map((value) => {
            const raw = String(
              value ?? "",
            );

            const safe = /^[=+\-@]/.test(
              raw,
            )
              ? `'${raw}`
              : raw;

            return `"${safe.replaceAll(
              '"',
              '""',
            )}"`;
          })
          .join(","),
      )
      .join("\n");

    const name =
      mealFilter === "ALL"
        ? "all-meals"
        : String(mealFilter)
            .toLowerCase()
            .replaceAll("_", "-");

    downloadBlob(
      new Blob([csv], {
        type: "text/csv;charset=utf-8",
      }),
      `brainadz-${name}-${serviceDate}.csv`,
    );

    notify(
      `${rows.length} meal booking${
        rows.length === 1 ? "" : "s"
      } downloaded.`,
    );
  }

  return (
    <>
      <PageHeading
        eyebrow="Restaurant overview"
        title={`Good afternoon, ${
          state.actor.name.split(" ")[0]
        }.`}
        description="Meal commitments, arrivals, orders and restaurant stock in one workspace."
        actions={
          <button
            className="primary-button"
            disabled={!rows.length}
            onClick={downloadMealList}
          >
            <Download size={15} />
            Download filtered list
          </button>
        }
      />

      <section className="restaurant-meal-kpis">
        {mealOptions.map((meal) => (
          <button
            key={meal.value}
            className={
              mealFilter === meal.value
                ? "active"
                : ""
            }
            onClick={() =>
              setMealFilter(meal.value)
            }
          >
            <span>
              <AppGlyph
                name={meal.glyph}
                size={28}
              />
            </span>

            <small>{meal.label}</small>

            <strong>
              {
                state.restaurantMealBookings.filter(
                  (booking) =>
                    booking.serviceDate ===
                      serviceDate &&
                    booking.mealPeriod ===
                      meal.value,
                ).length
              }
            </strong>
          </button>
        ))}
      </section>

      <section className="restaurant-overview-grid">
        <article className="glass-card restaurant-arrivals">
          <div className="card-heading">
            <div>
              <p className="section-kicker">
                Arrival preparation
              </p>

              <h2>
                Arrivals and meal plans ·{" "}
                {shortDate(serviceDate)}
              </h2>
            </div>

            <span>
              {arrivals.length} rooms
            </span>
          </div>

          {arrivals.length ? (
            <div className="restaurant-arrival-list">
              {arrivals.map(
                (arrival) => (
                  <div
                    key={String(
                      arrival.reservationId,
                    )}
                  >
                    <span className="record-icon">
                      <AppGlyph
                        name="arrivals-departures"
                        size={25}
                      />
                    </span>

                    <div>
                      <strong>
                        Room{" "}
                        {String(
                          arrival.roomNumber ??
                            "TBA",
                        )}
                      </strong>

                      <small>
                        {String(
                          arrival.bookingReference,
                        )}{" "}
                        ·{" "}
                        {Number(
                          arrival.guestCount ??
                            1,
                        )}{" "}
                        guest
                        {Number(
                          arrival.guestCount ??
                            1,
                        ) === 1
                          ? ""
                          : "s"}
                      </small>

                      {Boolean(
                        arrival.dietaryNotes,
                      ) && (
                        <em>
                          {String(
                            arrival.dietaryNotes,
                          )}
                        </em>
                      )}
                    </div>

                    <span className="meal-chip-wrap">
                      {arrival.meals
                        .length ? (
                        arrival.meals.map(
                          (meal) => (
                            <i key={meal}>
                              {mealLabel(
                                meal,
                              )}
                            </i>
                          ),
                        )
                      ) : (
                        <i>
                          No meal booked
                        </i>
                      )}
                    </span>
                  </div>
                ),
              )}
            </div>
          ) : (
            <div className="empty-state small">
              <AppGlyph
                name="booking-calendar"
                size={38}
              />

              <strong>
                No arrivals for this date
              </strong>
            </div>
          )}
        </article>

        <article className="glass-card restaurant-ops-summary">
          <div className="card-heading">
            <div>
              <p className="section-kicker">
                Restaurant operations
              </p>

              <h2>
                Today&apos;s priorities
              </h2>
            </div>
          </div>

          <button
            onClick={() =>
              setView(
                "Restaurant Orders",
              )
            }
          >
            <AppGlyph
              name="restaurant"
              size={25}
            />

            <span>
              <strong>
                {
                  state.restaurantOrders
                    .length
                }{" "}
                service orders
              </strong>

              <small>
                Open orders and room
                service
              </small>
            </span>

            <ArrowRight size={15} />
          </button>

          <button
            onClick={() =>
              setView("Inventory")
            }
          >
            <AppGlyph
              name="inventory"
              size={25}
            />

            <span>
              <strong>
                {
                  state.metrics
                    .lowStockCount
                }{" "}
                low-stock items
              </strong>

              <small>
                Kitchen, beverage and
                supplies
              </small>
            </span>

            <ArrowRight size={15} />
          </button>
        </article>
      </section>

      <section className="meal-service-section">
        <div className="subsection-heading">
          <div>
            <p className="section-kicker">
              Downloadable service list
            </p>

            <h2>
              {mealFilter === "ALL"
                ? "All meal bookings"
                : mealLabel(mealFilter)}
            </h2>
          </div>

          <label className="service-date-filter">
            <CalendarDays size={14} />

            <input
              type="date"
              value={serviceDate}
              onChange={(event) =>
                setServiceDate(
                  event.target.value,
                )
              }
            />
          </label>
        </div>

        <div className="toolbar meal-filter-toolbar">
          <div className="segmented">
            <button
              className={
                mealFilter === "ALL"
                  ? "active"
                  : ""
              }
              onClick={() =>
                setMealFilter("ALL")
              }
            >
              All
            </button>

            {mealOptions.map(
              (meal) => (
                <button
                  key={meal.value}
                  className={
                    mealFilter ===
                    meal.value
                      ? "active"
                      : ""
                  }
                  onClick={() =>
                    setMealFilter(
                      meal.value,
                    )
                  }
                >
                  {meal.label}
                </button>
              ),
            )}
          </div>

          <span>
            {roomCount} rooms ·{" "}
            {rows.length} services
          </span>
        </div>

        <div className="table-card meal-service-table">
          <table>
            <thead>
              <tr>
                <th>Room</th>
                <th>Booking</th>
                <th>Meal</th>
                <th>Guests</th>
                <th>
                  Dietary notes
                </th>
                <th>Status</th>
              </tr>
            </thead>

            <tbody>
              {rows.map((booking) => (
                <tr
                  key={String(
                    booking.id,
                  )}
                >
                  <td>
                    <strong>
                      Room{" "}
                      {String(
                        booking.roomNumber ??
                          "TBA",
                      )}
                    </strong>
                  </td>

                  <td>
                    {String(
                      booking.bookingReference,
                    )}
                  </td>

                  <td>
                    {mealLabel(
                      booking.mealPeriod,
                    )}
                  </td>

                  <td>
                    {Number(
                      booking.guestCount,
                    )}
                  </td>

                  <td>
                    {String(
                      booking.dietaryNotes ??
                        "None recorded",
                    )}
                  </td>

                  <td>
                    <Status
                      value={String(
                        booking.status,
                      )}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}

export function OverviewView({
  state,
  propertyRestricted,
  openReservation,
  canCreateReservation,
  setView,
  changeNetwork,
  role,
  surface,
  command,
  refresh,
  notify,
}: PlatformViewProps) {
  const today = getTodayIsoDate();
  const currentDateLabel =
    getCurrentDateLabel();

  const arrivals = state.reservations
    .filter(
      (reservation) =>
        reservation.arrivalDate ===
          today &&
        reservation.status ===
          "CONFIRMED",
    )
    .slice(0, 4);

  return (
    <>
      <PageHeading
        eyebrow="Hospitality command centre"
        title={`Good afternoon, ${
          state.actor.name.split(" ")[0]
        }.`}
        description="One operating picture for hotel and guest operations."
        actions={
          <>
            <span className="date-chip">
              <CalendarDays size={15} />
              {currentDateLabel}
            </span>

            {canCreateReservation && (
              <button
                className="primary-button"
                onClick={
                  openReservation
                }
              >
                <Plus size={16} />

                {propertyRestricted
                  ? "Offline walk-in"
                  : "New reservation"}
              </button>
            )}
          </>
        }
      />

      <AvailabilityGrid
        state={state}
        onNewBooking={
          openReservation
        }
        restricted={
          !canCreateReservation
        }
      />

      <section className="kpi-grid overview-kpis">
        <Kpi
          icon={
            <AppGlyph
              name="occupancy"
              size={31}
            />
          }
          label="Occupancy"
          value={`${state.metrics.occupancyPercent}%`}
          detail={`${state.metrics.occupiedRooms} of ${state.metrics.totalRooms} rooms`}
          meta="Calculated from room state"
          tone="blue"
        />

        <Kpi
          icon={
            <AppGlyph
              name="room-ready"
              size={31}
            />
          }
          label="Available rooms"
          value={String(
            state.metrics.availableRooms,
          )}
          detail={`${state.metrics.readyRooms} clean & ready`}
          meta={`${state.metrics.dirtyRooms} need cleaning`}
          tone="cyan"
        />

        <Kpi
          icon={
            <AppGlyph
              name="arrivals-departures"
              size={31}
            />
          }
          label="Arrivals / departures"
          value={`${state.metrics.arrivalsToday} / ${state.metrics.departuresToday}`}
          detail={`${state.metrics.inHouseGuests} in-house`}
          meta={`${state.metrics.pendingPayments} balances due`}
          tone="violet"
        />

        <Kpi
          icon={
            <AppGlyph
              name="folio"
              size={31}
            />
          }
          label="Folio charges (including tax)"
          value={money(
            state.metrics.revenueRupees,
          )}
          detail={`ADR ${money(
            state.metrics.adrRupees,
          )}`}
          meta={`RevPAR ${money(
            state.metrics.revParRupees,
          )}`}
          tone="emerald"
        />
      </section>

      <section className="dashboard-grid overview-grid">
        <article className="glass-card connectivity-card">
          <div className="card-heading">
            <div>
              <p className="section-kicker">
                Property connectivity
              </p>

              <h2>
                {state.property.name}
              </h2>
            </div>

            <Status
              value={
                state.property
                  .connectionStatus
              }
            />
          </div>

          <div className="connectivity-visual">
            <div
              className={`signal-orbit ${
                state.property
                  .connectionStatus ===
                "OFFLINE"
                  ? "signal-off"
                  : ""
              }`}
            >
              <AppGlyph
                name={
                  state.property
                    .connectionStatus ===
                  "ONLINE"
                    ? "cloud-network"
                    : "offline"
                }
                size={43}
              />
            </div>

            <div>
              <strong>
                {state.property
                  .connectionStatus ===
                "ONLINE"
                  ? "Master Hub connected"
                  : "Property connection unavailable"}
              </strong>

              <p>
                {state.property
                  .connectionStatus ===
                "ONLINE"
                  ? "Reservations, inventory and billing are synchronised."
                  : "Cached existing-guest billing remains available. Cloud mutations are locked."}
              </p>
            </div>
          </div>

          <div className="sync-grid">
            <div>
              <small>
                Last property sync
              </small>

              <strong>
                {dateTime(
                  state.property
                    .lastSyncAt,
                )}
              </strong>
            </div>

            <div>
              <small>Device</small>

              <strong>
                Front Desk 01
              </strong>
            </div>

            <div>
              <small>
                Offline bills
              </small>

              <strong>
                {
                  state.offlineBills.filter(
                    (bill) =>
                      bill.status !==
                      "VERIFIED",
                  ).length
                }{" "}
                to verify
              </strong>
            </div>
          </div>

          <button
            className={`network-button ${
              state.property
                .connectionStatus ===
              "OFFLINE"
                ? "restore"
                : ""
            }`}
            onClick={() =>
              changeNetwork(
                state.property
                  .connectionStatus ===
                  "ONLINE"
                  ? "OFFLINE"
                  : "ONLINE",
              )
            }
          >
            <AppGlyph
              name={
                state.property
                  .connectionStatus ===
                "ONLINE"
                  ? "offline"
                  : "cloud-network"
              }
              size={22}
            />

            {state.property
              .connectionStatus ===
            "ONLINE"
              ? "Simulate hotel offline"
              : "Restore hotel connection"}
          </button>

          <p className="sandbox-note">
            UAT network simulator ·
            hotel session only · Master
            Hub remains online
          </p>
        </article>

        <article className="glass-card arrivals-card">
          <div className="card-heading">
            <div>
              <p className="section-kicker">
                Front desk flow
              </p>

              <h2>
                Today&apos;s arrivals
              </h2>
            </div>

            <button
              className="text-button"
              onClick={() =>
                setView("Front Desk")
              }
            >
              View front desk
              <ArrowRight size={14} />
            </button>
          </div>

          <div className="arrival-list">
            {arrivals.map(
              (arrival) => (
                <ReservationCompact
                  key={String(
                    arrival.id,
                  )}
                  reservation={arrival}
                />
              ),
            )}
          </div>

          <div className="arrival-summary">
            <span>
              <AppGlyph
                name="room-ready"
                size={23}
              />{" "}
              {
                state.metrics
                  .readyRooms
              }{" "}
              rooms ready
            </span>

            <span>
              <AppGlyph
                name="maintenance"
                size={23}
              />{" "}
              {
                state.metrics
                  .unresolvedMaintenance
              }{" "}
              open ticket
            </span>

            <span>
              <AppGlyph
                name="wallet-alert"
                size={23}
              />{" "}
              {
                state.metrics
                  .pendingPayments
              }{" "}
              balances due
            </span>
          </div>
        </article>
      </section>

      <section className="mini-module-grid hotel-module-grid">
        <MiniModule
          icon={
            <AppGlyph
              name="restaurant"
              size={31}
            />
          }
          title="Restaurant"
          value={`${state.restaurantOrders.length} orders today`}
          detail="Room posting validated online"
          onClick={() =>
            setView(
              "Restaurant Orders",
            )
          }
        />

        <MiniModule
          icon={
            <AppGlyph
              name="attention-queue"
              size={31}
            />
          }
          title="Attention queue"
          value={`${
            state.metrics
              .lowStockCount +
            state.metrics
              .unresolvedMaintenance
          } items`}
          detail="Low stock & maintenance"
          onClick={() =>
            setView("Reports")
          }
        />

        <MiniModule
          icon={
            <AppGlyph
              name="booking-feed"
              size={31}
            />
          }
          title="Booking feed"
          value="Live"
          detail="Front desk, website & OTA"
          onClick={() =>
            setView("Reservations")
          }
        />
      </section>

      {["OWNER", "MANAGER"].includes(
        role,
      ) && (
        <DamageReviewPanel
          reports={
            state.damageReports
          }
          surface={surface}
          command={command}
          refresh={refresh}
          notify={notify}
        />
      )}
    </>
  );
}