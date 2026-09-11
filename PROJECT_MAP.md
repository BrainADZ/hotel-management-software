# Hotel Management Software — Project Map

This map points to the current implementation after the feature-wise frontend refactor.

## Frontend entry points

- `frontend/app/page.tsx` — authentication/session gate and application mount.
- `frontend/app/hotel-platform.tsx` — shared runtime state, API bootstrap, shell composition, callbacks, and direct active-view dispatch.
- `frontend/app/hotel/[[...route]]/page.tsx` and `frontend/app/travel/[[...route]]/page.tsx` — refresh-safe workspace routes.
- `frontend/lib/navigation.ts` — canonical sidebar groups, paths, workspace lookup, and RBAC visibility.
- `frontend/components/layout/Sidebar.tsx` — pathname-aware sidebar navigation.
- `frontend/components/layout/Topbar.tsx` — topbar shell.
- `frontend/components/layout/WorkspaceSwitcher.tsx` — Hotel Operations / Travel & Sales selector.
- `frontend/components/layout/OperatingSurfaceSwitcher.tsx` — topbar-only Master Hub / Property selector.
- `frontend/app/globals.css` — Classic Blue and Sage visual themes.

## Sidebar label → exact frontend file

### Hotel Operations

| Sidebar label | Implementation file |
| --- | --- |
| Overview | `frontend/components/hotel/OverviewView.tsx` |
| Reservations | `frontend/components/hotel/ReservationsView.tsx` |
| Connectivity | `frontend/components/hotel/ConnectivityView.tsx` |
| Front Desk | `frontend/components/hotel/FrontDeskView.tsx` |
| Guests | `frontend/components/hotel/GuestsView.tsx` |
| Folios & Billing | `frontend/components/hotel/FoliosBillingView.tsx` |
| Room Calendar | `frontend/components/hotel/RoomCalendarView.tsx` |
| Arrivals & Departures | `frontend/components/hotel/ArrivalsDeparturesView.tsx` |
| Room Types & Rates | `frontend/components/hotel/RoomTypesRatesView.tsx` |
| Guest Profiles | `frontend/components/hotel/GuestProfilesView.tsx` |
| Invoices | `frontend/components/hotel/InvoicesView.tsx` |
| Housekeeping | `frontend/components/hotel/HousekeepingView.tsx` |
| Maintenance | `frontend/components/hotel/MaintenanceView.tsx` |
| Inventory | `frontend/components/hotel/InventoryView.tsx` |
| Inventory Movements | `frontend/components/hotel/InventoryMovementsView.tsx` |
| Lost & Found | `frontend/components/hotel/LostFoundView.tsx` |
| Restaurant Orders | `frontend/components/hotel/RestaurantOrdersView.tsx` |
| Room Service | `frontend/components/hotel/RoomServiceView.tsx` |
| Meal Service | `frontend/components/hotel/MealServiceView.tsx` |
| Menu Management | `frontend/components/hotel/MenuManagementView.tsx` |
| Offline Billing | `frontend/components/hotel/OfflineBillingView.tsx` |
| Verification | `frontend/components/hotel/VerificationView.tsx` |
| Device Status | `frontend/components/hotel/DeviceStatusView.tsx` |
| Integrations | `frontend/components/hotel/IntegrationsView.tsx` |
| Reports | `frontend/components/hotel/ReportsView.tsx` |
| Audit Logs | `frontend/components/hotel/AuditLogsView.tsx` |
| Users & Permissions | `frontend/components/hotel/UsersPermissionsView.tsx` |
| Properties & Settings | `frontend/components/hotel/PropertiesSettingsView.tsx` |

### Travel & Sales

