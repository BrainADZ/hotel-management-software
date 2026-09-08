# Production foundation ? step 1

## Modes and rollout boundary

`APP_MODE=demo` explicitly enables the existing UAT application, role switcher, network simulator and inbound booking sandbox. Copy `.env.example` for local UAT. Keep demo and production databases/deployments separate. The legacy demo store continues to use its isolated Cloudflare D1 binding so the existing UI remains operational. Production application repositories use PostgreSQL only. Missing mode defaults to production except under `NODE_ENV=development`; an invalid value fails closed to production.

`APP_MODE=production` ignores all `DEMO_*` flags. `/api/demo` and `/api/bookings/inbound` return 401 without an authenticated application context and 403 for authenticated callers. The demo store/seed helper independently refuses production calls. No production reservations, billing, POS, OTA or other operational modules are implemented here.

The existing frontend, sidebar, logos, layouts, Hotel/Travel navigation and demo API contract are unchanged. It still calls `/api/demo`; in production these operational screens cannot load until the next phase connects them to scoped production modules. This foundation exposes context endpoints, not a finished production hotel application. Existing offline demo storage is not production authentication and must not be promoted to real hotel data.

## Authentication and trust boundary

All new backend callers use `requireApplicationContext(request)` or `requireAppActor(request)` from `lib/server/auth/actor.ts`. Application code receives typed context and does not read hosting identity headers.

The existing `app/chatgpt-auth.ts` helper had no callers. It and its sign-in/sign-out redirect utilities are retained; identity parsing now delegates to the shared session adapter. That helper returns a hosting identity only; application APIs must still resolve the database actor.

The adapter is disabled by default. To enable it, configure `AUTH_PROVIDER=trusted-hosting` and a random, server-only `AUTH_TRUSTED_PROXY_SECRET` of at least 32 characters. A trusted gateway must first authenticate the hosting session, strip ALL incoming `oai-authenticated-*` and `x-app-auth-proxy-secret` headers, then inject verified subject/email and `x-app-auth-proxy-secret`. It must never forward browser-supplied identity claims as verified. Use TLS on the gateway-to-origin connection and block direct public origin access. Keep the proof secret out of clients, logs and public environment variables; rotate it through server secret management. The adapter compares fixed-length SHA-256 digests in constant time. Raw identity headers alone are never sufficient.

This is an integration contract, not proof that the current hosting service already supplies that gateway. **Production authentication requires external gateway/provider configuration and verified header sanitization before deployment.** If the host cannot satisfy this contract, implement a provider-verified session adapter here before enabling production access. Do not weaken the proof check to get sign-in working. No passwords, localStorage authentication, auto-provisioning, or user registration were introduced.

Verified `(auth_provider, auth_subject)` maps to exactly one pre-provisioned `app_users` record. A global unique index prevents ambiguous cross-tenant identity mappings. Email is metadata, never the lookup key. Name, email, role, organisation and assigned property come from the database. Missing identity returns 401; unprovisioned/inactive users, unknown roles and inactive organisations return 403. Internal errors return a generic 500 without stack traces.

## Organisation and property scope

`organisations` and `properties` gain active flags; all three foundation tables gain nullable `updated_at`. Nullable timestamps preserve historic seed rows without inventing update events. Trusted provisioning must populate/update timestamps when records change. Only identity-link fields were added to users; address, GST, payment fields and last-login tracking are deferred because this phase does not use them.

The existing `AppRole`, `businessUnitsForRole`, `roleCan` and `assertRoleCan` remain the permission system. Context authorization does not replace action-level permission checks in future modules.

- OWNER: all active properties in their organisation are permitted. Can select one as active.
- MANAGER: only their existing `app_users.property_id` assignment. Multi-property manager membership is intentionally deferred; no extra membership table or role overrides.
- Other hotel roles: only their active assigned property; missing/inactive assignment returns 403.
- TRAVEL_AGENT / TOUR_MANAGER: organisation-level Travel access, no Hotel property access.
- OWNER/MANAGER without a hotel assignment/property may still have organisation-level Travel context. A future Hotel operation must require a non-null validated property.

