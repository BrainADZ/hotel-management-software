# Restaurant refunds: deployment and acceptance

## Verified on the configured database, 18 September 2026

Read-only catalog inspection found all Phase 3 restaurant/payment columns, both restaurant payment indexes, the restaurant payment FK, `chk_payments_source` and `chk_restaurant_orders_paid_paise`.

0014 has a migration ledger entry at its journal timestamp. Its recorded hash matches the current SQL with a final-newline/line-ending variant, rather than the exact current file bytes. Git history also shows a final newline added between commits 400c0da and 04d42ae. Do not rewrite the ledger or historical SQL to hide this difference.

0015 is not recorded. `payment_refunds.folio_id` remains NOT NULL, so restaurant refund writes are not ready. No migration or business-data change was made during inspection.

`TEST_DATABASE_URL` is not configured. Real database refund/concurrency tests and browser acceptance remain pending. Existing automated HTTP tests use mocked database results.

## Repeat the inspection

From `backend`, run `npm run db:check-restaurant`. The script uses an explicit read-only transaction and reads catalogs and the migration ledger only. It returns a nonzero exit code for missing prerequisites or an exact hash mismatch. It does not apply migrations or print credentials.

For an independently provisioned test database, configure `TEST_DATABASE_URL` in the local environment and use `npm run db:check-restaurant -- --test`. Configure `TEST_DATABASE_SSL=disable` only if that test server does not use SSL. Missing test configuration fails before opening a connection; it does not fall back to the business database.

## Next steps

1. Obtain explicit deployment authorization before applying the already-reviewed 0015 migration. The existing instruction prohibits running `db:migrate`; this checklist is not authorization. SQL contains only `ALTER TABLE "payment_refunds" ALTER COLUMN "folio_id" DROP NOT NULL;`.
2. Provision a separate test database with the reviewed application schema. Do not run the existing workflow verification script on live business data: it inserts and deletes fixtures.
3. On that test environment, sign in as an authorized manager/owner and use Restaurant → Payments & receipts → Record refund. Record only money already returned; this feature does not initiate provider transfers or cancel food charges.
4. Execute the cases below, then repeat the readiness inspection on the deployment target before release. Document the known newline hash difference separately from an unapplied migration.

| Case | Expected evidence |
| --- | --- |
| Order INR 850, card receipt INR 850, refund INR 250 | One refund record/audit; paid INR 600, outstanding INR 250; original receipt shows refunded INR 250 and net INR 600 |
| Refund remaining INR 600 | Paid zero, outstanding INR 850, settled_at cleared; further refund on original payment rejected |
| Retry same refund after timeout and same-tab reload | Original request/key recovered; exactly one refund and audit entry |
| Same key with changed amount, reason or reference | Conflict; no new refund |
| Two simultaneous refunds exceeding remaining receipt amount | Only valid amount recorded; no negative net payment |
| Refund concurrent with payment reversal | Serialized result; refunded payment cannot be reversed, reversed payment cannot be refunded |
| Replacement settlement after refund | Net paid reaches total exactly; original refunds remain visible |
| Restaurant-only staff / different property | Unauthorized correction rejected; no financial writes |
| Reprint after partial/full refund | Same receipt number, correct refunded/net totals, no additional payment |
| Tab closed or storage cleared after uncertain result | Review server refund history before recording again or returning money again |

Use only test fixtures for these actions. A passing unit suite or build does not establish live concurrency or browser acceptance.