| Sidebar label | Implementation file |
| --- | --- |
| Overview | `frontend/components/travel/TravelOverviewView.tsx` |
| Packages & Tours | `frontend/components/travel/PackagesToursView.tsx` |
| Tours | `frontend/components/travel/ToursView.tsx` |
| Participants | `frontend/components/travel/ParticipantsView.tsx` |
| Tour Managers | `frontend/components/travel/TourManagersView.tsx` |
| Inquiry CRM | `frontend/components/travel/InquiryCRMView.tsx` |
| Sales Pipeline | `frontend/components/travel/SalesPipelineView.tsx` |
| Follow-ups | `frontend/components/travel/FollowUpsView.tsx` |
| Communications | `frontend/components/travel/CommunicationsView.tsx` |
| Reports | `frontend/components/travel/TravelReportsView.tsx` |
| Audit Logs | `frontend/components/travel/TravelAuditLogsView.tsx` |
| Users & Permissions | `frontend/components/hotel/UsersPermissionsView.tsx` (shared behavior) |
| Properties & Settings | `frontend/components/hotel/PropertiesSettingsView.tsx` (shared behavior) |

## Supporting frontend code

- `frontend/components/hotel/reservation-workflows.tsx` — reservation/stay dialogs and lifecycle actions used by Reservations and Front Desk.
- `frontend/app/production-front-desk.tsx` — production Front Desk and Guests data/action implementations.
- `frontend/components/shared/feature-ui.tsx` — reused table, heading, status, and summary primitives for extracted secondary screens.
- `frontend/lib/api/client.ts` — frontend HTTP client and backend URL handling.
- `frontend/lib/offline-db.ts` — Dexie cache, offline queues, billing documents, readiness, and recovery.
- `frontend/lib/offline-sync.ts` — single-flight reconnect/startup worker for the production offline mutation queue.
- `frontend/lib/production-command-routing.ts` — explicit production command allowlist; Travel commands resolve only to `/api/travel/*`.
- `frontend/lib/housekeeping-assignment.ts` — Housekeeping assignment labels, role visibility, staff option shaping, and command construction.

## Travel production API

- `GET /api/travel` — organisation-scoped Travel snapshot without a Hotel property requirement.
- `POST /api/travel/inquiries` and `PATCH /api/travel/inquiries/:id` — inquiry creation, updates, and pipeline status.
- `POST /api/travel/packages` — transactional custom package, item, and optional discount-request creation.
- `PATCH /api/travel/packages/:id/pricing` — version-aware base/floor pricing update.
- `POST /api/travel/discount-requests/:id/decision` — transactional approve/reject decision.
- `POST /api/travel/follow-ups` and `PATCH /api/travel/follow-ups/:id` — persisted follow-up creation/update/completion.
- `backend/src/services/travel/context.ts` — authenticated organisation-level Travel authorization.
- `backend/src/services/travel/service.ts` — PostgreSQL Travel queries, mutations, tenancy enforcement, and audit writes.
- `backend/drizzle-postgres/0006_travel_production.sql` — inquiry update metadata and `travel_follow_ups`.

## Backend map

- `backend/src/api/routes.ts` — API registration.
- `backend/src/api/` — HTTP handlers.
- `backend/src/services/reservations/` — reservation availability, validation, persistence, and lifecycle.
- `backend/src/services/front-desk/` — room assignment, check-in/out, keys, moves, and departures.
- `backend/src/services/guests/` — guest profile, history, and identity documents.
- `backend/src/modules/billing/` — folios, charges, payments, invoices, PDFs, and financial checkout.
- `backend/src/modules/operations/service.ts` — housekeeping, inspections, maintenance, inventory, and restaurant operations.
- `backend/src/modules/operations/housekeeping-assignment.ts` — assignment permission, task-state, version, and assignee eligibility guards.
- `backend/src/services/auth/` and `backend/src/services/profile.ts` — authentication, sessions, access, and profiles.
- `backend/src/db/schema.ts` — PostgreSQL schema; `backend/drizzle-postgres/` — production migrations.
- `shared/domain.ts` — contracts shared by frontend and backend.

## Production offline sync

- `POST /api/sync/mutations` — authenticated, per-item synchronization endpoint for the explicit Hotel offline allowlist.
- `backend/src/services/offline-sync/` — payload policy, tenant/property revalidation, durable idempotency, conflict mapping, and audit writes.
- `backend/drizzle-postgres/0007_production_offline_sync.sql` — organisation-scoped idempotency ledger.
