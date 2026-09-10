# Hotel Management Software — Project Map

This map is a navigation aid for the current codebase. Paths point to the implementation that exists today; entries described as shared/demo state do not have a dedicated production API yet.

## Quick find

| I want to change                                                              | Start here                                                                      | Supporting code                                                                                 |
| ----------------------------------------------------------------------------- | ------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| Login page                                                                    | `frontend/app/page.tsx`                                                         | Auth routes under `backend/src/api/auth/`                                                       |
| Sidebar/navigation                                                            | `frontend/lib/navigation.ts`                                                    | `frontend/components/layout/app-sidebar.tsx`                                                    |
| Dashboard                                                                     | `OverviewView` in `frontend/components/hotel/core-views.tsx`                    | `/api/context`, `/api/demo`                                                                     |
| Reservations                                                                  | `ReservationsView` in `frontend/components/hotel/core-views.tsx`                | `frontend/components/hotel/reservation-workflows.tsx`                                           |
| Front Desk                                                                    | `frontend/app/production-front-desk.tsx`                                        | `FrontDeskView` in `frontend/components/hotel/core-views.tsx`                                   |
| Billing                                                                       | `FoliosView` in `frontend/components/hotel/core-views.tsx`                      | `backend/src/modules/billing/`, folio/payment/invoice routes                                    |
| Housekeeping                                                                  | `frontend/components/hotel/operations-views.tsx`                                | `backend/src/modules/operations/service.ts`                                                     |
| Inventory                                                                     | `InventoryView` in `frontend/components/hotel/operations-views.tsx`             | `InventoryMovements` in `frontend/app/primary-extra-features.tsx`                               |
| Restaurant                                                                    | `RestaurantOverviewView` in `frontend/components/hotel/core-views.tsx`          | `RestaurantFeature` in `frontend/app/primary-extra-features.tsx`                                |
| CRM                                                                           | `TravelFeature` and `SalesFeature` in `frontend/app/primary-extra-features.tsx` | `inquiries` in `backend/src/db/schema.ts`                                                       |
| Travel                                                                        | `frontend/components/travel/travel-admin-views.tsx`                             | `TravelFeature` in `frontend/app/primary-extra-features.tsx`                                    |
| Reports                                                                       | `ReportsView` in `frontend/components/travel/travel-admin-views.tsx`            | Loaded application state                                                                        |
| User profile                                                                  | `ProfileModal` in `frontend/app/hotel-platform.tsx`                             | `backend/src/api/profile/`, `backend/src/services/profile.ts`                                   |
| Theme/colors                                                                  | `frontend/app/globals.css`                                                      | Theme selection in `frontend/app/hotel-platform.tsx`                                            |
| Global font sizes                                                             | `frontend/app/globals.css`                                                      | Root typography and component selectors                                                         |
| API client                                                                    | `frontend/lib/api/client.ts`                                                    | `frontend/.env.example`                                                                         |
| Database schema                                                               | `backend/src/db/schema.ts`                                                      | `backend/drizzle-postgres/`                                                                     |
| App startup and authentication gate                                           | `frontend/app/page.tsx`                                                         | `frontend/lib/api/client.ts`, `backend/src/api/auth/`, `backend/src/services/auth/`             |
| Main shell and shared runtime                                                 | `frontend/app/hotel-platform.tsx` (`HotelPlatform`, `ViewRouter`)               | `frontend/components/layout/app-sidebar.tsx`, `frontend/app/globals.css`                        |
| Route and RBAC navigation config                                              | `frontend/lib/navigation.ts`                                                    | `frontend/app/hotel/[[...route]]/page.tsx`, `frontend/app/travel/[[...route]]/page.tsx`         |
| Core hotel screens and dialogs                                                | `frontend/components/hotel/core-views.tsx`                                      | `frontend/components/hotel/reservation-workflows.tsx`, `frontend/app/production-front-desk.tsx` |
| Additional planning, operations, restaurant, travel, sales, and admin screens | `frontend/app/primary-extra-features.tsx` (`ExtraFeatureView`)                  | `frontend/app/hotel-platform.tsx` (`ViewRouter`)                                                |
| Offline cache, queues, bills, and PDFs                                        | `frontend/lib/offline-db.ts`                                                    | `frontend/app/hotel-platform.tsx`                                                               |
| Frontend-to-backend URL handling                                              | `frontend/lib/api/client.ts`                                                    | `frontend/.env.example`                                                                         |
| Backend route registry                                                        | `backend/src/api/routes.ts`                                                     | Individual handlers under `backend/src/api/`                                                    |
| Database schema                                                               | `backend/src/db/schema.ts`                                                      | `backend/src/db/index.ts`, `backend/drizzle-postgres/`                                          |
| Demo data and commands                                                        | `backend/src/services/demo-store.ts`                                            | `backend/src/api/demo/route.ts`, `backend/src/demo/storage.ts`                                  |
| Shared contracts                                                              | `shared/domain.ts`                                                              | Frontend and backend imports from `@hotel/shared`                                               |