The repository scopes property SQL by organisation and, for non-owners, assigned property, and excludes inactive properties. `requirePropertyAccess` validates a selector against the current actor. Cross-organisation/missing/inactive property selectors return the same 403. Future property queries must combine the authenticated organisation and selected property with action permission checks; never fall back to demo IDs or accept browser roles. `PROPERTY_ID` / `ORGANISATION_ID` are explicitly documented compatibility aliases for demo constants only.

## Endpoints and active property selection

GET `/api/context` and GET `/api/auth/me` return `{ user, organisation, property, properties, businessUnits }`. GET `/api/properties` returns `{ properties, property }`. Responses expose minimal fields and use `Cache-Control: no-store, private`.

GET `/api/context?propertyId=<id>` (also supported by the other context endpoints) validates the requested active property server-side. Without a selector the assigned property is preferred; owners may default to their first active permitted property. Selection is request-scoped, with no cookie or database mutation. This is the backend switching foundation: a future client can carry its selected ID on each request, and each future operation must revalidate it. Selecting a property grants no new access and is not persisted across requests. No new header UI was introduced.

## Migration and external setup

Production PostgreSQL migration: `drizzle-postgres/0000_production_foundation.sql`, generated with `npm run db:generate -- --name production_foundation`. It creates the complete current schema in PostgreSQL because this is the first production PostgreSQL baseline. The old `drizzle/` SQLite history remains untouched and belongs only to the legacy demo/UAT database. New production migrations must be generated in `drizzle-postgres/`; do not apply the two dialect histories to the same database.

Before enabling production:

1. Provision PostgreSQL, set the server-only `DATABASE_URL`, choose `DATABASE_SSL=require` for hosted databases (the default), and set an appropriate `DATABASE_POOL_SIZE`. Apply `drizzle-postgres/` with `npm run db:migrate`. No remote migration was applied by this task. The Cloudflare D1 `DB` binding is still required only for the existing demo/UAT store and must use a separate, non-production dataset.
2. Create the real organisation, active properties and application users through trusted administration. Set each user's organisation, validated same-organisation property assignment and existing role. Set `auth_provider=trusted-hosting` and the verified provider subject. No demo user is automatically linked or promoted. The model currently supports one organisation per external identity.
3. Configure and verify the trusted authentication gateway, secure secret injection, header stripping, origin restriction and sign-in/out hosting routes. Keep `AUTH_PROVIDER=disabled` until ready.
4. Set `APP_MODE=production`, real `NEXT_PUBLIC_SITE_URL`, and all demo flags to false for clarity (production enforces their disablement regardless).
5. Smoke-test unauthenticated 401, inactive-user 403, tenant/property isolation and context responses against the configured gateway before introducing real operational data.

Environment switches live in `.env.example`; no credentials are committed. This runtime already uses server `process.env`; ensure deployment configuration exposes those variables to the Worker server and never through `NEXT_PUBLIC_*`. The PostgreSQL driver uses a small connection pool and disables prepared statements for transaction-pooler compatibility. Confirm that the selected Cloudflare runtime/deployment supports outbound PostgreSQL TCP connections, or place a compatible PostgreSQL pooler/proxy in front of the database.

## Validation and next phase

Focused tests cover unauthenticated/forged identity, inactive users/organisations, server-side roles, cross-tenant property denial, owner/manager/normal-role access, Travel restrictions, demo isolation, blocked legacy endpoints/seed helpers, safe errors, and PostgreSQL schema/identity constraints. Run `npm run typecheck`, `npm run test`, `npm run lint`, `npm run build`.

The production reservation lifecycle is now implemented as Step 2 and documented in `docs/production-reservations.md`. Production login setup, provisioning tools, multi-property manager assignments, persistent active-property UI and production offline storage remain incomplete. Other operational modules still use the demo boundary until their later phases.
