# Step 7 — Production offline sync

## 1. Previous offline architecture

The existing `brainadz-hospitality-front-desk` Dexie database cached guests, bookings, folios and folio lines. It also stored offline walk-in reservations, offline bill records/PDFs, device metadata, readiness data and a recovery journal. Offline walk-ins were local records; billing continuity produced a local document and manual reconciliation record.

## 2. Previous gaps

There was no generic production mutation lifecycle, reconnect worker, durable server idempotency ledger or per-item conflict response. Most production mutations could reach the ordinary command path while disconnected, and no durable server record prevented a retried client operation from applying twice. Cached data was read-only except for the dedicated walk-in and billing flows.

## 3. Final supported offline commands

- `SYNC_OFFLINE_RESERVATION`: converts an existing local walk-in to a production reservation when a suitable room remains available and creates its folio.
- `RECORD_HOUSEKEEPING_OUTCOME`: applies the existing version-aware, permission-checked housekeeping operation.

The allowlist is enforced when writing to IndexedDB and again by the server.

## 4. Explicit blocked commands

Payments, refunds, financial checkout, folio/charge edits, KYC capture/upload, user/role/property administration, destructive reservation actions, inventory/restaurant/maintenance mutations, Travel mutations and every unknown command require an online connection. Offline bills retain their pre-existing manual upload/reconciliation workflow; they are not silently converted into server financial mutations.

## 5. Dexie queue schema

`offlineMutations` stores `id`, stable unique `clientMutationId`, cached organisation/property/user scope, command, entity type/id, non-sensitive payload, status, retry count, error/conflict details, server entity ID, attempt time and created/updated timestamps. States are `PENDING`, `SYNCING`, `SYNCED`, `FAILED` and `CONFLICT`.

## 6. IndexedDB version migration

Version 4 upgrades the existing database in place and indexes the unique client mutation ID, status, creation time, property and entity identity. No second IndexedDB database is created, and existing tables remain intact.

## 7. Enqueue lifecycle

The queue validates required scope, checks the command allowlist, recursively rejects authentication secrets and raw KYC identifiers, creates one stable mutation UUID, and returns an existing row when that UUID is already present. The local walk-in bridge persists its client mutation UUID on the original walk-in record before enqueueing it.

## 8. Sync lifecycle

One single-flight worker recovers stale `SYNCING` rows, bridges pending walk-ins, selects pending/retryable failed rows, atomically marks each row `SYNCING`, sends one bounded batch, and applies each server result independently. Success stores the server ID; transient/request failures remain retryable with an incremented count; conflicts remain visible for review. A missing per-item response is a failure.

## 9. Reconnect behavior

The application tracks the browser network event. When production Hotel context is online and authenticated, it runs the worker and reloads authoritative state after successful changes. The existing property simulator also participates in the effective offline state.

## 10. Startup recovery behavior

Once production context has loaded on an online startup, the same worker runs. Rows left `SYNCING` beyond the recovery threshold return to `PENDING`. A module-level promise prevents overlapping workers in one browser runtime, while server idempotency protects across tabs, restarts and repeated requests.

## 11. Idempotency model

Migration `0007_production_offline_sync.sql` adds `offline_sync_mutations`. `(organisation_id, client_mutation_id)` is unique and the row stores a canonical SHA-256 payload hash, processing/final state and serialized result. An identical completed request replays its stored result. Reusing the key with different data returns `IDEMPOTENCY_KEY_REUSED`; an already-processing key returns `SYNC_IN_PROGRESS`. PostgreSQL persistence makes this durable across backend restart.

## 12. Conflict model

Reservation availability is checked against current server state during sync. No available requested room type returns `ROOM_NOT_AVAILABLE`. Housekeeping uses the existing task/property/version/status checks. Domain conflicts and missing entities become `CONFLICT`, are never overwritten silently, and remain in the device queue for review.

## 13. Server authorization boundaries

