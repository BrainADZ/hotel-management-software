# Production reservations — step 2

Production reservations use the authenticated application context and PostgreSQL repositories. Every query includes both `organisation_id` and `property_id`; room lookup also uses the active property. Demo/UAT continues through `/api/demo` and the isolated D1 store. Production reservation routes return `PRODUCTION_API_DISABLED` in demo mode.

## Lifecycle and permissions

Statuses are `PENDING`, `HOLD`, `CONFIRMED`, `CHECKED_IN`, `CHECKED_OUT`, `CANCELLED`, and `NO_SHOW`. Transition rules are centralized in `lib/server/reservations/transitions.ts`:

- PENDING → HOLD, CONFIRMED, CANCELLED
- HOLD → PENDING (expiry), CONFIRMED, CANCELLED
- CONFIRMED → HOLD, CHECKED_IN, CANCELLED, NO_SHOW
- CHECKED_IN → CHECKED_OUT
- CANCELLED / NO_SHOW → CONFIRMED, only through owner/manager restore
- CHECKED_OUT is terminal in this phase

Existing `reservation.read` and `reservation.write` permissions remain authoritative. `reservation.override` was added only for OWNER and MANAGER, covering restore and hold-expiration administration. Reception can create, edit and run normal lifecycle actions. Reporting, housekeeping, restaurant and Travel-only roles gain no reservation mutation access.

Checked-in reservations allow guest-count and note edits, date extension/shortening, and validated room moves. Checked-out, cancelled and no-show records are immutable except owner/manager restore for the latter two. Cancellation requires a reason. No-show uses the active property's timezone and is permitted only on or after the arrival date.

## Availability, rates and concurrency

Hotel stays use half-open date ranges: a conflict exists when existing arrival is before requested departure and existing departure is after requested arrival. Same-day turnover is allowed. HOLD, CONFIRMED and CHECKED_IN block rooms; expired holds, PENDING, CANCELLED, NO_SHOW and CHECKED_OUT do not. Edit operations exclude their own reservation.

Rooms must belong to the active property, be active, have `READY` or `CLEAN` operational status, and match the selected room type. The server never silently changes rooms. A room upgrade preserves the agreed nightly rate unless an authorized caller explicitly supplies a replacement rate.

Nightly rate and tax basis-point snapshots are stored with the reservation. Estimated value is recalculated as `(nightly rate × nights) + snapshot tax`; it is not a final folio or settlement amount.

Create, date changes, room changes, upgrades, release and restore run inside a PostgreSQL transaction protected by a transaction-level advisory lock for the property/room key. Availability is rechecked inside that lock. Optimistic reservation versions detect concurrent edits. Reservation numbers use an atomic per-property sequence and the `RES-YYYY-000001` format.

## History, audit and holds

`reservation_events` is append-only through normal services and records business events plus limited non-sensitive metadata. The global `audit_logs` table receives a corresponding security/system trace. Normal workflows never hard-delete reservations.

Expired holds immediately stop blocking availability. `expireReservationHolds()` moves them to PENDING and records history, but no background schedule is faked. A later operations phase must call it from an authenticated scheduled worker.

## APIs and UI

- `GET/POST /api/reservations`
- `GET/PATCH /api/reservations/[id]`
- `POST /api/reservations/[id]/actions`
- `GET /api/reservations/[id]/history`
- `GET /api/availability`
- `GET /api/rooms` for active-property room selection

List queries support paginated status, arrival, departure, guest/reference/email/phone search, room and source filtering. Mutation payloads are validated with Zod; invalid input returns 400, unauthorized access 401/403, conflicts 409, and missing records 404 without stack traces.

In production mode the existing Hotel UI loads authenticated context, the first reservation page and active rooms. The existing reservation modal creates PostgreSQL reservations. The existing detail drawer shows reservation snapshots/history and exposes only lifecycle actions appropriate to status and role. Demo mode retains its existing API, offline queue and UI behavior.

## Deliberately deferred

Payment collection, refunds, final folio calculations, GST invoices, accounting effects of room moves, automatic hold scheduling, persistent property switching, production inbound OTA/channel-manager intake, KYC, dynamic pricing and all Step 3+ modules remain deferred. Applying the PostgreSQL migration and validating against a configured live database still require `DATABASE_URL` and deployment access.
