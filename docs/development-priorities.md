# Development priorities after the POS audit fixes

## Completed in this change

- Registered restaurant settlement in the backend HTTP router.
- Cash retries validate the original received amount from the existing payment audit record. Receipt numbering and payment storage remain shared with hotel billing.
- Settlement totals use active RECEIVED payment records. Guest-folio orders reject direct settlement.
- Partial payment updates the displayed balance and permits the next payment in the same dialog. Uncertain network/server results retain the original request and key for retry.
- Restaurant payments support PDF download through the shared receipt endpoint and renderer. Folio receipt permissions remain restricted.
- Unsupported restaurant refunds/reversals return an explicit error before any accounting write.
- Normalized the existing payment source constraint in the 0014 snapshot. Historical SQL and database data were not edited.
- Report date and chart widths use current values.
- Added HTTP regression tests using the real router and billing service with a mocked database. These do not verify live PostgreSQL concurrency or browser interaction.
- Pending restaurant payments now survive reloads in the same browser tab using session storage scoped to property, cashier and order. The original request/key is saved before sending and restored for retry; even an already-paid order exposes recovery. Browser/tab closure, another device, and cleared browser storage still require server-side payment-history reconciliation.

## Next work, in order

1. **Run acceptance tests on a separate test database and browser.** Walk-in dine-in and takeaway; linked guest orders; CARD/UPI partial payment plus cash completion; same-key retries; simultaneous cashiers; PDF printing; connection loss during payment; checkout inspection regression. Verify actual payment totals, audit entries, and receipt uniqueness. Do not use live business records for destructive tests.
2. **Complete restaurant accounting corrections.** Define refund versus mistaken-entry reversal, role permissions, reasons, idempotency, order balance recalculation, and receipt history/reprint. Reuse the payments/refunds architecture. Any required migration must be new, reviewed, and explicitly applied separately; do not edit 0014.
3. **Harden offline continuity.** Test first load, expired offline access, browser restart, sync conflicts and multiple devices. Same-tab page reload recovery is implemented; add server-side payment history/reconciliation for closed tabs, cleared storage and another device. Payments must remain server-authoritative.
4. **Finish operational reports.** Add property date ranges, payment-method reconciliation, restaurant sales/GST summaries, and exports. Define accounting cut-off/business date before introducing Night Audit scheduling.
5. **Complete rate and accounting features.** Persist seasonal/corporate rate plans and restrictions; design credit notes and accounting exports against the existing invoice lifecycle.
6. **Connect external providers.** Select providers and obtain sandbox credentials/documentation for payment collection, WhatsApp/email, OTA/channel manager, and locks. Implement authenticated callbacks, retry/idempotency and reconciliation before enabling real transactions or messages.
7. **Prepare deployment.** Validate backup/restore on a test copy, confirm production configuration, test printers and staff roles, address client bundle size, and complete user acceptance before deployment.

Restaurant order cancellation/editing after kitchen dispatch, payment history UI, and shift/cash-drawer reconciliation should be specified alongside restaurant corrections. They are not implemented by the current settlement fixes.

Acceptance prerequisite: `TEST_DATABASE_URL` was not configured during the follow-up check. No PostgreSQL write-based acceptance tests were run. Use a separately provisioned test database with the reviewed schema; do not point the workflow verification script at live hotel data.