## Frontend entry points

- `frontend/app/layout.tsx` — root document metadata, global stylesheet, and PWA provider.
- `frontend/app/page.tsx` — runtime configuration, `/api/auth/me` session check, local login screen, logout callback, and `HotelPlatform` mounting.
- `frontend/app/pwa-provider.tsx` and `frontend/app/manifest.ts` — service-worker registration and install metadata.
- `frontend/app/globals.css` — global visual system and all current page/component styles.
- `frontend/app/hotel-platform.tsx` — shared runtime, shell state, topbar, dialogs, and feature dispatch.
- `frontend/lib/navigation.ts` — route paths, sidebar groups, workspace mapping, and navigation RBAC.
- `frontend/app/hotel/[[...route]]/page.tsx` and `frontend/app/travel/[[...route]]/page.tsx` — direct and refresh-safe workspace routes.

## Sidebar feature map

### Master Hub

| Sidebar feature | Frontend implementation                                                                                                            | Backend/data path                                                                                 |
| --------------- | ---------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| Overview        | `OverviewView` in `frontend/components/hotel/core-views.tsx`                                                                       | `/api/context`, `/api/demo`; `backend/src/services/demo-store.ts`                                 |
| Reservations    | `ReservationsView` in `frontend/components/hotel/core-views.tsx`; dialogs in `frontend/components/hotel/reservation-workflows.tsx` | `backend/src/api/reservations/`, `backend/src/services/reservations/`, availability and room APIs |
| Connectivity    | `ConnectivityView` in `frontend/components/hotel/core-views.tsx`                                                                   | `/api/context`, `/api/demo`; offline support in `frontend/lib/offline-db.ts`                      |

### Hotel

| Sidebar feature  | Frontend implementation                                                                                                       | Backend/data path                                                                                                 |
| ---------------- | ----------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| Front Desk       | `FrontDeskView` in `frontend/components/hotel/core-views.tsx`; production actions in `frontend/app/production-front-desk.tsx` | `backend/src/api/front-desk/`, reservation/stay action routes, `backend/src/services/front-desk/`                 |
| Guests           | `GuestsView` plus `ProductionGuests` and `ProductionReservationGuests`                                                        | `backend/src/api/guests/`, reservation guest route, `backend/src/services/guests/`                                |
| Folios & Billing | `FoliosView` in `frontend/components/hotel/core-views.tsx`; workflow helpers in `frontend/lib/offline-db.ts`                  | Folio, payment, invoice, and financial-checkout handlers under `backend/src/api/`; `backend/src/modules/billing/` |

### Planning

| Sidebar feature       | Frontend implementation                                       | Backend/data path                                                                   |
| --------------------- | ------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| Room Calendar         | `RoomCalendar` in `frontend/app/primary-extra-features.tsx`   | Reservation and room data; `/api/reservations`, `/api/availability`, `/api/rooms`   |
| Arrivals & Departures | `Movements` in `frontend/app/primary-extra-features.tsx`      | Front-desk and reservation data                                                     |
| Room Types & Rates    | `RoomTypesRates` in `frontend/app/primary-extra-features.tsx` | Current shared/demo state; room records come from `/api/rooms`                      |
| Guest Profiles        | `GuestProfiles` in `frontend/app/primary-extra-features.tsx`  | Guest handlers and `backend/src/services/guests/`                                   |
| Invoices              | `Invoices` in `frontend/app/primary-extra-features.tsx`       | `backend/src/api/invoices/` and folio invoice route; `backend/src/modules/billing/` |

### Operations