The endpoint is production-only and requires the normal authenticated application session. The server derives organisation, user and role from that session, validates every requested property against the session's allowed properties, and calls the existing domain services so permission, tenant and entity checks run again. Client organisation, user, role and permissions are neither accepted nor trusted. A bad item does not prevent safe items in the batch from receiving results.

## 14. Sensitive-data policy

Frontend and backend recursively reject auth headers/cookies, passwords, access/refresh/session tokens, API keys/secrets, Aadhaar, passport, voter ID, driving licence and generic raw KYC/document-number fields. The durable ledger stores only a payload hash and safe operation metadata, never the mutation payload.

## 15. Existing offline walk-in behavior

Offline walk-in creation and local visibility remain intact. The reconnect worker now bridges each unsynced walk-in exactly once by a persisted mutation UUID and maps the returned production reservation ID/reference onto the local record.

## 16. Existing offline billing behavior

Existing cached folio lookup, local bill calculation/PDF generation, recovery journal and manual master reconciliation are unchanged. Financial mutations remain blocked from the generic queue because current balances and payment authority must be online.

## 17. UI indicators

The existing Device Status screen shows pending, syncing, failed and needs-review totals plus command/entity/error details. Existing banners and toast notifications report queued work, reconnect conflicts and failures without a layout redesign.

## 18. Backend endpoint contract

`POST /api/sync/mutations` accepts `{ mutations: [...] }`, with 1–50 strict items containing `clientMutationId`, `propertyId`, `command`, `entityType`, optional `entityId`, and `payload`. It returns `{ results: [...] }`; every result has the same client ID and a `SYNCED`, `FAILED` or `CONFLICT` status, with result/server ID, error, or conflict details as appropriate. Authentication-level and malformed-batch errors use the normal API error response.

## 19. PostgreSQL migration details

Only migration 0007 was added. It creates the durable ledger, its organisation-scoped unique idempotency index and a property/status/created-time operations index. Migrations 0000–0006 were not edited by Step 7.

## 20. Files created

- `frontend/lib/offline-sync.ts`
- `backend/src/api/sync/mutations/route.ts`
- `backend/src/services/offline-sync/service.ts`
- `backend/src/services/offline-sync/validation.ts`
- `backend/src/services/offline-sync/validation.test.ts`
- `backend/drizzle-postgres/0007_production_offline_sync.sql`
- `docs/step-7-production-offline-sync.md`

## 21. Files modified

- `frontend/lib/offline-db.ts`
- `frontend/lib/offline-db.test.ts`
- `frontend/app/hotel-platform.tsx`
- `frontend/components/hotel/DeviceStatusView.tsx`
- `backend/src/api/routes.ts`
- `backend/src/db/schema.ts`
- `backend/src/app.test.ts`
- `backend/drizzle-postgres/meta/_journal.json`
- `PROJECT_MAP.md`

## 22. Test results

Frontend: 4 files and 36 tests passed. Backend: 16 files and 203 tests passed. Shared: 1 file and 13 tests passed. All workspace typechecks passed. Lint completed with zero errors and one pre-existing Step 6 unused-variable warning. Backend and frontend production builds passed.

## 23. PostgreSQL smoke results

Migration 0007 applied successfully to local PostgreSQL. An authenticated housekeeping outcome was submitted twice with the same client mutation UUID: both calls returned `SYNCED`, the task advanced only from version 1 to 2, one ledger row existed and one `OFFLINE_MUTATION_SYNCED` audit existed. A separate temporary foreign organisation/property request returned `PROPERTY_FORBIDDEN` and wrote no ledger row. Both smoke runs removed their temporary tasks, sessions, tenant records, ledger rows and audit rows.

## 24. Remaining limitations

The allowlist intentionally covers only walk-in reservation synchronization and housekeeping outcomes. Conflict resolution is review/retry oriented rather than an automatic merge. Offline bills keep their explicit manual reconciliation contract. Multi-tab client coordination relies on atomic Dexie state plus server idempotency; the module-level single-flight lock covers one JavaScript runtime.
