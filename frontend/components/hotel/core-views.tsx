"use client";

import {
  ArrowRight,
  CalendarDays,
  Check,
  Download,
  Plus,
  X,
} from "lucide-react";
import { useEffect, useState } from "react";
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
} from "@/components/hotel/operations-views";
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

export function CoreHotelViews(props: PlatformViewProps) {
  if (props.view === "Overview") {
    if (props.businessUnit === "TRAVEL")
      return <TravelOverviewView {...props} />;
    if (props.role === "HOUSEKEEPING")
      return <HousekeepingOverviewView {...props} />;
    if (props.role === "RESTAURANT")
      return <RestaurantOverviewView {...props} />;
    return <OverviewView {...props} />;
  }
  if (props.view === "Reservations") return <ReservationsView {...props} />;
  if (props.view === "Connectivity") return <ConnectivityView {...props} />;
  if (props.view === "Front Desk") {
    return props.productionMode ? (
      <ProductionFrontDesk
        openReservation={props.openReservation}
        openStay={props.setSelectedReservation}
        notify={props.notify}
        refreshKey={props.state.reservations
          .map((item) => `${String(item.id)}:${String(item.version)}`)
          .join("|")}
      />
    ) : (
      <FrontDeskView {...props} />
    );
  }
  if (
    props.view === "Guests" ||
    (props.productionMode && props.view === "Guest Profiles")
  ) {
    return props.productionMode ? (
      <ProductionGuests notify={props.notify} role={props.role} />
    ) : (
      <GuestsView {...props} />
    );
  }
  return <FoliosView {...props} />;
}

