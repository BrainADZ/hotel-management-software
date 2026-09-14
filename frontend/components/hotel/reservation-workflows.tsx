"use client";

import { Check, IndianRupee, X } from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";
import { calculateStayNights } from "@hotel/shared/domain";
import type { MealService } from "@/lib/offline-db";
import { ProductionReservationGuests } from "@/app/production-front-desk";
import { DamageChargeModal } from "@/components/hotel/HousekeepingView";
import {
  AppGlyph,
  InspectionStatusBadge,
  Status,
  dateTime,
  money,
  mealLabel,
  mealOptions,
  inspectionPresentation,
  productionApi,
  shortDate,
  type DemoState,
  type ReservationInspectionSummary,
  type Row,
  type Surface,
} from "@/app/hotel-platform";

export function ReservationModal({
  state,
  surface,
  offlineLocal,
  productionMode,
  onClose,
  onSubmit,
}: {
  state: DemoState;
  surface: Surface;
  offlineLocal: boolean;
  productionMode: boolean;
  onClose: () => void;
  onSubmit: (form: Row) => Promise<void>;
}) {
  const firstRoom = state.rooms[0];
  const propertyToday = productionMode
    ? new Intl.DateTimeFormat("en-CA", {
        timeZone: String(state.property.timezone ?? "Asia/Kolkata"),
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }).format(new Date())
    : "2026-08-27";
  const propertyTomorrowDate = new Date(`${propertyToday}T00:00:00Z`);
  propertyTomorrowDate.setUTCDate(propertyTomorrowDate.getUTCDate() + 1);
  const propertyTomorrow = productionMode
    ? propertyTomorrowDate.toISOString().slice(0, 10)
    : "2026-08-29";
  const [form, setForm] = useState({
    guestName: "Rohit Sharma",
    email: "rohit.sharma@example.in",
    phone: "+91 98100 44556",
    city: "Pune",
    dietaryRequirements: "",
    guestCount: 1,
    children: 0,
    arrivalDate: propertyToday,
    departureDate: propertyTomorrow,
    roomId: String(firstRoom?.id ?? ""),
    roomType: String(firstRoom?.roomType ?? "Deluxe"),
    nightlyRatePaise: Number(firstRoom?.baseRatePaise ?? 0),
    taxRateBps: 0,
    source: "DIRECT",
    specialRequests: "",
    internalNotes: "",
    mealPlan: ["BREAKFAST"] as MealService[],
  });
  const [busy, setBusy] = useState(false);
  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    try {
      await onSubmit(form);
    } finally {
      setBusy(false);
    }
  }
  function toggleMeal(value: MealService) {
    setForm((current) => ({
      ...current,
      mealPlan: current.mealPlan.includes(value)
        ? current.mealPlan.filter((item) => item !== value)
        : [...current.mealPlan, value],
    }));
  }
  return (
    <div
      className="modal-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <form className="modal-card" onSubmit={submit}>
        <div className="modal-heading">
          <div>
            <p className="section-kicker">
              {offlineLocal
                ? "Offline front desk"
                : surface === "MASTER_HUB"
                  ? "Master Hub"
                  : "Property PMS"}{" "}
              · Walk-in desk
            </p>
            <h2>{offlineLocal ? "Save offline walk-in" : "New reservation"}</h2>
            <p>
              {offlineLocal
                ? "The reservation will be stored on this device and synchronized automatically after reconnection."
                : state.property.connectionStatus === "OFFLINE" &&
                    surface === "MASTER_HUB"
                  ? "The Master Hub can continue accepting bookings while the property reconnects."
                  : "Front-desk bookings are created here; website and OTA bookings arrive through the connected feed."}
            </p>
          </div>
          <button type="button" className="icon-button" onClick={onClose}>
            <X size={17} />
          </button>
        </div>
        {offlineLocal && (
          <div className="local-save-callout">
            <AppGlyph name="offline" size={25} />
            <span>
              <strong>Device-local reservation</strong>
              <small>
                Room allocation is provisional until Master Hub synchronization.
              </small>
            </span>
          </div>
        )}
        <div className="form-grid">
          <label className="wide">
            <span>Guest name</span>
            <input
              required
              value={form.guestName}
              onChange={(event) =>
                setForm({ ...form, guestName: event.target.value })
              }
            />
          </label>
          <label>
            <span>Email</span>
            <input
              type="email"
              value={form.email}
              onChange={(event) =>
                setForm({ ...form, email: event.target.value })
              }
            />
          </label>
          <label>
            <span>Phone</span>
            <input
              value={form.phone}
              onChange={(event) =>
                setForm({ ...form, phone: event.target.value })
              }
            />
          </label>
          <label>
            <span>City</span>
            <input
              value={form.city}
              onChange={(event) =>
                setForm({ ...form, city: event.target.value })
              }
            />
          </label>
          <label>
            <span>Guests</span>
            <input
              type="number"
              min="1"
              max="12"
              value={form.guestCount}
              onChange={(event) =>
                setForm({ ...form, guestCount: Number(event.target.value) })
              }
            />
          </label>
          <label>
            <span>Arrival</span>
            <input
              type="date"
              value={form.arrivalDate}
              onChange={(event) =>
                setForm({ ...form, arrivalDate: event.target.value })
              }
            />
          </label>
          <label>
            <span>Departure</span>
            <input
              type="date"
              value={form.departureDate}
              onChange={(event) =>
                setForm({ ...form, departureDate: event.target.value })
              }
            />
          </label>
          <label>
            <span>Room type</span>
            <select
              value={form.roomType}
              onChange={(event) =>
                setForm({ ...form, roomType: event.target.value })
              }
            >
              {["Standard", "Deluxe", "Premium", "Suite"].map((item) => (
                <option key={item}>{item}</option>
              ))}
            </select>
          </label>
          {productionMode && (
            <>
              <label>
                <span>Children</span>
                <input
                  type="number"
                  min="0"
                  max="20"
                  value={form.children}
                  onChange={(event) =>
                    setForm({ ...form, children: Number(event.target.value) })
                  }
                />
              </label>
              <label>
                <span>Room</span>
                <select
                  required
                  value={form.roomId}
                  onChange={(event) => {
                    const room = state.rooms.find(
                      (item) => String(item.id) === event.target.value,
                    );
                    setForm({
                      ...form,
                      roomId: event.target.value,
                      roomType: String(room?.roomType ?? ""),
                      nightlyRatePaise: Number(room?.baseRatePaise ?? 0),
                    });
                  }}
                >
                  {state.rooms.map((room) => (
                    <option key={String(room.id)} value={String(room.id)}>
                      Room {String(room.number)} · {String(room.roomType)}
                    </option>
                  ))}
                </select>
              </label>
              <label>
  <span>Nightly rate (₹)</span>

  <input
    type="number"
    min="0"
    step="1"
    value={Number(form.nightlyRatePaise ?? 0) / 100}
    onChange={(event) => {
      const rupees = Number(event.target.value || 0);

      setForm({
        ...form,
        nightlyRatePaise: Math.round(rupees * 100),
      });
    }}
  />
</label>
              <label>
                <span>Source</span>
                <select
                  value={form.source}
                  onChange={(event) =>
                    setForm({ ...form, source: event.target.value })
                  }
                >
                  {[
                    "DIRECT",
                    "WALK_IN",
                    "PHONE",
                    "WEBSITE",
                    "OTA",
                    "TRAVEL_AGENT",
                    "CORPORATE",
                    "OTHER",
                  ].map((item) => (
                    <option key={item}>{item}</option>
                  ))}
                </select>
              </label>
              <label className="wide">
                <span>Special requests</span>
                <input
                  value={form.specialRequests}
                  onChange={(event) =>
                    setForm({ ...form, specialRequests: event.target.value })
                  }
                />
              </label>
              <label className="wide">
                <span>Internal notes</span>
                <input
                  value={form.internalNotes}
                  onChange={(event) =>
                    setForm({ ...form, internalNotes: event.target.value })
                  }
                />
              </label>
            </>
          )}
          <label className="wide">
            <span>Dietary notes</span>
            <input
              value={form.dietaryRequirements}
              onChange={(event) =>
                setForm({ ...form, dietaryRequirements: event.target.value })
              }
              placeholder="Allergies or dietary preferences"
            />
          </label>
          <fieldset className="wide meal-selector">
            <legend>Meal bookings</legend>
            <div>
              {mealOptions.map((item) => (
                <button
                  type="button"
                  key={item.value}
                  className={
                    form.mealPlan.includes(item.value) ? "selected" : ""
                  }
                  onClick={() => toggleMeal(item.value)}
                >
                  <Check size={13} /> {item.label}
                </button>
              ))}
            </div>
          </fieldset>
          <label>
            <span>Booking source</span>
            <input
              value={offlineLocal ? "OFFLINE WALK-IN" : "FRONT DESK"}
              readOnly
            />
          </label>
        </div>
        <div className="modal-actions">
          <button type="button" className="secondary-button" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="primary-button" disabled={busy}>
            {busy
              ? "Saving…"
              : offlineLocal
                ? "Save on this device"
                : "Create reservation"}
          </button>
        </div>
      </form>
    </div>
  );
}

