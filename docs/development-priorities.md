# Development priorities after the POS audit fixes

## Completed in this change

- Registered restaurant settlement in the backend HTTP router.
- Cash retries validate the original received amount from the existing payment audit record. Receipt numbering and payment storage remain shared with hotel billing.
- Settlement totals use active RECEIVED payment records. Guest-folio orders reject direct settlement.
- Partial payment updates the displayed balance and permits the next payment in the same dialog. Uncertain network/server results retain the original request and key for retry.
- Restaurant payments support PDF download through the shared receipt endpoint and renderer. Folio receipt permissions remain restricted.
- Restaurant refunds and mistaken-entry reversals use the existing billing endpoints, permissions, ledger and audit records. Refunds require the separately applied 0015 migration described below.
- Normalized the existing payment source constraint in the 0014 snapshot. Historical SQL and database data were not edited.
- Report date and chart widths use current values.
- Added HTTP regression tests using the real router and billing service with a mocked database. These do not verify live PostgreSQL concurrency or browser interaction.
- Pending restaurant payments now survive reloads in the same browser tab using session storage scoped to property, cashier and order. The original request/key is saved before sending and restored for retry; even an already-paid order exposes recovery. Browser/tab closure, another device, and cleared browser storage still require server-side payment-history reconciliation.

## Next work, in order

Read-only deployment inspection (18 September 2026): Phase 3 objects exist; 0014 is recorded with a final-newline/line-ending hash difference; 0015 is not recorded and refund folio_id is still NOT NULL. TEST_DATABASE_URL is absent. See [refund acceptance and deployment checklist](restaurant-refund-acceptance.md). `npm run db:check-restaurant` in backend repeats the catalog check without data writes.

Payment history and reprints are now implemented: open **Payments & receipts** from the kitchen board or the restaurant order table (paid orders included). History loads recorded payments from the server, shows tender/change when original audit details exist, and downloads the original numbered PDF again without creating a payment. New payments wait for a successful history load. This supports reviewing recorded payments after tab closure or on another authorized device; it does not recover a lost idempotency key for an unconfirmed request. Missing cash audit details are explicitly unavailable.

1. **Run acceptance tests on a separate test database and browser.** Walk-in dine-in and takeaway; linked guest orders; CARD/UPI partial payment plus cash completion; same-key retries; simultaneous cashiers; PDF printing; connection loss during payment; checkout inspection regression. Verify actual payment totals, audit entries, and receipt uniqueness. Do not use live business records for destructive tests.
2. **Review and deploy restaurant refund support, then acceptance-test it.** Code supports partial/full refund recording, required reason, optional transaction reference, same-key replay validation, payment/order transaction locks, remaining refundable limits, net order balances, refund history and PDF totals. The UI records money already returned; it does not initiate bank/card/UPI transfers or cancel order charges. Uncertain requests retain their exact key/details in session storage across same-tab reloads. After tab closure or cleared storage, inspect recorded refunds before returning or recording money again. Mistaken-entry reversal is blocked for payments with recorded refunds.

   Generated migration: `backend/drizzle-postgres/0015_ordinary_george_stacy.sql` only drops NOT NULL on `payment_refunds.folio_id`; the existing payment FK identifies the restaurant order. Existing folio refund rows and all earlier SQL remain unchanged. Migration is **not applied**; refund writes for restaurant payments require it. A second `db:generate` reports no schema changes. Review/apply separately under deployment authorization, then verify partial/full refunds, retry after timeout/reload, cross-role/property rejection, over-refund races, refund versus reversal, replacement settlement, and receipt totals on a separate test database/browser.
3. **Harden offline continuity.** Test first load, expired offline access, browser restart, sync conflicts and multiple devices. Same-tab page reload recovery is implemented; add server-side payment history/reconciliation for closed tabs, cleared storage and another device. Payments must remain server-authoritative.
4. **Finish operational reports.** Add property date ranges, payment-method reconciliation, restaurant sales/GST summaries, and exports. Define accounting cut-off/business date before introducing Night Audit scheduling.
5. **Complete rate and accounting features.** Persist seasonal/corporate rate plans and restrictions; design credit notes and accounting exports against the existing invoice lifecycle.
6. **Connect external providers.** Select providers and obtain sandbox credentials/documentation for payment collection, WhatsApp/email, OTA/channel manager, and locks. Implement authenticated callbacks, retry/idempotency and reconciliation before enabling real transactions or messages.
7. **Prepare deployment.** Validate backup/restore on a test copy, confirm production configuration, test printers and staff roles, address client bundle size, and complete user acceptance before deployment.

Restaurant order cancellation/editing after kitchen dispatch and shift/cash-drawer reconciliation should be specified alongside restaurant corrections. They are not implemented by the current settlement fixes.

Acceptance prerequisite: `TEST_DATABASE_URL` was not configured during the follow-up check. No PostgreSQL write-based acceptance tests were run. Use a separately provisioned test database with the reviewed schema; do not point the workflow verification script at live hotel data.