| Sidebar feature     | Frontend implementation                                                                  | Backend/data path                                                      |
| ------------------- | ---------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| Housekeeping        | Housekeeping and damage components in `frontend/components/hotel/operations-views.tsx`   | `/api/operations`; `backend/src/modules/operations/service.ts`         |
| Maintenance         | `OperationsView` in `frontend/components/hotel/operations-views.tsx`                     | `/api/operations`; operations service and `maintenance_tickets` schema |
| Inventory           | `InventoryView` and `InventoryModal` in `frontend/components/hotel/operations-views.tsx` | `/api/operations`; operations service and `inventory_items` schema     |
| Inventory Movements | `InventoryMovements` in `frontend/app/primary-extra-features.tsx`                        | Shared operations/demo state; no dedicated route                       |
| Lost & Found        | `LostFound` in `frontend/app/primary-extra-features.tsx`                                 | Local/shared UI state; no dedicated route                              |
| Restaurant Orders   | `RestaurantOverviewView` in `frontend/components/hotel/core-views.tsx`                   | `/api/operations`; operations service and `restaurant_orders` schema   |

### Restaurant tools

`Room Service`, `Meal Service`, and `Menu Management` are routed through `RestaurantFeature` in `frontend/app/primary-extra-features.tsx`. They use the application state supplied by `HotelPlatform`; restaurant orders and meal bookings are represented in `backend/src/db/schema.ts` and mutations currently flow through `/api/operations` where supported.

### Travel & Sales

| Sidebar feature                    | Frontend implementation                                                                 | Backend/data path                                                           |
| ---------------------------------- | --------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| Overview                           | `TravelOverviewView` in `frontend/components/hotel/core-views.tsx`                      | Shared/demo state from `/api/demo` and `backend/src/services/demo-store.ts` |
| Packages & Tours                   | Travel sales and package dialogs in `frontend/components/travel/travel-admin-views.tsx` | Demo command path; travel tables in `backend/src/db/schema.ts`              |
| Tours, Participants, Tour Managers | `TravelFeature` in `frontend/app/primary-extra-features.tsx`                            | Shared/demo state; no dedicated production route                            |
| Inquiry CRM                        | `TravelFeature` in `frontend/app/primary-extra-features.tsx`                            | Shared/demo state; `inquiries` table in the schema                          |

### Sales tools

`Sales Pipeline`, `Follow-ups`, and `Communications` are implemented by `SalesFeature` in `frontend/app/primary-extra-features.tsx`. They currently operate on shared/demo inquiry data and commands; there is no dedicated production sales API.

### Offline Centre

| Sidebar feature | Frontend implementation                                               | Backend/data path                                                                                |
| --------------- | --------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| Offline Billing | `OfflineBillingView` in `frontend/components/hotel/offline-views.tsx` | IndexedDB and PDF workflow in `frontend/lib/offline-db.ts`; reconciliation uses demo/master data |
| Verification    | `VerificationView` in `frontend/components/hotel/offline-views.tsx`   | Offline bill records and application state                                                       |
| Device Status   | `DeviceStatusView` in `frontend/components/hotel/offline-views.tsx`   | `getOfflineReadiness`, recovery checks, cache and queue helpers in `frontend/lib/offline-db.ts`  |

### Administration

| Sidebar feature       | Frontend implementation                                                                          | Backend/data path                                                                             |
| --------------------- | ------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------- |
| Integrations          | `IntegrationsView` in `frontend/components/travel/travel-admin-views.tsx`                        | Demo commands and `integration_events` schema                                                 |
| Reports               | `ReportsView` in `frontend/components/travel/travel-admin-views.tsx`                             | Aggregates loaded application state; no dedicated reporting route                             |
| Audit Logs            | `AuditView` and `AuditChanges` in `frontend/components/travel/travel-admin-views.tsx`            | Demo state and `audit_logs` schema                                                            |
| Users & Permissions   | `AdminFeature` in `frontend/app/primary-extra-features.tsx`; role visibility in `roleViewAccess` | Auth/context services; `app_users`, identities, sessions, and property access schema/services |
| Properties & Settings | `AdminFeature` in `frontend/app/primary-extra-features.tsx`; property picker in `HotelPlatform`  | `/api/properties`, `/api/context`, auth property-access service                               |

Travel administration reuses the same `Reports`, `Audit Logs`, `Users & Permissions`, and `Properties & Settings` implementations with the travel business-unit state.

## Authentication and profile

