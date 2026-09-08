# Production front desk, guests, and KYC

Step 3 adds PostgreSQL-backed guest profiles and front-desk operations. It is enabled only in production mode and always uses the authenticated organisation and active property context.

## Migration

Apply `drizzle-postgres/0002_front_desk_guest_kyc.sql` after migrations `0000` and `0001`. The migration is additive: it enriches `guests`, adds property check-in policy fields, backfills existing guest organisation/display data and primary reservation links, then creates `reservation_guests`, `guest_identity_documents`, `stays`, and `stay_key_issues`. It does not delete existing data.

## KYC storage boundary

The API accepts only the final four alphanumeric characters of an identity number. PostgreSQL stores a masked display value such as `XXXX XXXX 1234`; complete Aadhaar, passport, driving-licence, or voter-ID numbers and document scans are outside this storage model. A future scan workflow must use a private object-storage adapter with encryption, short-lived access, retention rules, and access logging. Audit records contain the document type only.

## Operations

- Guest APIs provide paginated property-scoped create, read, edit, search, reservation/stay history, companion linking, and identity metadata.
- Front-desk lists use the selected property's timezone and cover arrivals, expected arrivals, checked-in/in-house guests, departures, and no-shows.
- Room assignment rechecks room scope, activity, operational status, occupancy, and reservation overlap.
- Check-in validates room assignment/availability/readiness, guest contact details, verified KYC policy, reservation state, and configured check-in time. The transaction changes the reservation to `CHECKED_IN`, the room to occupied, creates the stay and optional key records, and appends reservation/audit events.
- Dirty-room and early check-in overrides require `frontdesk.override`, which is granted only to owners and managers.
- Room moves require a reason and atomically dirty/vacate the old room, occupy the clean destination room, update the reservation/stay, and append `ROOM_MOVED` history.
- Late checkout is metadata only. Reception can request it; an owner or manager decides it. No fee is calculated in this phase.
- Check-out closes the stay and marks its room vacant and dirty in one transaction, preserving the existing production action while keeping room state consistent.

Registration-card PDF and signature capture are deferred. No signature data is stored and the product does not claim a legally valid digital signature workflow.
