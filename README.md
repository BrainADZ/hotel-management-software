# BrainADZ Hospitality OS

A unified hotel, travel, guest, billing, restaurant, housekeeping, maintenance, inventory, CRM and reporting workspace. The current milestone is a deployable, neutral-data operating prototype built around one non-negotiable rule: the Master Hub owns reservations and financial truth.

## Run locally

```bash
npm install
npm run dev
```

Open `http://localhost:3000`.

Quality commands:

```bash
npm run typecheck
npm run lint
npm test
npm run build
```

## Implemented in this milestone

- Availability-first hospitality dashboard in the BrainADZ sage/ivory design system
- Master Hub reservations with date and room-availability validation
- Front desk arrivals, departures, in-house stays, check-in and checkout
- Guest profiles and authoritative cloud folios
- Restaurant-to-room posting with active-stay validation
- Focused housekeeping service queue with Done, Guest refused and Come later outcomes
- Checkout inspection, damage reporting and manager-approved guest charges
- Hotel and restaurant inventory add/edit with optimistic concurrency and automatic before/after audit history
- Server-enforced Hotel Operations and Travel & Sales workspaces
- Custom travel package builder, manager base/floor pricing and below-floor approval workflow
- Live front-desk, website and OTA booking feed with idempotent provider intake
- Calculated occupancy, ADR, RevPAR and exportable operational reporting
- Role-scoped server responses, audit events and sandbox provider labelling
- Registered-device offline cache for existing bookings, guests and folios plus a local walk-in reservation queue
- One-click folio PDF download plus local offline bill generation/download with stay duration, IndexedDB retention, print/reprint records and restart journal
- Reconnect upload to R2 with PDF type, size and SHA-256 integrity checks
- Idempotent offline walk-in synchronization followed by controlled bill reconciliation
- Restaurant meal commitments, arrival preparation lists and filtered CSV downloads
- Installable PWA shell with online-first updates and offline fallback

## Platform services

- React 19 and Vinext application runtime
- PostgreSQL for production application data; isolated Cloudflare D1 for legacy demo/UAT records
- Cloudflare R2 for uploaded offline bill documents
- Drizzle schema and generated SQL migration
- Dexie/IndexedDB for registered-device continuity data
- jsPDF bundled with the client so PDF generation remains available after connectivity is lost

The local demo property is `Meridian Grand Hotel`; it is intentionally not a client identity. Demo roles and the outage simulator are controlled by the flags in `.env.example`. Set both flags to `false` before attaching production identities or data.

See [docs/architecture.md](docs/architecture.md), [docs/offline-runbook.md](docs/offline-runbook.md), and [docs/release-boundaries.md](docs/release-boundaries.md).