- Frontend login/session gate: `frontend/app/page.tsx`.
- Frontend account menu and profile editor: `AccountAvatar` and `ProfileModal` in `frontend/app/hotel-platform.tsx`.
- Local auth endpoints: `backend/src/api/auth/login/route.ts`, `logout/route.ts`, and `me/route.ts`.
- Google auth endpoints: `backend/src/api/auth/google/route.ts` and `google/callback/route.ts`.
- Session and authorization logic: `backend/src/services/auth/local-session.ts`, `session.ts`, `actor.ts`, `repository.ts`, and `property-access.ts`.
- Profile and avatar endpoints: `backend/src/api/profile/`; logic in `backend/src/services/profile.ts`.

## Large-file index

### `frontend/app/hotel-platform.tsx`

- `HotelPlatform` — loads shared state and owns network mode, role, property, account, notifications, and the common topbar.
- `ViewRouter` — dispatches the pathname-derived feature to the extracted feature groups.
- Shared visual helpers remain here for consistent rendering across extracted screens.

### Extracted feature groups

- `frontend/components/hotel/core-views.tsx` — dashboard, reservations, connectivity, front desk, guests, and folios.
- `frontend/components/hotel/reservation-workflows.tsx` — reservation creation, stay drawer, production lifecycle actions, and inspections.
- `frontend/components/hotel/operations-views.tsx` — housekeeping, maintenance, inventory, restaurant orders, and damage workflows.
- `frontend/components/hotel/offline-views.tsx` — offline billing, verification, and device status.
- `frontend/components/travel/travel-admin-views.tsx` — packages, inquiry CRM, integrations, reports, and audit logs.
- `frontend/components/layout/app-sidebar.tsx` — reusable pathname-aware sidebar.
- `frontend/lib/navigation.ts` — canonical hrefs, workspace groups, route lookup, and role visibility.

### `frontend/app/primary-extra-features.tsx`

- `ExtraFeatureView` — entry router for secondary features.
- `RoomCalendar`, `Movements`, `RoomTypesRates`, `Invoices`, `GuestProfiles` — planning.
- `InventoryMovements`, `LostFound`, `RestaurantFeature` — operations and restaurant tools.
- `TravelFeature`, `SalesFeature`, `AdminFeature` — travel, sales, and administration.

### `frontend/app/production-front-desk.tsx`

- `ProductionFrontDesk` — production front-desk lists and actions.
- `ProductionGuests` — production guest directory and editing.
- `ProductionReservationGuests` — guest links and identity-document actions for a reservation.

### `frontend/lib/offline-db.ts`

- `BrainadzHospitalityOfflineDb` — Dexie database definition.
- `cacheCloudPayload`, application snapshot helpers — local read cache.
- `createLocalWalkInReservation` and sync status helpers — offline reservation queue.
- `generateOfflineBill`, bill status helpers, `createOnlineFolioPdf` — billing documents.
- `getOfflineReadiness` and `getRecoveryIssues` — device and recovery diagnostics.

## Backend map

- `backend/src/app.ts`, `backend/src/server.ts`, `backend/src/dev.ts` — HTTP application creation and runtime entry points.
- `backend/src/api/routes.ts` — complete API registration list; each handler lives under the matching `backend/src/api/` path.
- `backend/src/services/reservations/` — availability, validation, transitions, persistence, guest links, and reservation lifecycle.
- `backend/src/services/front-desk/` — arrivals/in-house/departures, room assignment, check-in/out, keys, room moves, and late checkout.
- `backend/src/services/guests/` — guest profile, history, and identity-document behavior.
- `backend/src/modules/billing/` — folio calculations, charges, discounts, payments, refunds/reversals, invoices, PDFs, and checkout validation.
- `backend/src/modules/operations/service.ts` — housekeeping, inspections/damage, maintenance, inventory, and restaurant mutations.
- `backend/src/services/auth/` and `backend/src/services/profile.ts` — identity, sessions, actor/property authorization, Google login, and user profile data.
- `backend/src/services/demo-store.ts` and `backend/src/demo/storage.ts` — demo-mode state and persistence.
- `backend/src/db/schema.ts` — PostgreSQL tables; `backend/src/db/index.ts` — database connection.
- `backend/drizzle-postgres/` — current PostgreSQL production migrations. `backend/drizzle/` contains the earlier migration history; migration files should only be changed through an explicit database task.
