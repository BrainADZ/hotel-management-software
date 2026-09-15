# HMS continuation verification — 15 September 2026

This pass continues the existing implementation. The pre-existing invoice/PDF, booking-number migration, room-move endpoint, and staged checkout changes were preserved. No migration was edited or applied in this pass.

## Fixed connections

- Maintenance commands now reach the dedicated maintenance lifecycle before the older generic operations handler. Create, edit, assign, start, resolve, and close use its validation and authorization rules; resolution requires a note.
- Maintenance resolution leaves a room dirty for cleaning, including occupied rooms. It reuses an existing active cleaning task and creates the appropriate cleaning task when needed. Room locking happens before checking other unresolved tickets.
- Production dashboard state now uses the backend reporting aggregates, with a calculated fallback for permitted operational data. Travel totals come from actual leads, quotes, approvals and follow-ups. Offline bill references are retained in application state.
- Reservation loading retrieves every page rather than using the first page as the entire hotel's data.
- Production Travel screens and offline verification use their existing persisted workflows. Travel administration loads the permitted property staff/settings data. The already implemented invoice screen remains in place.
- Reception can assign housekeeping but does not see completion/inspection controls it cannot use. Offline walk-ins retain organisation/property ownership for the existing scoped sync worker.
- Removed duplicate maintenance command entries. The existing `MOVE_ROOM` route remains intact.

## Verification

- Workspace tests: **335 passed** (79 frontend, 243 backend, 13 shared).
- Typecheck: passed.
- Local PostgreSQL integration script: **78 checks passed**, including successful cleanup of the temporary test organisation and its financial sequences.
- Production build: passed.
- Notification alert tests cover role restrictions, resolved alerts disappearing and an order's changed version producing a new alert. The existing notification bell implementation was preserved.

The database script exercises authentication, property isolation, staff creation/deactivation and session revocation, room changes, housekeeping assignment/outcomes, maintenance lifecycle, inventory ledger and insufficient-stock protection, lost-and-found custody, menu orders, concurrent order idempotency, folio posting, meal duplication checks, reconciliation without financial replay, Travel catalog/capacity, audit records, and checkout → inspection → cleaning → final closure.

Run it against a local production-mode test database:

```powershell
cd backend
npx tsx --env-file-if-exists=.env src/scripts/verify-operational-workflows.ts
```

It creates a separate temporary organisation and property; it does not operate on hotel business records. Success is printed only after its cleanup completes.

## Limits of this verification

- This is code, regression and local database verification; browser interaction testing and production deployment were not performed.
- Live payment gateway, WhatsApp/email delivery, OTA/channel manager and smart-lock providers still require their own integrations/configuration. No external messages or payments were sent.
- Offline verification compares retained bill references, totals and taxes with the current folio. It does not upload the original PDF to cloud storage or replay financial transactions. The original PDF stays on its device.
- Existing first-launch/offline recovery and cross-device browser acceptance were not certified by these checks.
- Existing React dependency warnings remain in `FoliosBillingView.tsx` and `InvoicesView.tsx`; build tooling also reports a large client bundle. Existing whitespace in `FoliosBillingView.tsx` was left untouched.

These results verify the listed workflows, not every possible production scenario or external integration.
