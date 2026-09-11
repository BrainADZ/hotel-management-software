# Step 6 — Travel production backend

Production Travel data is exposed under `/api/travel` and authorized with the authenticated organisation. Travel access does not require an active Hotel property. `TRAVEL_AGENT` and `TOUR_MANAGER` users can therefore load their workspace with organisation membership alone.

The Travel snapshot returns scheduled packages, assets, custom packages and items, discount requests, inquiries, and persisted follow-ups. Mutations use dedicated inquiry, package pricing, discount decision, and follow-up endpoints. Every lookup and update includes the authenticated organisation ID; meaningful mutations write to the existing audit log with a null property ID and `PRODUCTION_TRAVEL_API` source.

Migration `backend/drizzle-postgres/0006_travel_production.sql` adds inquiry update metadata and the `travel_follow_ups` table. Existing Travel package, asset, custom package, discount, and inquiry tables are reused.

The frontend production dispatcher uses an explicit command allowlist. Travel commands can only resolve to `/api/travel/*`, reservation actions require a valid reservation ID, and unsupported commands throw before an HTTP request is made.

Step 6 does not add supplier management, vouchers, Travel payments, external messaging, or full tours/participants/manager persistence.
