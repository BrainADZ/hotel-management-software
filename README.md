# Hotel Management Software

One npm-workspace repository preserving the existing Step 1–3 UI and workflows. No Step 4 functionality is added.

```text
frontend/
  app/                  Existing pages, components, CSS and PWA registration
  lib/api/client.ts     Central HTTP client
  lib/offline-db.ts     Existing browser offline state
  public/               Existing images, logos and service worker
backend/
  src/api/              Existing HTTP contracts and explicit route registry
  src/services/         Auth, permissions, reservations, guests, Front Desk
  src/db/               PostgreSQL connection and Drizzle schema
  src/demo/             SQLite and retained-file demo adapters
  src/app.ts            Fastify HTTP adapter, CORS and structured errors
  src/server.ts         Backend entry point
  drizzle-postgres/     Unchanged migrations 0000–0002 and snapshots
  drizzle/              Archived original demo migrations
shared/                 Dependency-free existing domain helpers, enums and types
```

Prerequisites: Node.js 22.13+ (Node 24 recommended), npm, and PostgreSQL for production. PowerShell users with execution restrictions can use `npm.cmd` instead of `npm`.

Run `npm install` from the repository root. Copy `backend/.env.example` to `backend/.env` and `frontend/.env.example` to `frontend/.env.local`. Real environment files are gitignored; examples contain placeholders only.

Frontend configuration uses `NEXT_PUBLIC_API_URL=http://localhost:4000`. All application API requests, including demo requests, use `frontend/lib/api/client.ts` and include credentials. Set the public backend URL before building for deployment. It must target the authenticated backend gateway in production. Never place database credentials or gateway secrets in frontend configuration.

Backend configuration:

- `APP_MODE=production` uses PostgreSQL; `demo` enables existing demo workflows.
- `DATABASE_URL` points to the existing `hotel_management` database. Replace placeholder credentials locally and configure `DATABASE_SSL` and `DATABASE_POOL_SIZE` appropriately.
- `AUTH_PROVIDER=trusted-hosting` and `AUTH_TRUSTED_PROXY_SECRET` enable the existing trusted identity adapter. The secret requires at least 32 characters. Production authentication otherwise fails closed.
- `FRONTEND_ORIGINS=http://localhost:3000` is a comma-separated list of exact origins. Wildcards are rejected. Credentialed CORS allows only listed origins; other browser origins receive a structured 403.
- `PORT=4000` and `HOST=127.0.0.1` are defaults. Set the host explicitly for containers.
- `DEMO_DATA_DIR=./data` stores backend-only SQLite demo data and retained files. Demo storage opens lazily and is blocked in production.

The existing trusted gateway must authenticate the browser session, strip incoming identity/proof headers, and inject verified identity headers plus the backend-only proof on requests to the backend. PostgreSQL user, organisation, property and permission checks remain authoritative. CORS and cookies alone do not authenticate users. See [production foundation](docs/production-foundation.md) for identity provisioning; historical server paths now live under `backend/src/services/` and `backend/src/db/`.

Run both apps from the root:

```sh
npm run dev
```

Frontend: http://localhost:3000. Backend: http://localhost:4000. Independent commands are `npm run dev:frontend` and `npm run dev:backend`.

The frontend obtains non-secret mode from `/api/runtime` before mounting the existing UI. Existing context/auth, properties, reservations, availability, rooms, guests/KYC, Front Desk, reservation/stay actions, demo and booking-intake URLs retain their paths. Production APIs use PostgreSQL; demo APIs use backend SQLite. Existing browser IndexedDB functionality remains client state. Existing Cloudflare D1/R2 demo data is not automatically imported into the new Node demo store.

Run existing migrations only when needed:

```sh
npm run db:migrate
# equivalent: npm run db:migrate -w backend
```

Step 4 adds the single additive migration `backend/drizzle-postgres/0003_billing_payments_gst.sql`. Back up the existing database, review the configured property billing profile and run the migration once before enabling production billing. Configure each property's legal name, billing address/state, GSTIN, invoice/receipt prefixes, tax rate and tax mode (`CGST_SGST`, `IGST` or `EXEMPT`) in PostgreSQL through your controlled administration process. The software applies configured tax settings; it does not determine legal tax treatment.

Production billing APIs are under `/api/folios`, `/api/payments`, `/api/invoices`, and `/api/reservations/:id/financial-checkout`. Receipt and invoice PDF endpoints return immutable ledger/snapshot data. Payment gateway processing, gateway refunds, card storage/tokenization, credit notes, Night Audit scheduling, accounting exports and external delivery remain deferred.

This reads `backend/.env`. PostgreSQL migrations 0000–0002 and snapshots are unchanged. This refactor requires no migration, schema reset or database drop. Do not regenerate migrations merely for file separation.

Validation:

```sh
npm run typecheck
npm run test
npm run lint
npm run build
npm run build:frontend
npm run build:backend
```

Start built applications using `npm run start -w frontend` and `npm run start -w backend`. Backend tests remain with backend services, domain tests live in `shared`, and offline-state tests live in `frontend`. Additional tests cover HTTP authentication/errors, CORS, dynamic routes and SQLite transaction rollback.

For the production smoke test, first configure the existing database and trusted gateway. Create a reservation and refresh; verify Today's/Expected Arrivals; edit guest phone/email and refresh; save masked Aadhaar last four; assign a room; check in; confirm In-House. Also exercise reservation edits, dates/room changes, cancel/hold/release/no-show, availability/history, room move, late checkout and checkout using suitable test records. Confirm browser API requests reach the backend origin. Automated domain tests do not replace authenticated PostgreSQL smoke testing.
