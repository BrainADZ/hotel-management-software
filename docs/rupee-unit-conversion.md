# Rupee unit conversion status

Requested target: rupees throughout the UI, API and database, with ₹ for currency presentation.

## Implemented

- Shared money displays retain two decimal places and show ₹.
- Operational rate/menu forms and travel catalog/inquiry forms accept rupees, including decimal amounts. Editing converts the existing amount to rupees; submission converts back to the current API contract exactly once.
- Cloud/offline PDF amounts render a vector ₹ symbol because their built-in fonts do not support that character.
- Restaurant receipt tender/change notes and checkout outstanding-balance messages use ₹.

## Still pending: API and storage unit migration

The application still stores and exchanges integer amounts in its existing `*Paise` / `*_paise` fields. Display/input work above is **not** a completed database or API conversion. No stored financial amount has been changed and no currency migration has been applied.

A complete switch must be deployed atomically across these boundaries:

1. PostgreSQL monetary columns: use exact `numeric(..., 2)` rupee values, convert each existing amount once by dividing by 100, rename columns and update associated checks/defaults. Existing historical migrations remain immutable.
2. Billing, GST, discount, damage, travel and reporting calculations: retain exact two-decimal rounding, especially split CGST/SGST and per-night tax calculations. Amount thresholds must also be converted; tax basis points and quantities must not be scaled.
3. API schemas, public field names, application types, seed fixtures and all consumers: change them together so an old amount can never be interpreted as a new unit. Use an explicit contract version and reject incompatible clients.
4. Browser IndexedDB records, cached snapshots, pending payment/refund requests and offline queues: version and migrate them without replaying a request under a changed financial unit. Preserve idempotency and outstanding in-flight operations.
5. Audit/idempotency history and issued invoices: preserve the original records and their original unit; use version-aware readers rather than rewriting historical accounting evidence.
6. Reconcile pre/post totals on a separate database copy and run payment/refund/reversal, tax, invoice, offline replay and concurrency acceptance tests before deployment.

The existing instruction prohibits running `db:migrate`; a live unit conversion has not been authorized for execution. A literal replacement of column/property names or of the word “paise” would not accomplish this conversion and could change financial values by a factor of 100.
