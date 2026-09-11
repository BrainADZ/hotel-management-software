"use client";
/* eslint-disable @typescript-eslint/no-unused-vars */

import {
  AlertTriangle,
  ArrowRight,
  Check,
  Download,
  Printer,
  Search,
  X,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { calculateStayNights } from "@hotel/shared/domain";
import {
  createOnlineFolioPdf,
  generateOfflineBill,
  getBillBlob,
  getCachedStay,
  getLocalOfflineBills,
  getOfflineReadiness,
  getRecoveryIssues,
  markBillPrinted,
  searchCachedBookings,
  updateLocalBillStatus,
  type CachedBooking,
  type LocalOfflineBill,
} from "@/lib/offline-db";
import {
  AppGlyph,
  MoneyInput,
  PageHeading,
  Status,
  dateTime,
  downloadBlob,
  money,
  shortDate,
  type PlatformViewProps,
  type Row,
} from "@/app/hotel-platform";

export function OfflineBillingView({
  state,
  propertyRestricted,
  notify,
}: PlatformViewProps) {
  const [query, setQuery] = useState("Arjun Sharma");
  const [bookings, setBookings] = useState<CachedBooking[]>([]);
  const [selected, setSelected] = useState<CachedBooking | null>(null);
  const [localBills, setLocalBills] = useState<LocalOfflineBill[]>([]);
  const [amounts, setAmounts] = useState({
    room: 800000,
    restaurant: 135000,
    other: 0,
    taxRate: 1800,
  });
  const [busy, setBusy] = useState(false);
  const reload = useCallback(async () => {
    setBookings(await searchCachedBookings(query));
    setLocalBills(await getLocalOfflineBills());
  }, [query]);
  useEffect(() => {
    const timer = window.setTimeout(() => void reload(), 0);
    return () => window.clearTimeout(timer);
  }, [reload, state.property.lastSyncAt]);
  async function choose(booking: CachedBooking) {
    setSelected(booking);
    const stay = await getCachedStay(booking.id);
    if (stay?.folio)
      setAmounts({
        room: stay.lines
          .filter((line) => line.category === "ROOM")
          .reduce((sum, line) => sum + line.lineTotalPaise, 0),
        restaurant: stay.lines
          .filter((line) =>
            ["RESTAURANT", "ROOM_SERVICE"].includes(line.category),
          )
          .reduce((sum, line) => sum + line.lineTotalPaise, 0),
        other: stay.lines
          .filter(
            (line) =>
              !["ROOM", "RESTAURANT", "ROOM_SERVICE"].includes(line.category),
          )
          .reduce((sum, line) => sum + line.lineTotalPaise, 0),
        taxRate:
          stay.folio.subtotalPaise > 0
            ? Math.round(
                (stay.folio.taxPaise / stay.folio.subtotalPaise) * 10_000,
              )
            : 1800,
      });
    else setAmounts({ room: 0, restaurant: 0, other: 0, taxRate: 1800 });
  }
  async function generate() {
    if (!selected) return;
    setBusy(true);
    try {
      if (propertyRestricted) {
        const bill = await generateOfflineBill({
          reservationId: selected.id,
          generatedBy: state.actor.name,
          roomChargesPaise: amounts.room,
          restaurantPaise: amounts.restaurant,
          otherPaise: amounts.other,
          taxRateBps: amounts.taxRate,
        });
        downloadBlob(bill.documentBlob, `${bill.offlineReference}.pdf`);
        await reload();
        notify(
          `${bill.offlineReference} generated, saved on this device and downloaded.`,
        );
      } else {
        const reservation = state.reservations.find(
          (item) => item.id === selected.id,
        );
        const folio = state.folios.find(
          (item) => item.reservationId === selected.id,
        );
        if (!reservation || !folio)
          throw new Error("The current cloud folio could not be found.");
        const lines = state.folioLines
          .filter((line) => line.folioId === folio.id)
          .map((line) => ({
            description: String(line.description),
            quantity: Number(line.quantity),
            unitAmountPaise: Number(line.unitAmountPaise),
            taxRateBps: Number(line.taxRateBps),
            lineTotalPaise: Number(line.lineTotalPaise),
          }));
        const pdf = createOnlineFolioPdf({
          bookingReference: String(reservation.reference),
          guestName: String(reservation.guestName),
          roomNumber: reservation.roomNumber
            ? String(reservation.roomNumber)
            : null,
          arrivalDate: String(reservation.arrivalDate),
          departureDate: String(reservation.departureDate),
          folioStatus: String(folio.status),
          subtotalPaise: Number(folio.subtotalPaise),
          taxPaise: Number(folio.taxPaise),
          totalPaise: Number(folio.totalPaise),
          lines,
        });
        downloadBlob(pdf.blob, pdf.filename);
        notify(
          `${reservation.reference} folio PDF downloaded from the current cloud record.`,
        );
      }
    } catch (cause) {
      notify(
        cause instanceof Error
          ? cause.message
          : "The PDF could not be generated.",
      );
    } finally {
      setBusy(false);
    }
  }
  async function handleLocalBill(
    billId: string,
    reference: string,
    print: boolean,
  ) {
    const blob = await getBillBlob(billId);
    if (!blob) return;
    if (!print) {
      downloadBlob(blob, `${reference}.pdf`);
      notify(`${reference} downloaded.`);
      return;
    }
    const url = URL.createObjectURL(blob);
    const frame = document.createElement("iframe");
    frame.hidden = true;
    frame.src = url;
    document.body.appendChild(frame);
    frame.onload = () => {
      frame.contentWindow?.focus();
      frame.contentWindow?.print();
      void markBillPrinted(billId).then(reload);
      window.setTimeout(() => {
        frame.remove();
        URL.revokeObjectURL(url);
      }, 60_000);
    };
  }
  const subtotal = amounts.room + amounts.restaurant + amounts.other;
  const tax = Math.round((subtotal * amounts.taxRate) / 10000);
  return (
    <>
      <PageHeading
        eyebrow="Billing centre"
        title="Billing & PDF downloads"
        description={
          propertyRestricted
            ? "Prepare a local continuity bill from the cached stay and download it immediately."
            : "Download a current folio PDF from the current Master Hub record."
        }
        actions={
          <Status
            value={propertyRestricted ? "OFFLINE CONTINUITY" : "CLOUD FOLIO"}
          />
        }
      />
      <section className="offline-workspace">
        <article className="glass-card cached-search">
          <div className="card-heading">
            <div>
              <p className="section-kicker">Guest search</p>
              <h2>Existing bookings</h2>
            </div>
            <span>{bookings.length} available</span>
          </div>
          <label className="offline-search">
            <Search size={16} />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Guest, booking or room"
            />
          </label>
          <div className="cached-list">
            {bookings.slice(0, 8).map((booking) => (
              <button
                key={booking.id}
                className={selected?.id === booking.id ? "active" : ""}
                onClick={() => choose(booking)}
              >
                <span className="record-icon" aria-hidden="true">
                  <AppGlyph name="room-ready" size={25} />
                </span>
                <span>
                  <strong>{booking.guestName}</strong>
                  <small>
                    {booking.reference} ·{" "}
                    {booking.roomNumber
                      ? `Room ${booking.roomNumber}`
                      : "Provisional room"}{" "}
                    ·{" "}
                    {calculateStayNights(
                      booking.arrivalDate,
                      booking.departureDate,
                    )}{" "}
                    nights
                  </small>
                </span>
                <ArrowRight size={15} />
              </button>
            ))}
          </div>
        </article>
        <article className="glass-card bill-editor">
          <div className="card-heading">
            <div>
              <p className="section-kicker">
                {propertyRestricted
                  ? "Local document preparation"
                  : "Current cloud folio"}
              </p>
              <h2>
                {selected ? selected.guestName : "Select an existing guest"}
              </h2>
              {selected && (
                <p className="stay-inline">
                  {shortDate(selected.arrivalDate)} to{" "}
                  {shortDate(selected.departureDate)} ·{" "}
                  {calculateStayNights(
                    selected.arrivalDate,
                    selected.departureDate,
                  )}{" "}
                  nights
                </p>
              )}
            </div>
            {selected && (
              <span className="room-chip">
                {selected.roomNumber
                  ? `Room ${selected.roomNumber}`
                  : "Provisional room"}
              </span>
            )}
          </div>
          {selected ? (
            <>
              <div className="bill-inputs">
                <MoneyInput
                  label="Room charges"
                  value={amounts.room}
                  disabled={!propertyRestricted}
                  onChange={(room) => setAmounts({ ...amounts, room })}
                />
                <MoneyInput
                  label="Restaurant"
                  value={amounts.restaurant}
                  disabled={!propertyRestricted}
                  onChange={(restaurant) =>
                    setAmounts({ ...amounts, restaurant })
                  }
                />
                <MoneyInput
                  label="Other"
                  value={amounts.other}
                  disabled={!propertyRestricted}
                  onChange={(other) => setAmounts({ ...amounts, other })}
                />
                <label>
                  <span>Tax rate</span>
                  <select
                    disabled={!propertyRestricted}
                    value={amounts.taxRate}
                    onChange={(event) =>
                      setAmounts({
                        ...amounts,
                        taxRate: Number(event.target.value),
                      })
                    }
                  >
                    <option value={1800}>18% configured tax</option>
                    <option value={1200}>12% configured tax</option>
                    <option value={500}>5% configured tax</option>
                  </select>
                </label>
              </div>
              <div className="bill-total">
                <span>
                  <small>Subtotal</small>
                  <strong>{money(subtotal)}</strong>
                </span>
                <span>
                  <small>Tax</small>
                  <strong>{money(tax)}</strong>
                </span>
                <span>
                  <small>Grand total</small>
                  <strong>{money(subtotal + tax)}</strong>
                </span>
              </div>
              <div className="offline-warning">
                <AppGlyph name="policy" size={25} />
                <span>
                  <strong>
                    {propertyRestricted
                      ? "Local document"
                      : "Current folio PDF"}
                  </strong>
                  <small>
                    {propertyRestricted
                      ? "This local reference is not a statutory GST invoice number."
                      : "The PDF uses the current folio lines and server-calculated totals."}
                  </small>
                </span>
              </div>
              <button
                className="primary-button full-button"
                disabled={busy}
                onClick={generate}
              >
                <Download size={16} />{" "}
                {busy
                  ? "Preparing PDF…"
                  : propertyRestricted
                    ? "Generate, save & download offline PDF"
                    : "Download current folio PDF"}
              </button>
            </>
          ) : (
            <div className="empty-state">
              <AppGlyph name="folio" size={42} />
              <strong>Choose an existing booking</strong>
              <p>Select a guest to prepare the PDF.</p>
            </div>
          )}
        </article>
      </section>
      <section className="glass-card local-bills-card">
        <div className="card-heading">
          <div>
            <p className="section-kicker">Device records</p>
            <h2>Offline bills retained locally</h2>
          </div>
          <span>{localBills.length} records</span>
        </div>
        {localBills.length ? (
          <div className="table-card embedded-table">
            <table>
              <thead>
                <tr>
                  <th>Reference</th>
                  <th>Guest / booking</th>
                  <th>Stay</th>
                  <th>Total</th>
                  <th>Status</th>
                  <th>Printed</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {localBills.map((bill) => (
                  <tr key={bill.id}>
                    <td>
                      <strong>{bill.offlineReference}</strong>
                      <small>{dateTime(bill.generatedAt)}</small>
                    </td>
                    <td>
                      {bill.guestName}
                      <small>{bill.bookingReference}</small>
                    </td>
                    <td>
                      {bill.arrivalDate && bill.departureDate ? (
                        <>
                          {shortDate(bill.arrivalDate)} to{" "}
                          {shortDate(bill.departureDate)}
                          <small>
                            {bill.stayNights ??
                              calculateStayNights(
                                bill.arrivalDate,
                                bill.departureDate,
                              )}{" "}
                            nights
                          </small>
                        </>
                      ) : (
                        "Earlier record"
                      )}
                    </td>
                    <td>
                      <strong>{money(bill.totalPaise)}</strong>
                    </td>
                    <td>
                      <Status value={bill.status} />
                    </td>
                    <td>{bill.printCount}×</td>
                    <td>
                      <div className="row-actions">
                        <button
                          className="row-action"
                          onClick={() =>
                            handleLocalBill(
                              bill.id,
                              bill.offlineReference,
                              false,
                            )
                          }
                        >
                          <Download size={13} /> Download
                        </button>
                        <button
                          className="row-action"
                          onClick={() =>
                            handleLocalBill(
                              bill.id,
                              bill.offlineReference,
                              true,
                            )
                          }
                        >
                          <Printer size={13} />{" "}
                          {bill.printCount ? "Reprint" : "Print"}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="empty-state small">
            <AppGlyph name="offline" size={38} />
            <strong>No offline bill created yet</strong>
          </div>
        )}
      </section>
    </>
  );
}
