# Architecture and authority model

## One authoritative write path

The Master Hub is the system of record for reservations, inventory allocation, folios and payments. A property terminal never becomes a second PMS during an outage.

```text
Master Hub / D1
  ├─ reservation, inventory and folio authority
  ├─ role-scoped API and audit trail
  └─ reconciliation records
          │ online cache refresh / reconnect reference upload
          ▼
Registered property device
  ├─ cached existing guest and stay lookup
  ├─ device-local walk-in reservation queue
  ├─ local bill document preparation
  ├─ IndexedDB PDF, hash, print count and recovery journal
  └─ no payment or folio mutation while offline
```

When the property is offline, the Master Hub can still receive direct, web or OTA bookings. Those records are tagged for operational contact. A registered front-desk device may save a walk-in reservation intent locally; room allocation remains provisional until reconnect. Amend, cancel, hold, check-in, checkout and charge-posting calls are rejected with `MASTER_HUB_REQUIRED`.

The live booking feed accepts authenticated provider-created bookings at `/api/bookings/inbound`. Provider references are unique and retries return the original reservation rather than duplicating it. Visible browser sessions refresh automatically; a truly offline property receives the authoritative changes only after reconnection.

## Business workspaces

Hotel and travel data are segregated in both navigation and API responses. Hotel roles receive only property, reservation and operations data. Travel roles receive only inquiries, package assets, custom quotes and discount requests. Owner and Manager roles can switch workspaces; fixed roles cannot request the opposite dataset.

Travel package prices are recalculated from server-owned asset prices. A pricing manager sets the base and floor. Sales quotes at or above the floor are immediately ready to send; a lower quote creates a version-bound approval request. Approval is explicit and audited.

## Persistence

- D1 stores organisations, properties, users, rooms, guests, reservations, folios, folio lines, offline bill references, operations, travel assets, custom packages, discount approvals, CRM, integrations and audit events.
- R2 stores offline PDF documents under a property-scoped key after validating PDF signature, a 5 MB limit and the client-generated SHA-256 hash.
- IndexedDB stores only the registered device’s bounded continuity cache, local walk-in queue, local bill records, PDF blobs, print counts, sync metadata and recovery journal.

## Reconciliation

Reconnect synchronizes local walk-in reservations first through an idempotent device operation ID, then uploads documents and references. The server compares booking reference and total against the current folio. Exact matches can be manually linked and verified by authorised roles. Missing, ambiguous or mismatched records remain in review states. Local bill amounts are never posted automatically.

## Access control

The UI removes inaccessible modules for focused roles, while the API independently redacts or removes guest, folio, offline-document, operations, travel and audit datasets. The role switcher is a neutral-data UAT feature; disable it before production identity integration.