export function StayDrawer({
  reservation,
  state,
  restricted,
  surface,
  productionMode,
  notify,
  onClose,
  onCommand,
}: {
  reservation: Row;
  state: DemoState;
  restricted: boolean;
  surface: Surface;
  productionMode: boolean;
  notify: (message: string) => void;
  onClose: () => void;
  onCommand: (payload: Row, message: string) => Promise<void>;
}) {
  const folio = state.folios.find(
    (item) => item.reservationId === reservation.id,
  );
  const lines = state.folioLines.filter((line) => line.folioId === folio?.id);
  const inspection = (state.reservationInspectionSummaries ?? []).find(
    (item) => String(item.reservationId) === String(reservation.id),
  );
  const [charging, setCharging] = useState(false);
  const [history, setHistory] = useState<Row[]>([]);
  useEffect(() => {
    if (!productionMode) return;
    void productionApi(`/api/reservations/${String(reservation.id)}/history`)
      .then((body) => setHistory(body.items as Row[]))
      .catch(() => setHistory([]));
  }, [productionMode, reservation.id]);
  const canReviewDamage =
    ["OWNER", "MANAGER"].includes(state.actor.role) &&
    inspection?.damageStatus === "PENDING_REVIEW" &&
    Number(inspection.damageVersion) > 0;
  return (
    <>
      <div
        className="drawer-backdrop"
        onMouseDown={(event) => {
          if (event.target === event.currentTarget) onClose();
        }}
      >
        <aside className="stay-drawer">
          <div className="drawer-heading">
            <div>
              <p className="section-kicker">{String(reservation.reference)}</p>
              <h2>{String(reservation.guestName)}</h2>
              <span>
                {reservation.roomNumber
                  ? `Room ${String(reservation.roomNumber)}`
                  : "Provisional room"}{" "}
                · {String(reservation.roomType)}
              </span>
            </div>
            <button className="icon-button" onClick={onClose}>
              <X size={17} />
            </button>
          </div>
          <div className="guest-summary">
            <span className="record-icon large" aria-hidden="true">
              <AppGlyph name="guest" size={37} />
            </span>
            <div>
              <strong>{String(reservation.phone ?? "No phone")}</strong>
              <small>{String(reservation.email ?? "No email")}</small>
              <small>
                {String(reservation.preferences ?? "No preferences")} ·{" "}
                {String(reservation.dietaryRequirements ?? "No dietary notes")}
              </small>
            </div>
          </div>
          <div className="stay-facts">
            <span>
              <small>Arrival</small>
              <strong>{shortDate(reservation.arrivalDate)}</strong>
            </span>
            <span>
              <small>Departure</small>
              <strong>{shortDate(reservation.departureDate)}</strong>
            </span>
            <span>
              <small>Duration</small>
              <strong>
                {calculateStayNights(
                  String(reservation.arrivalDate),
                  String(reservation.departureDate),
                )}{" "}
                nights
              </strong>
            </span>
            <span>
              <small>Status</small>
              <Status value={String(reservation.status)} />
            </span>
          </div>
          {(inspection || reservation.status === "CHECKED_OUT") && (
            <ReservationInspectionCard
              summary={inspection}
              reservationStatus={String(reservation.status)}
              canReview={canReviewDamage}
              restricted={restricted}
              onCharge={() => setCharging(true)}
              onWaive={() =>
                inspection &&
                onCommand(
                  {
                    action: "RESOLVE_DAMAGE_REPORT",
                    reportId: inspection.damageReportId,
                    expectedVersion: inspection.damageVersion,
                    decision: "WAIVE",
                    decisionNote: "No guest charge after manager review.",
                    surface,
                  },
                  `Damage report for room ${reservation.roomNumber} closed without a guest charge.`,
                )
              }
            />
          )}
          {Array.isArray(reservation.mealPlan) &&
            reservation.mealPlan.length > 0 && (
              <div className="drawer-meals">
                <small>Meal bookings</small>
                <span>
                  {(reservation.mealPlan as MealService[]).map((meal) => (
                    <i key={meal}>{mealLabel(meal)}</i>
                  ))}
                </span>
              </div>
            )}
          {folio && (
            <section className="drawer-folio">
              <div className="card-heading">
                <h3>Guest folio</h3>
                <strong>{money(folio.totalPaise)}</strong>
              </div>
              {lines.map((line) => (
                <div key={String(line.id)}>
                  <span>{String(line.description)}</span>
                  <strong>{money(line.lineTotalPaise)}</strong>
                </div>
              ))}
              <div className="folio-total">
                <span>Tax</span>
                <strong>{money(folio.taxPaise)}</strong>
              </div>
              <div className="folio-total grand">
                <span>Total</span>
                <strong>{money(folio.totalPaise)}</strong>
              </div>
            </section>
          )}
          {productionMode && (
            <section className="drawer-folio">
              <div className="card-heading">
                <h3>Reservation details</h3>
                <strong>{money(reservation.estimatedTotalPaise)}</strong>
              </div>
              <div>
                <span>Guests</span>
                <strong>
                  {String(reservation.adults ?? 1)} adults ·{" "}
                  {String(reservation.children ?? 0)} children
                </strong>
              </div>
              <div>
                <span>Nightly rate</span>
                <strong>{money(reservation.nightlyRatePaise)}</strong>
              </div>
              <div>
                <span>Source</span>
                <strong>{String(reservation.source)}</strong>
              </div>
              <div>
                <span>Special requests</span>
                <strong>{String(reservation.specialRequests ?? "None")}</strong>
              </div>
              <div>
                <span>Internal notes</span>
                <strong>{String(reservation.internalNotes ?? "None")}</strong>
              </div>
            </section>
          )}
          {productionMode && history.length > 0 && (
            <section className="drawer-folio">
              <div className="card-heading">
                <h3>Activity</h3>
                <strong>{history.length} events</strong>
              </div>
              {history.map((event) => (
                <div key={String(event.id)}>
                  <span>{String(event.eventType).replaceAll("_", " ")}</span>
                  <strong>{dateTime(event.createdAt)}</strong>
                </div>
              ))}
            </section>
          )}
          {productionMode && (
            <ProductionReservationGuests
              reservationId={String(reservation.id)}
              notify={notify}
            />
          )}
          {productionMode && (
            <ProductionReservationActions
              reservation={reservation}
              rooms={state.rooms}
              canRestore={["OWNER", "MANAGER"].includes(state.actor.role)}
              onCommand={onCommand}
            />
          )}
          {restricted && (
            <div className="offline-form-lock">
              <AppGlyph name="offline" size={25} />
              <span>
                <strong>Saved locally</strong>
                <small>
                  Cloud actions will be available after synchronization.
                </small>
              </span>
            </div>
          )}
          <div className="drawer-actions">
            {!productionMode &&
              reservation.status === "CONFIRMED" &&
              !reservation.localOnly && (
                <button
                  className="primary-button"
                  disabled={restricted}
                  title={
                    restricted ? "Requires Master Hub connection" : undefined
                  }
                  onClick={() =>
                    onCommand(
                      {
                        action: "CHECK_IN",
                        reservationId: reservation.id,
                        surface,
                      },
                      `${reservation.guestName} checked in.`,
                    )
                  }
                >
                  Check in
                </button>
              )}
            {!productionMode && reservation.status === "CHECKED_IN" && (
              <>
                <button
                  className="secondary-button"
                  disabled={restricted}
                  title={
                    restricted ? "Requires Master Hub connection" : undefined
                  }
                  onClick={() =>
                    onCommand(
                      {
                        action: "POST_RESTAURANT",
                        reservationId: reservation.id,
                        amountPaise: 135000,
                        surface,
                      },
                      "Room-service charge posted to the current folio.",
                    )
                  }
                >
                  Post ₹1,350 room service
                </button>
                <button
                  className="primary-button"
                  disabled={restricted}
                  title={
                    restricted ? "Requires Master Hub connection" : undefined
                  }
                  onClick={() =>
                    onCommand(
                      {
                        action: "CHECK_OUT",
                        reservationId: reservation.id,
                        surface,
                      },
                      `${reservation.guestName} checked out; room inspection created.`,
                    )
                  }
                >
                  Check out
                </button>
              </>
            )}
          </div>
        </aside>
      </div>
      {charging && inspection && (
        <DamageChargeModal
          report={inspection}
          onClose={() => setCharging(false)}
          onSave={(details) =>
            onCommand(
              {
                action: "RESOLVE_DAMAGE_REPORT",
                reportId: inspection.damageReportId,
                expectedVersion: inspection.damageVersion,
                decision: "POST_CHARGE",
                surface,
                ...details,
              },
              `Policy-based damage charge posted for room ${reservation.roomNumber}.`,
            )
          }
        />
      )}
    </>
  );
}