function TravelOverviewView({ state, setView }: PlatformViewProps) {
  const pending = state.discountRequests.filter(
    (request) => request.status === "PENDING",
  );
  const recent = state.customPackages.slice(0, 4);
  return (
    <>
      <PageHeading
        eyebrow="Travel & Sales workspace"
        title={`Good afternoon, ${state.actor.name.split(" ")[0]}.`}
        description="A dedicated view of inquiries, package design, quote guardrails and discount approvals."
        actions={
          <button
            className="primary-button"
            onClick={() => setView("Packages & Tours")}
          >
            <Plus size={16} /> Build custom package
          </button>
        }
      />
      <section className="kpi-grid overview-kpis travel-kpis">
        <Kpi
          icon={<AppGlyph name="travel" size={31} />}
          label="Active tours"
          value={String(state.travelMetrics.activePackages)}
          detail="Scheduled products"
          meta="Travel inventory only"
          tone="blue"
        />
        <Kpi
          icon={<AppGlyph name="inquiry" size={31} />}
          label="Open inquiries"
          value={String(state.travelMetrics.openInquiries)}
          detail="Across the sales pipeline"
          meta={`${state.travelMetrics.overdueFollowUps} follow-ups due`}
          tone="cyan"
        />
        <Kpi
          icon={<AppGlyph name="folio" size={31} />}
          label="Pipeline value"
          value={money(state.travelMetrics.pipelineValuePaise)}
          detail={`${state.travelMetrics.customQuotes} custom quotes`}
          meta="Calculated from live inquiries"
          tone="emerald"
        />
        <Kpi
          icon={<AppGlyph name="policy" size={31} />}
          label="Approvals"
          value={String(state.travelMetrics.pendingApprovals)}
          detail="Below-floor requests"
          meta="Manager governed"
          tone="violet"
        />
      </section>
      <section className="dashboard-grid overview-grid travel-overview-grid">
        <article className="glass-card">
          <div className="card-heading">
            <div>
              <p className="section-kicker">Recent custom packages</p>
              <h2>Quotes in progress</h2>
            </div>
            <button
              className="text-button"
              onClick={() => setView("Packages & Tours")}
            >
              Open builder <ArrowRight size={14} />
            </button>
          </div>
          {recent.length ? (
            <div className="travel-quote-list">
              {recent.map((item) => (
                <div key={String(item.id)}>
                  <span>
                    <strong>{String(item.name)}</strong>
                    <small>
                      {String(item.reference)} · {String(item.clientName)}
                    </small>
                  </span>
                  <span>
                    <b>{money(item.quotedPricePaise)}</b>
                    <Status value={String(item.status)} />
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <div className="empty-state small">
              <AppGlyph name="travel" size={38} />
              <strong>No custom quotes yet</strong>
              <p>Build the first one from approved assets.</p>
            </div>
          )}
        </article>
        <article className="glass-card">
          <div className="card-heading">
            <div>
              <p className="section-kicker">Manager guardrails</p>
              <h2>Discount approval queue</h2>
            </div>
            <span>{pending.length} pending</span>
          </div>
          {pending.length ? (
            <div className="approval-preview">
              {pending.slice(0, 3).map((request) => (
                <div key={String(request.id)}>
                  <span>
                    <strong>{String(request.packageName)}</strong>
                    <small>
                      {String(request.requestedByName)} requested{" "}
                      {money(request.requestedPricePaise)}
                    </small>
                  </span>
                  <em>
                    {money(
                      Number(request.floorPricePaise) -
                        Number(request.requestedPricePaise),
                    )}{" "}
                    below floor
                  </em>
                </div>
              ))}
            </div>
          ) : (
            <div className="empty-state small">
              <AppGlyph name="policy" size={38} />
              <strong>Pricing is within policy</strong>
              <p>No below-floor approvals are waiting.</p>
            </div>
          )}
        </article>
      </section>
    </>
  );
}

function RestaurantOverviewView({ state, setView, notify }: PlatformViewProps) {
  const [mealFilter, setMealFilter] = useState<"ALL" | MealService>("ALL");
  const [serviceDate, setServiceDate] = useState("2026-08-24");
  const rows = state.restaurantMealBookings.filter(
    (booking) =>
      booking.serviceDate === serviceDate &&
      (mealFilter === "ALL" || booking.mealPeriod === mealFilter),
  );
  const roomCount = new Set(
    rows.map((booking) => String(booking.reservationId)),
  ).size;
  const arrivals = state.restaurantArrivals
    .filter((arrival) => arrival.arrivalDate === serviceDate)
    .map((arrival) => {
      const reservationId = String(arrival.reservationId);
      const bookings = state.restaurantMealBookings.filter(
        (booking) =>
          booking.reservationId === reservationId &&
          booking.serviceDate === serviceDate,
      );
      const dietaryNotes = [
        ...new Set(
          bookings
            .map((booking) => String(booking.dietaryNotes ?? ""))
            .filter(Boolean),
        ),
      ].join("; ");
      return {
        reservationId,
        bookingReference: arrival.bookingReference,
        roomNumber: arrival.roomNumber,
        guestCount: arrival.guestCount,
        dietaryNotes,
        meals: bookings.map((booking) => String(booking.mealPeriod)),
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
            const raw = String(value ?? "");
            const safe = /^[=+\-@]/.test(raw) ? `'${raw}` : raw;
            return `"${safe.replaceAll('"', '""')}"`;
          })
          .join(","),
      )
      .join("\n");
    const name =
      mealFilter === "ALL"
        ? "all-meals"
        : String(mealFilter).toLowerCase().replaceAll("_", "-");
    downloadBlob(
      new Blob([csv], { type: "text/csv;charset=utf-8" }),
      `brainadz-${name}-${serviceDate}.csv`,
    );
    notify(
      `${rows.length} meal booking${rows.length === 1 ? "" : "s"} downloaded.`,
    );
  }
  return (
    <>
      <PageHeading
        eyebrow="Restaurant overview"
        title={`Good afternoon, ${state.actor.name.split(" ")[0]}.`}
        description="Meal commitments, arrivals, orders and restaurant stock in one workspace."
        actions={
          <button
            className="primary-button"
            disabled={!rows.length}
            onClick={downloadMealList}
          >
            <Download size={15} /> Download filtered list
          </button>
        }
      />
      <section className="restaurant-meal-kpis">
        {mealOptions.map((meal) => (
          <button
            key={meal.value}
            className={mealFilter === meal.value ? "active" : ""}
            onClick={() => setMealFilter(meal.value)}
          >
            <span>
              <AppGlyph name={meal.glyph} size={28} />
            </span>
            <small>{meal.label}</small>
            <strong>
              {
                state.restaurantMealBookings.filter(
                  (booking) =>
                    booking.serviceDate === serviceDate &&
                    booking.mealPeriod === meal.value,
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
              <p className="section-kicker">Arrival preparation</p>
              <h2>Arrivals and meal plans · {shortDate(serviceDate)}</h2>
            </div>
            <span>{arrivals.length} rooms</span>
          </div>
          {arrivals.length ? (
            <div className="restaurant-arrival-list">
              {arrivals.map((arrival) => (
                <div key={String(arrival.reservationId)}>
                  <span className="record-icon">
                    <AppGlyph name="arrivals-departures" size={25} />
                  </span>
                  <div>
                    <strong>Room {String(arrival.roomNumber ?? "TBA")}</strong>
                    <small>
                      {String(arrival.bookingReference)} ·{" "}
                      {Number(arrival.guestCount ?? 1)} guest
                      {Number(arrival.guestCount ?? 1) === 1 ? "" : "s"}
                    </small>
                    {Boolean(arrival.dietaryNotes) && (
                      <em>{String(arrival.dietaryNotes)}</em>
                    )}
                  </div>
                  <span className="meal-chip-wrap">
                    {arrival.meals.length ? (
                      arrival.meals.map((meal) => (
                        <i key={meal}>{mealLabel(meal)}</i>
                      ))
                    ) : (
                      <i>No meal booked</i>
                    )}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <div className="empty-state small">
              <AppGlyph name="booking-calendar" size={38} />
              <strong>No arrivals for this date</strong>
            </div>
          )}
        </article>
        <article className="glass-card restaurant-ops-summary">
          <div className="card-heading">
            <div>
              <p className="section-kicker">Restaurant operations</p>
              <h2>Today&apos;s priorities</h2>
            </div>
          </div>
          <button onClick={() => setView("Restaurant Orders")}>
            <AppGlyph name="restaurant" size={25} />
            <span>
              <strong>{state.restaurantOrders.length} service orders</strong>
              <small>Open orders and room service</small>
            </span>
            <ArrowRight size={15} />
          </button>
          <button onClick={() => setView("Inventory")}>
            <AppGlyph name="inventory" size={25} />
            <span>
              <strong>{state.metrics.lowStockCount} low-stock items</strong>
              <small>Kitchen, beverage and supplies</small>
            </span>
            <ArrowRight size={15} />
          </button>
        </article>
      </section>
      <section className="meal-service-section">
        <div className="subsection-heading">
          <div>
            <p className="section-kicker">Downloadable service list</p>
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
              onChange={(event) => setServiceDate(event.target.value)}
            />
          </label>
        </div>
        <div className="toolbar meal-filter-toolbar">
          <div className="segmented">
            <button
              className={mealFilter === "ALL" ? "active" : ""}
              onClick={() => setMealFilter("ALL")}
            >
              All
            </button>
            {mealOptions.map((meal) => (
              <button
                key={meal.value}
                className={mealFilter === meal.value ? "active" : ""}
                onClick={() => setMealFilter(meal.value)}
              >
                {meal.label}
              </button>
            ))}
          </div>
          <span>
            {roomCount} rooms · {rows.length} services
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
                <th>Dietary notes</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((booking) => (
                <tr key={String(booking.id)}>
                  <td>
                    <strong>Room {String(booking.roomNumber ?? "TBA")}</strong>
                  </td>
                  <td>{String(booking.bookingReference)}</td>
                  <td>{mealLabel(booking.mealPeriod)}</td>
                  <td>{Number(booking.guestCount)}</td>
                  <td>{String(booking.dietaryNotes ?? "None recorded")}</td>
                  <td>
                    <Status value={String(booking.status)} />
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

function OverviewView({
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
  const arrivals = state.reservations
    .filter(
      (reservation) =>
        reservation.arrivalDate === "2026-08-24" &&
        reservation.status === "CONFIRMED",
    )
    .slice(0, 4);
  return (
    <>
      <PageHeading
        eyebrow="Hospitality command centre"
        title={`Good afternoon, ${state.actor.name.split(" ")[0]}.`}
        description="One operating picture for hotel and guest operations."
        actions={
          <>
            <span className="date-chip">
              <CalendarDays size={15} /> 24 August 2026
            </span>
            {canCreateReservation && (
              <button className="primary-button" onClick={openReservation}>
                <Plus size={16} />{" "}
                {propertyRestricted ? "Offline walk-in" : "New reservation"}
              </button>
            )}
          </>
        }
      />
      <AvailabilityGrid
        state={state}
        onNewBooking={openReservation}
        restricted={!canCreateReservation}
      />
      <section className="kpi-grid overview-kpis">
        <Kpi
          icon={<AppGlyph name="occupancy" size={31} />}
          label="Occupancy"
          value={`${state.metrics.occupancyPercent}%`}
          detail={`${state.metrics.occupiedRooms} of ${state.metrics.totalRooms} rooms`}
          meta="Calculated from room state"
          tone="blue"
        />
        <Kpi
          icon={<AppGlyph name="room-ready" size={31} />}
          label="Available rooms"
          value={String(state.metrics.availableRooms)}
          detail={`${state.metrics.readyRooms} clean & ready`}
          meta={`${state.metrics.dirtyRooms} need cleaning`}
          tone="cyan"
        />
        <Kpi
          icon={<AppGlyph name="arrivals-departures" size={31} />}
          label="Arrivals / departures"
          value={`${state.metrics.arrivalsToday} / ${state.metrics.departuresToday}`}
          detail={`${state.metrics.inHouseGuests} in-house`}
          meta={`${state.metrics.pendingPayments} balances due`}
          tone="violet"
        />
        <Kpi
          icon={<AppGlyph name="folio" size={31} />}
          label="Hotel revenue"
          value={money(state.metrics.revenuePaise)}
          detail={`ADR ${money(state.metrics.adrPaise)}`}
          meta={`RevPAR ${money(state.metrics.revParPaise)}`}
          tone="emerald"
        />
      </section>
      <section className="dashboard-grid overview-grid">
        <article className="glass-card connectivity-card">
          <div className="card-heading">
            <div>
              <p className="section-kicker">Property connectivity</p>
              <h2>{state.property.name}</h2>
            </div>
            <Status value={state.property.connectionStatus} />
          </div>
          <div className="connectivity-visual">
            <div
              className={`signal-orbit ${state.property.connectionStatus === "OFFLINE" ? "signal-off" : ""}`}
            >
              <AppGlyph
                name={
                  state.property.connectionStatus === "ONLINE"
                    ? "cloud-network"
                    : "offline"
                }
                size={43}
              />
            </div>
            <div>
              <strong>
                {state.property.connectionStatus === "ONLINE"
                  ? "Master Hub connected"
                  : "Property connection unavailable"}
              </strong>
              <p>
                {state.property.connectionStatus === "ONLINE"
                  ? "Reservations, inventory and billing are synchronised."
                  : "Cached existing-guest billing remains available. Cloud mutations are locked."}
              </p>
            </div>
          </div>
          <div className="sync-grid">
            <div>
              <small>Last property sync</small>
              <strong>{dateTime(state.property.lastSyncAt)}</strong>
            </div>
            <div>
              <small>Device</small>
              <strong>Front Desk 01</strong>
            </div>
            <div>
              <small>Offline bills</small>
              <strong>
                {
                  state.offlineBills.filter(
                    (bill) => bill.status !== "VERIFIED",
                  ).length
                }{" "}
                to verify
              </strong>
            </div>
          </div>
          <button
            className={`network-button ${state.property.connectionStatus === "OFFLINE" ? "restore" : ""}`}
            onClick={() =>
              changeNetwork(
                state.property.connectionStatus === "ONLINE"
                  ? "OFFLINE"
                  : "ONLINE",
              )
            }
          >
            <AppGlyph
              name={
                state.property.connectionStatus === "ONLINE"
                  ? "offline"
                  : "cloud-network"
              }
              size={22}
            />
            {state.property.connectionStatus === "ONLINE"
              ? "Simulate hotel offline"
              : "Restore hotel connection"}
          </button>
          <p className="sandbox-note">
            UAT network simulator · hotel session only · Master Hub remains
            online
          </p>
        </article>
        <article className="glass-card arrivals-card">
          <div className="card-heading">
            <div>
              <p className="section-kicker">Front desk flow</p>
              <h2>Today&apos;s arrivals</h2>
            </div>
            <button
              className="text-button"
              onClick={() => setView("Front Desk")}
            >
              View front desk <ArrowRight size={14} />
            </button>
          </div>
          <div className="arrival-list">
            {arrivals.map((arrival) => (
              <ReservationCompact
                key={String(arrival.id)}
                reservation={arrival}
              />
            ))}
          </div>
          <div className="arrival-summary">
            <span>
              <AppGlyph name="room-ready" size={23} />{" "}
              {state.metrics.readyRooms} rooms ready
            </span>
            <span>
              <AppGlyph name="maintenance" size={23} />{" "}
              {state.metrics.unresolvedMaintenance} open ticket
            </span>
            <span>
              <AppGlyph name="wallet-alert" size={23} />{" "}
              {state.metrics.pendingPayments} balances due
            </span>
          </div>
        </article>
      </section>
      <section className="mini-module-grid hotel-module-grid">
        <MiniModule
          icon={<AppGlyph name="restaurant" size={31} />}
          title="Restaurant"
          value={`${state.restaurantOrders.length} orders today`}
          detail="Room posting validated online"
          onClick={() => setView("Restaurant Orders")}
        />
        <MiniModule
          icon={<AppGlyph name="attention-queue" size={31} />}
          title="Attention queue"
          value={`${state.metrics.lowStockCount + state.metrics.unresolvedMaintenance} items`}
          detail="Low stock & maintenance"
          onClick={() => setView("Reports")}
        />
        <MiniModule
          icon={<AppGlyph name="booking-feed" size={31} />}
          title="Booking feed"
          value="Live"
          detail="Front desk, website & OTA"
          onClick={() => setView("Reservations")}
        />
      </section>
      {["OWNER", "MANAGER"].includes(role) && (
        <DamageReviewPanel
          reports={state.damageReports}
          surface={surface}
          command={command}
          refresh={refresh}
          notify={notify}
        />
      )}
    </>
  );
}

function ReservationsView({
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

function ConnectivityView({ state, changeNetwork }: PlatformViewProps) {
  const offlineCreated = state.reservations.filter((reservation) =>
    Boolean(reservation.createdWhilePropertyOffline),
  ).length;
  return (
    <>
      <PageHeading
        eyebrow="Master Hub / Connectivity"
        title="Property connection control"
        description="Monitor registered devices and synchronization health."
      />
      <section className="detail-grid">
        <article className="glass-card connectivity-detail">
          <div className="connectivity-hero">
            <div
              className={`signal-orbit ${state.property.connectionStatus === "OFFLINE" ? "signal-off" : ""}`}
            >
              <AppGlyph
                name={
                  state.property.connectionStatus === "ONLINE"
                    ? "cloud-network"
                    : "offline"
                }
                size={42}
              />
            </div>
            <div>
              <p>{state.property.name}</p>
              <h2>{state.property.connectionStatus}</h2>
              <span>
                Last successful sync {dateTime(state.property.lastSyncAt)}
              </span>
            </div>
          </div>
          <div className="connection-facts">
            <div>
              <small>Cloud reservations since outage</small>
              <strong>{offlineCreated}</strong>
            </div>
            <div>
              <small>Offline bills awaiting review</small>
              <strong>
                {
                  state.offlineBills.filter(
                    (bill) => bill.status !== "VERIFIED",
                  ).length
                }
              </strong>
            </div>
            <div>
              <small>Registered device</small>
              <strong>BHZ-FD01</strong>
            </div>
          </div>
          <button
            className={`network-button ${state.property.connectionStatus === "OFFLINE" ? "restore" : ""}`}
            onClick={() =>
              changeNetwork(
                state.property.connectionStatus === "ONLINE"
                  ? "OFFLINE"
                  : "ONLINE",
              )
            }
          >
            {state.property.connectionStatus === "ONLINE"
              ? "Put hotel terminal offline"
              : "Reconnect property terminal"}
          </button>
        </article>
        <article className="glass-card architecture-card">
          <p className="section-kicker">Authority model</p>
          <h2>One source of truth</h2>
          <div className="authority-flow">
            <div>
              <AppGlyph name="cloud-network" size={26} />
              <span>
                <strong>Master Hub</strong>
                <small>Reservations · inventory · payments</small>
              </span>
            </div>
            <ArrowRight size={18} />
            <div>
              <AppGlyph name="hotel" size={26} />
              <span>
                <strong>Hotel online</strong>
                <small>Normal PMS operations</small>
              </span>
            </div>
            <ArrowRight size={18} />
            <div>
              <AppGlyph name="offline" size={26} />
              <span>
                <strong>Hotel offline</strong>
                <small>Cached stays, local walk-ins and PDF billing</small>
              </span>
            </div>
          </div>
          <div className="control-note">
            <AppGlyph name="policy" size={25} />
            <span>
              <strong>Controlled reconciliation</strong>
              <small>
                Local documents and walk-ins are reviewed after reconnection.
              </small>
            </span>
          </div>
        </article>
      </section>
    </>
  );
}

function FrontDeskView(props: PlatformViewProps) {
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

function GuestsView({ state, setSelectedReservation }: PlatformViewProps) {
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

function FoliosView({
  state,
  setSelectedReservation,
  productionMode,
  role,
  refresh,
  notify,
}: PlatformViewProps) {
  const [selected, setSelected] = useState<Row | null>(null);
  const [busy, setBusy] = useState(false);
  const reservationMap = new Map(
    state.reservations.map((reservation) => [
      String(reservation.id),
      reservation,
    ]),
  );
  async function open(folio: Row) {
    if (!productionMode) {
      const reservation = reservationMap.get(String(folio.reservationId));
      if (reservation) setSelectedReservation(reservation);
      return;
    }
    try {
      setBusy(true);
      setSelected(await productionApi(`/api/folios/${String(folio.id)}`));
    } catch (cause) {
      notify(
        cause instanceof Error ? cause.message : "Folio could not be loaded.",
      );
    } finally {
      setBusy(false);
    }
  }
  async function action(path: string, body: Row = {}) {
    if (!selected) return;
    try {
      setBusy(true);
      await productionApi(path, { method: "POST", body: JSON.stringify(body) });
      setSelected(
        await productionApi(
          `/api/folios/${String((selected.folio as Row).id)}`,
        ),
      );
      await refresh();
      notify("Financial ledger updated.");
    } catch (cause) {
      notify(
        cause instanceof Error ? cause.message : "Financial operation failed.",
      );
    } finally {
      setBusy(false);
    }
  }
  const detail = selected?.folio as Row | undefined;
  const lines = (selected?.lines ?? []) as Row[];
  const payments = (selected?.payments ?? []) as Row[];
  const refunds = (selected?.refunds ?? []) as Row[];
  const invoices = (selected?.invoices ?? []) as Row[];
  return (
    <>
      <PageHeading
        eyebrow="Hotel / Billing"
        title="Folios & billing"
        description="Backend-calculated charges, GST, payments, refunds, invoices and outstanding balances."
      />
      <div className="table-card">
        <table>
          <thead>
            <tr>
              <th>Folio</th>
              <th>Guest / booking</th>
              <th>Gross</th>
              <th>Discount</th>
              <th>Tax</th>
              <th>Paid</th>
              <th>Outstanding</th>
              <th>Status</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {state.folios.map((folio) => {
              const reservation = reservationMap.get(
                String(folio.reservationId),
              );
              return (
                <tr key={String(folio.id)}>
                  <td>
                    <strong>{String(folio.id).slice(0, 16)}</strong>
                    <small>Version {Number(folio.version)}</small>
                  </td>
                  <td>
                    {String(reservation?.guestName ?? "Restricted")}
                    <small>{String(reservation?.reference ?? "")}</small>
                  </td>
                  <td>{money(folio.subtotalPaise)}</td>
                  <td>{money(folio.discountPaise ?? 0)}</td>
                  <td>{money(folio.taxPaise)}</td>
                  <td>{money(folio.paidPaise ?? 0)}</td>
                  <td>
                    <strong>
                      {money(folio.outstandingPaise ?? folio.totalPaise)}
                    </strong>
                  </td>
                  <td>
                    <Status value={String(folio.status)} />
                  </td>
                  <td>
                    <button
                      className="row-action"
                      disabled={busy}
                      onClick={() => void open(folio)}
                    >
                      Open ledger
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {detail && (
        <div className="modal-backdrop">
          <section className="modal-card reservation-modal">
            <div className="modal-heading">
              <div>
                <p className="section-kicker">
                  {String((selected?.reservation as Row)?.reference ?? "Folio")}
                </p>
                <h2>Financial folio</h2>
                <p>
                  {String((selected?.guest as Row)?.fullName ?? "Guest")} · Room{" "}
                  {String((selected?.room as Row)?.number ?? "TBA")}
                </p>
              </div>
              <button className="icon-button" onClick={() => setSelected(null)}>
                <X size={17} />
              </button>
            </div>
            <div className="table-card embedded-table">
              <table>
                <thead>
                  <tr>
                    <th>Posted</th>
                    <th>Charge</th>
                    <th>Taxable</th>
                    <th>GST</th>
                    <th>Total</th>
                  </tr>
                </thead>
                <tbody>
                  {lines.map((line) => (
                    <tr key={String(line.id)}>
                      <td>{shortDate(line.serviceDate ?? line.createdAt)}</td>
                      <td>
                        {String(line.description)}
                        <small>
                          {String(line.category).replaceAll("_", " ")}
                        </small>
                      </td>
                      <td>{money(line.taxableAmountPaise)}</td>
                      <td>{money(line.taxPaise)}</td>
                      <td>{money(line.lineTotalPaise)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="bill-total">
              <span>
                <small>Gross charges</small>
                <strong>{money(detail.subtotalPaise)}</strong>
              </span>
              <span>
                <small>Discount</small>
                <strong>{money(detail.discountPaise)}</strong>
              </span>
              <span>
                <small>Taxable</small>
                <strong>{money(detail.taxableAmountPaise)}</strong>
              </span>
              <span>
                <small>CGST / SGST / IGST</small>
                <strong>
                  {money(detail.cgstPaise)} / {money(detail.sgstPaise)} /{" "}
                  {money(detail.igstPaise)}
                </strong>
              </span>
              <span>
                <small>Net charges</small>
                <strong>{money(detail.totalPaise)}</strong>
              </span>
              <span>
                <small>Outstanding</small>
                <strong>{money(detail.outstandingPaise)}</strong>
              </span>
            </div>
            <section className="drawer-folio">
              <div className="card-heading">
                <h3>Payments & refunds</h3>
                <strong>{money(detail.paidPaise)}</strong>
              </div>
              {payments.map((payment) => (
                <div key={String(payment.id)}>
                  <span>
                    {String(payment.paymentNumber)} · {String(payment.method)} ·{" "}
                    {String(payment.status)}
                  </span>
                  <strong>{money(payment.amountPaise)}</strong>
                  {productionMode &&
                    payment.status === "RECEIVED" &&
                    roleCan(role, "billing.reverse_payment") && (
                      <button
                        className="row-action"
                        onClick={() =>
                          void action(
                            `/api/payments/${String(payment.id)}/reverse`,
                            {
                              reason:
                                "Correction approved in billing workspace",
                            },
                          )
                        }
                      >
                        Reverse
                      </button>
                    )}
                  {payment.status === "RECEIVED" &&
                    roleCan(role, "billing.refund") && (
                      <button
                        className="row-action"
                        onClick={() => {
                          const amount = Number(
                            window.prompt("Refund amount in rupees", "100"),
                          );
                          const reason = window.prompt(
                            "Refund reason",
                            "Approved refund",
                          );
                          if (amount > 0 && reason)
                            void action(
                              `/api/payments/${String(payment.id)}/refund`,
                              {
                                amountPaise: Math.round(amount * 100),
                                reason,
                                idempotencyKey: crypto.randomUUID(),
                              },
                            );
                        }}
                      >
                        Refund
                      </button>
                    )}
                  <a
                    className="row-action"
                    href={apiUrl(`/api/payments/${String(payment.id)}/receipt`)}
                    target="_blank"
                  >
                    Receipt
                  </a>
                </div>
              ))}
              {refunds.map((refund) => (
                <div key={String(refund.id)}>
                  <span>Refund · {String(refund.reason)}</span>
                  <strong>{money(refund.amountPaise)}</strong>
                </div>
              ))}
            </section>
            <div className="drawer-actions">
              <button
                className="secondary-button"
                disabled={busy}
                onClick={() =>
                  void action(`/api/folios/${String(detail.id)}/room-charges`)
                }
              >
                Post due room charges
              </button>
              {roleCan(role, "billing.post_charge") && (
                <button
                  className="secondary-button"
                  disabled={busy}
                  onClick={() => {
                    const amount = Number(
                      window.prompt("Charge amount in rupees", "500"),
                    );
                    if (amount > 0)
                      void action(`/api/folios/${String(detail.id)}/charges`, {
                        category: "OTHER_SERVICE",
                        description: "Other service",
                        quantity: 1,
                        unitAmountPaise: Math.round(amount * 100),
                        idempotencyKey: crypto.randomUUID(),
                      });
                  }}
                >
                  Add charge
                </button>
              )}
              {roleCan(role, "billing.take_payment") && (
                <button
                  className="primary-button"
                  disabled={busy}
                  onClick={() => {
                    const amount = Number(
                      window.prompt(
                        "Payment amount in rupees",
                        String(Number(detail.outstandingPaise) / 100),
                      ),
                    );
                    if (amount > 0)
                      void action(`/api/folios/${String(detail.id)}/payments`, {
                        method: "UPI",
                        amountPaise: Math.round(amount * 100),
                        idempotencyKey: crypto.randomUUID(),
                      });
                  }}
                >
                  Add payment
                </button>
              )}
              {roleCan(role, "billing.discount") && (
                <button
                  className="secondary-button"
                  disabled={busy}
                  onClick={() => {
                    const amount = Number(
                      window.prompt("Fixed discount in rupees", "500"),
                    );
                    const reason = window.prompt(
                      "Discount reason",
                      "Manager-approved service recovery",
                    );
                    if (amount > 0 && reason)
                      void action(
                        `/api/folios/${String(detail.id)}/discounts`,
                        {
                          kind: "FIXED",
                          amountPaise: Math.round(amount * 100),
                          reason,
                          idempotencyKey: crypto.randomUUID(),
                        },
                      );
                  }}
                >
                  Apply discount
                </button>
              )}
              {roleCan(role, "billing.invoice") && (
                <button
                  className="primary-button"
                  disabled={busy}
                  onClick={() =>
                    void action(`/api/folios/${String(detail.id)}/invoice`)
                  }
                >
                  Generate invoice
                </button>
              )}
              {roleCan(role, "billing.checkout") && (
                <button
                  className="primary-button"
                  disabled={busy}
                  onClick={() =>
                    void action(
                      `/api/reservations/${String(detail.reservationId)}/financial-checkout`,
                    )
                  }
                >
                  Checkout
                </button>
              )}
              {roleCan(role, "billing.override_checkout") &&
                Number(detail.outstandingPaise) > 0 && (
                  <button
                    className="secondary-button"
                    disabled={busy}
                    onClick={() => {
                      const reason = window.prompt(
                        "Reason for unpaid checkout override",
                      );
                      if (reason)
                        void action(
                          `/api/reservations/${String(detail.reservationId)}/financial-checkout`,
                          { allowOutstanding: true, overrideReason: reason },
                        );
                    }}
                  >
                    Override unpaid checkout
                  </button>
                )}
            </div>
            {invoices.map((invoice) => (
              <a
                key={String(invoice.id)}
                className="primary-button full-button"
                href={apiUrl(`/api/invoices/${String(invoice.id)}/pdf`)}
                target="_blank"
              >
                <Download size={16} /> Download {String(invoice.invoiceNumber)}
              </a>
            ))}
          </section>
        </div>
      )}
    </>
  );
}
