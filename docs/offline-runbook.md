# Offline continuity runbook

## Readiness check

Open **Offline Centre → Device Status** while online. Billing continuity is ready only when the registered device, app shell, cached application, existing bookings, guest data, active folios and billing template are present. Persistent storage is reported separately. Device and printer power still require battery, UPS, inverter or generator support.

## Simulate an outage in UAT

1. From **Overview**, choose **Simulate hotel offline**.
2. Confirm the property surface shows the red offline banner and restricted continuity label.
3. Open **Offline Billing** and search a booking that was cached before the outage.
4. Select the guest, review the stay duration, room/restaurant/other amounts and configured tax, then generate the local bill.
5. Use **Preview**, **Print** or **Reprint** from the retained device record. Generating another bill creates another reference; normal reprints should use the original record.
6. Use **Save offline walk-in** for an arriving guest who is not already in the cache. Confirm the reservation shows as saved locally with a provisional room.
7. Confirm other cloud mutations remain disabled on the property surface.

## Reconnect

1. Open **Connectivity** and reconnect the property terminal.
2. The application synchronizes queued walk-in reservations first, downloads Master Hub changes, then uploads each eligible local PDF and its reference.
3. Review any walk-in conflict that could not receive a room, then open **Verification** and compare local and Master Hub amounts.
4. Authorised Manager, Accounts or Owner users may **Verify & link** an exact match.
5. A mismatch remains in review. If the Master record was updated through an authorised external process, use the explicit manual Master Hub update action and keep its audit event.

## Safety invariants

- Offline reservation records are walk-in intents only; room allocation remains provisional until synchronization.
- Never amend, cancel, hold, check in or check out a reservation in the offline property cache.
- Never post a local bill amount as a charge during reconnect.
- Never reuse an offline bill ID with different PDF content.
- Never call a prepared document a statutory GST invoice number unless the production tax/invoice service has issued it.