function ProductionReservationActions({
  reservation,
  rooms,
  canRestore,
  onCommand,
}: {
  reservation: Row;
  rooms: Row[];
  canRestore: boolean;
  onCommand: (
    payload: Row,
    message: string,
  ) => Promise<void>;
}) {
  const status = String(
    reservation.status,
  );

  const [dialog, setDialog] =
    useState<
      | "EDIT"
      | "DATES"
      | "EXTEND_STAY"
      | "SHORTEN_STAY"
      | "CHANGE_ROOM"
      | "MOVE_ROOM"
      | "UPGRADE_ROOM"
      | "CANCEL"
      | null
    >(null);

  const [form, setForm] =
    useState<Row>({});

  const run = (
    type: string,
    details: Row = {},
  ) =>
    onCommand(
      {
        action: type,
        type,
        reservationId:
          reservation.id,
        ...details,
      },
      `${String(
        reservation.reference,
      )} updated.`,
    );

  const open = (
    next: NonNullable<
      typeof dialog
    >,
  ) => {
    const firstAlternativeRoom =
      rooms.find(
        (room) =>
          String(room.id) !==
          String(
            reservation.roomId,
          ),
      );

    const roomAction =
      next === "CHANGE_ROOM" ||
      next === "MOVE_ROOM" ||
      next === "UPGRADE_ROOM";

    setForm({
      adults:
        reservation.adults ?? 1,

      children:
        reservation.children ?? 0,

      specialRequests:
        reservation.specialRequests ??
        "",

      internalNotes:
        reservation.internalNotes ??
        "",

      arrivalDate:
        reservation.arrivalDate,

      departureDate:
        reservation.departureDate,

      roomId: roomAction
        ? firstAlternativeRoom?.id ??
          ""
        : reservation.roomId ??
          "",

      reason: "",
    });

    setDialog(next);
  };

  async function submit(
    event: FormEvent,
  ) {
    event.preventDefault();

    if (!dialog) {
      return;
    }

    if (dialog === "EDIT") {
      await onCommand(
        {
          action:
            "EDIT_RESERVATION",

          reservationId:
            reservation.id,

          changes: {
            adults: Number(
              form.adults,
            ),

            children: Number(
              form.children,
            ),

            specialRequests:
              form.specialRequests,

            internalNotes:
              form.internalNotes,
          },
        },
        "Reservation details updated.",
      );
    } else if (
      dialog === "DATES"
    ) {
      await run(
        "CHANGE_DATES",
        {
          arrivalDate:
            form.arrivalDate,

          departureDate:
            form.departureDate,
        },
      );
    } else if (
      dialog ===
        "EXTEND_STAY" ||
      dialog ===
        "SHORTEN_STAY"
    ) {
      await run(dialog, {
        departureDate:
          form.departureDate,
      });
    } else if (
      dialog === "MOVE_ROOM"
    ) {
      const room = rooms.find(
        (item) =>
          String(item.id) ===
          String(form.roomId),
      );

      if (!room) {
        return;
      }

      await run("MOVE_ROOM", {
        roomId: room.id,

        reason: String(
          form.reason ?? "",
        ).trim(),
      });
    } else if (
      dialog ===
        "CHANGE_ROOM" ||
      dialog ===
        "UPGRADE_ROOM"
    ) {
      const room = rooms.find(
        (item) =>
          String(item.id) ===
          String(form.roomId),
      );

      if (!room) {
        return;
      }

      await run(dialog, {
        roomId: room.id,
        roomType:
          room.roomType,
      });
    } else if (
      dialog === "CANCEL"
    ) {
      await run("CANCEL", {
        reason: form.reason,
      });
    }

    setDialog(null);
  }

  const destinationRooms =
    rooms.filter(
      (room) =>
        String(room.id) !==
        String(
          reservation.roomId,
        ),
    );

  return (
    <>
      <div className="drawer-actions">
        {[
          "PENDING",
          "HOLD",
          "CONFIRMED",
          "CHECKED_IN",
        ].includes(status) && (
          <button
            className="secondary-button"
            onClick={() =>
              open("EDIT")
            }
          >
            {status ===
            "CHECKED_IN"
              ? "Edit guest count / notes"
              : "Edit reservation"}
          </button>
        )}

        {[
          "PENDING",
          "CONFIRMED",
        ].includes(status) && (
          <button
            className="secondary-button"
            onClick={() =>
              open("DATES")
            }
          >
            Change dates
          </button>
        )}

        {[
          "PENDING",
          "CONFIRMED",
        ].includes(status) && (
          <button
            className="secondary-button"
            onClick={() =>
              open("CHANGE_ROOM")
            }
          >
            Change room
          </button>
        )}

        {status ===
          "CHECKED_IN" && (
          <button
            className="secondary-button"
            onClick={() =>
              open("MOVE_ROOM")
            }
          >
            Move room
          </button>
        )}

        {[
          "PENDING",
          "CONFIRMED",
        ].includes(status) && (
          <button
            className="secondary-button"
            onClick={() =>
              open("UPGRADE_ROOM")
            }
          >
            Upgrade
          </button>
        )}

        {status ===
          "CHECKED_IN" && (
          <>
            <button
              className="secondary-button"
              onClick={() =>
                open(
                  "EXTEND_STAY",
                )
              }
            >
              Extend stay
            </button>

            <button
              className="secondary-button"
              onClick={() =>
                open(
                  "SHORTEN_STAY",
                )
              }
            >
              Shorten stay
            </button>
          </>
        )}

        {[
          "PENDING",
          "CONFIRMED",
        ].includes(status) && (
          <button
            className="secondary-button"
            onClick={() =>
              void run(
                "PLACE_HOLD",
              )
            }
          >
            Place hold
          </button>
        )}

        {status === "HOLD" && (
          <button
            className="primary-button"
            onClick={() =>
              void run(
                "RELEASE_HOLD",
              )
            }
          >
            Release hold
          </button>
        )}

        {[
          "PENDING",
          "HOLD",
          "CONFIRMED",
        ].includes(status) && (
          <button
            className="secondary-button"
            onClick={() =>
              open("CANCEL")
            }
          >
            Cancel
          </button>
        )}

        {status ===
          "CONFIRMED" && (
          <>
            <button
              className="secondary-button"
              onClick={() =>
                void run(
                  "MARK_NO_SHOW",
                )
              }
            >
              Mark no-show
            </button>

            <button
              className="primary-button"
              onClick={() =>
                void run(
                  "CHECK_IN",
                )
              }
            >
              Check in
            </button>
          </>
        )}

        {status ===
          "CHECKED_IN" && (
          <button
            className="primary-button"
            onClick={() =>
              void run(
                "CHECK_OUT",
              )
            }
          >
            Check out
          </button>
        )}

        {canRestore &&
          [
            "CANCELLED",
            "NO_SHOW",
          ].includes(status) && (
            <button
              className="primary-button"
              onClick={() =>
                void run(
                  "RESTORE",
                )
              }
            >
              Restore
            </button>
          )}
      </div>

      {dialog && (
        <div
          className="modal-backdrop"
          role="presentation"
          onMouseDown={(
            event,
          ) => {
            if (
              event.target ===
              event.currentTarget
            ) {
              setDialog(null);
            }
          }}
        >
          <form
            className="modal-card compact-modal"
            onSubmit={(
              event,
            ) =>
              void submit(event)
            }
          >
            <div className="modal-heading">
              <div>
                <p className="section-kicker">
                  {String(
                    reservation.reference,
                  )}
                </p>

                <h2>
                  {dialog.replaceAll(
                    "_",
                    " ",
                  )}
                </h2>
              </div>

              <button
                type="button"
                className="icon-button"
                onClick={() =>
                  setDialog(null)
                }
              >
                <X size={17} />
              </button>
            </div>

            <div className="form-grid">
              {dialog ===
                "EDIT" && (
                <>
                  <label>
                    <span>
                      Adults
                    </span>

                    <input
                      required
                      type="number"
                      min="1"
                      max="20"
                      value={String(
                        form.adults,
                      )}
                      onChange={(
                        event,
                      ) =>
                        setForm({
                          ...form,
                          adults:
                            event
                              .target
                              .value,
                        })
                      }
                    />
                  </label>

                  <label>
                    <span>
                      Children
                    </span>

                    <input
                      required
                      type="number"
                      min="0"
                      max="20"
                      value={String(
                        form.children,
                      )}
                      onChange={(
                        event,
                      ) =>
                        setForm({
                          ...form,
                          children:
                            event
                              .target
                              .value,
                        })
                      }
                    />
                  </label>

                  <label className="wide">
                    <span>
                      Special
                      requests
                    </span>

                    <textarea
                      value={String(
                        form.specialRequests,
                      )}
                      onChange={(
                        event,
                      ) =>
                        setForm({
                          ...form,
                          specialRequests:
                            event
                              .target
                              .value,
                        })
                      }
                    />
                  </label>

                  <label className="wide">
                    <span>
                      Internal
                      notes
                    </span>

                    <textarea
                      value={String(
                        form.internalNotes,
                      )}
                      onChange={(
                        event,
                      ) =>
                        setForm({
                          ...form,
                          internalNotes:
                            event
                              .target
                              .value,
                        })
                      }
                    />
                  </label>
                </>
              )}

              {dialog ===
                "DATES" && (
                <>
                  <label>
                    <span>
                      Check-in
                    </span>

                    <input
                      required
                      type="date"
                      value={String(
                        form.arrivalDate,
                      )}
                      onChange={(
                        event,
                      ) =>
                        setForm({
                          ...form,
                          arrivalDate:
                            event
                              .target
                              .value,
                        })
                      }
                    />
                  </label>

                  <label>
                    <span>
                      Check-out
                    </span>

                    <input
                      required
                      type="date"
                      value={String(
                        form.departureDate,
                      )}
                      onChange={(
                        event,
                      ) =>
                        setForm({
                          ...form,
                          departureDate:
                            event
                              .target
                              .value,
                        })
                      }
                    />
                  </label>
                </>
              )}

              {(dialog ===
                "EXTEND_STAY" ||
                dialog ===
                  "SHORTEN_STAY") && (
                <label>
                  <span>
                    New check-out
                  </span>

                  <input
                    required
                    type="date"
                    value={String(
                      form.departureDate,
                    )}
                    onChange={(
                      event,
                    ) =>
                      setForm({
                        ...form,
                        departureDate:
                          event
                            .target
                            .value,
                      })
                    }
                  />
                </label>
              )}

              {(dialog ===
                "CHANGE_ROOM" ||
                dialog ===
                  "MOVE_ROOM" ||
                dialog ===
                  "UPGRADE_ROOM") && (
                <label className="wide">
                  <span>
                    Destination
                    room
                  </span>

                  <select
                    required
                    value={String(
                      form.roomId ??
                        "",
                    )}
                    onChange={(
                      event,
                    ) =>
                      setForm({
                        ...form,
                        roomId:
                          event
                            .target
                            .value,
                      })
                    }
                  >
                    {destinationRooms.map(
                      (room) => (
                        <option
                          key={String(
                            room.id,
                          )}
                          value={String(
                            room.id,
                          )}
                        >
                          Room{" "}
                          {String(
                            room.number,
                          )}{" "}
                          ·{" "}
                          {String(
                            room.roomType,
                          )}
                        </option>
                      ),
                    )}
                  </select>
                </label>
              )}

              {dialog ===
                "MOVE_ROOM" && (
                <label className="wide">
                  <span>
                    Room move reason
                  </span>

                  <textarea
                    required
                    minLength={3}
                    maxLength={500}
                    placeholder="Example: Guest requested quieter room"
                    value={String(
                      form.reason ??
                        "",
                    )}
                    onChange={(
                      event,
                    ) =>
                      setForm({
                        ...form,
                        reason:
                          event
                            .target
                            .value,
                      })
                    }
                  />
                </label>
              )}

              {dialog ===
                "CANCEL" && (
                <label className="wide">
                  <span>
                    Cancellation
                    reason
                  </span>

                  <textarea
                    required
                    minLength={3}
                    maxLength={500}
                    value={String(
                      form.reason,
                    )}
                    onChange={(
                      event,
                    ) =>
                      setForm({
                        ...form,
                        reason:
                          event
                            .target
                            .value,
                      })
                    }
                  />
                </label>
              )}
            </div>

            <div className="modal-actions">
              <button
                type="button"
                className="secondary-button"
                onClick={() =>
                  setDialog(null)
                }
              >
                Back
              </button>

              <button
                type="submit"
                className="primary-button"
              >
                {dialog ===
                "MOVE_ROOM"
                  ? "Move room"
                  : "Save change"}
              </button>
            </div>
          </form>
        </div>
      )}
    </>
  );
}

