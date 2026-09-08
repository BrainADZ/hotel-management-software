# Release boundaries

## Production adapters still required

The current payment gateway, WhatsApp, email, channel manager and smart-lock surfaces are labelled sandbox or awaiting API. They demonstrate internal contracts and status handling; they do not claim live provider connectivity.

Before a client production launch:

- Disable `DEMO_ROLE_SWITCHER` and `DEMO_NETWORK_SIMULATOR`.
- Require the scaffolded ChatGPT/Sites authentication gate or replace it with the approved organisation identity provider.
- Map authenticated users to persisted property-scoped roles; never trust a role header from the browser.
- Apply the generated Drizzle migration through the deployment environment.
- Provide production payment, messaging, channel-manager and lock credentials through secret bindings.
- Complete data-retention, privacy, GST invoice-number, tax, backup and disaster-recovery sign-off.
- Run load, accessibility, printer, outage, reconnect and restore drills on the actual registered device and network.
- Replace neutral demo data with an approved import plan; do not copy demo identifiers into production.

## Current mutation coverage

Reservations, property connectivity simulation, contact tracking, check-in, checkout, restaurant posting, folio adjustment, housekeeping status, offline document upload and offline verification are operational. Maintenance, inventory, package, tour and CRM boards are realistic read models in this milestone; their full create/edit workflows are the next implementation slice.