function ReservationInspectionCard({
  summary,
  reservationStatus,
  canReview,
  restricted,
  onCharge,
  onWaive,
}: {
  summary?: ReservationInspectionSummary;
  reservationStatus: string;
  canReview: boolean;
  restricted: boolean;
  onCharge: () => void;
  onWaive: () => void;
}) {
  const presentation = inspectionPresentation(summary, reservationStatus);
  const hasDamage =
    summary?.result === "DAMAGE_FOUND" ||
    presentation.tone === "charged" ||
    presentation.tone === "waived";
  const title =
    !summary || summary.inspectionStatus === "PENDING"
      ? "Room inspection pending"
      : summary.inspectionStatus === "CLEARED"
        ? "Cleared by housekeeping"
        : summary.damageStatus === "CHARGED"
          ? "Damage charge added to folio"
          : summary.damageStatus === "WAIVED"
            ? "Damage reviewed with no guest charge"
            : "Damage found after checkout";
  return (
    <section
      className={`reservation-inspection-card inspection-card-${presentation.tone}`}
    >
      <div className="inspection-card-head">
        <AppGlyph name={presentation.glyph} size={34} />
        <span>
          <small>Post-checkout room status</small>
          <h3>{title}</h3>
        </span>
        <InspectionStatusBadge
          summary={summary}
          reservationStatus={reservationStatus}
        />
      </div>
      {!summary && (
        <p>
          Housekeeping has not completed the checkout inspection yet. The folio
          remains pending until the room result is recorded.
        </p>
      )}
      {summary?.inspectionStatus === "PENDING" && (
        <p>
          Room {String(summary.roomNumber ?? "")} is waiting for housekeeping
          inspection before final folio closure.
        </p>
      )}
      {summary?.inspectionStatus === "CLEARED" && (
        <p>
          No damage found. Cleared by{" "}
          {String(summary.completedBy ?? "Housekeeping")} on{" "}
          {dateTime(summary.completedAt)}.
        </p>
      )}
      {hasDamage && (
        <>
          <p className="inspection-description">
            {String(
              summary?.damageDescription ??
                summary?.inspectionNotes ??
                "Damage details recorded by housekeeping.",
            )}
          </p>
          <div className="inspection-meta">
            <span>
              <small>Severity</small>
              <Status value={String(summary?.severity ?? "LOW")} />
            </span>
            <span>
              <small>Housekeeping update</small>
              <strong>
                {String(
                  summary?.completedBy ?? summary?.reportedBy ?? "Housekeeping",
                )}
              </strong>
              <em>{dateTime(summary?.completedAt ?? summary?.reportedAt)}</em>
            </span>
          </div>
          <div className="inspection-policy-grid">
            <span>
              <small>Hotel policy</small>
              <strong>
                {String(summary?.policyLabel ?? "Damage liability policy")}
              </strong>
            </span>
            <span>
              <small>Policy liability</small>
              <strong>{money(summary?.policyLiabilityPaise)}</strong>
            </span>
            {summary?.repairCostPaise != null && (
              <span>
                <small>Repair estimate</small>
                <strong>{money(summary.repairCostPaise)}</strong>
              </span>
            )}
            <span>
              <small>Decision</small>
              <strong>
                {summary?.damageStatus === "CHARGED"
                  ? `Charged ${money(summary.chargeAmountPaise)}`
                  : summary?.damageStatus === "WAIVED"
                    ? "No guest charge"
                    : "Awaiting manager review"}
              </strong>
            </span>
          </div>
          {summary?.reviewedBy && (
            <p className="inspection-review-note">
              Reviewed by {summary.reviewedBy} on {dateTime(summary.reviewedAt)}
              {summary.decisionNote ? ` · ${summary.decisionNote}` : ""}
            </p>
          )}
        </>
      )}
      {canReview && (
        <div className="inspection-actions">
          <button
            className="secondary-button"
            disabled={restricted}
            onClick={onWaive}
          >
            Waive guest charge
          </button>
          <button
            className="primary-button"
            disabled={restricted}
            onClick={onCharge}
          >
            <IndianRupee size={14} /> Review policy charge
          </button>
        </div>
      )}
    </section>
  );
}
