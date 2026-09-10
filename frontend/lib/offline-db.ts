"use client";

import Dexie, { type EntityTable } from "dexie";
import { jsPDF } from "jspdf";
import {
  calculateBill,
  calculateStayNights,
  createOfflineReference,
  createOfflineReservationReference,
  DEVICE_ID,
  PROPERTY_ID,
} from "@hotel/shared/domain";

export type MealService =
  | "BREAKFAST"
  | "BRUNCH"
  | "LUNCH"
  | "HIGH_TEA"
  | "DINNER"
  | "SUPPER";

export type CachedBooking = {
  id: string;
  reference: string;
  guestId: string;
  guestName: string;
  roomNumber?: string | null;
  roomType: string;
  arrivalDate: string;
  departureDate: string;
  status: string;
};

export type CachedGuest = {
  id: string;
  fullName: string;
  email?: string | null;
  phone?: string | null;
  city?: string | null;
  preferences?: string | null;
  dietaryRequirements?: string | null;
  loyaltyTier?: string | null;
};

export type CachedFolio = {
  id: string;
  reservationId: string;
  subtotalPaise: number;
  taxPaise: number;
  totalPaise: number;
  status: string;
};

export type CachedFolioLine = {
  id: string;
  folioId: string;
  description: string;
  category: string;
  quantity: number;
  unitAmountPaise: number;
  taxRateBps: number;
  lineTotalPaise: number;
};

export type LocalOfflineBill = {
  id: string;
  offlineReference: string;
  bookingReference: string;
  reservationId: string;
  guestId: string;
  guestName: string;
  roomNumber?: string | null;
  arrivalDate?: string;
  departureDate?: string;
  stayNights?: number;
  subtotalPaise: number;
  taxPaise: number;
  totalPaise: number;
  currency: "INR";
  status:
    | "PENDING_MANUAL_MASTER_UPDATE"
    | "MATCHED"
    | "VERIFIED"
    | "MASTER_RECORD_NOT_FOUND"
    | "AMOUNT_MISMATCH"
    | "REVIEW_REQUIRED";
  documentHash: string;
  generatedAt: string;
  generatedBy: string;
  deviceId: string;
  printCount: number;
  uploadedAt?: string;
};

export type LocalOfflineReservation = {
  id: string;
  localReference: string;
  guestId: string;
  guestName: string;
  email?: string | null;
  phone?: string | null;
  city?: string | null;
  dietaryRequirements?: string | null;
  guestCount: number;
  createdById: string;
  createdByName: string;
  createdByRole: string;
  roomType: string;
  arrivalDate: string;
  departureDate: string;
  mealPlan: MealService[];
  source: "OFFLINE_WALK_IN";
  status: "CONFIRMED";
  syncStatus: "PENDING_SYNC" | "SYNCED" | "SYNC_FAILED";
  createdAt: string;
  updatedAt: string;
  syncedReservationId?: string;
  syncedReference?: string;
  syncError?: string;
};

type StoredDocument = {
  id: string;
  billId: string;
  blob: Blob;
  createdAt: string;
};
type KeyValue = { key: string; value: unknown };
type JournalEntry = {
  id: string;
  operation: string;
  status: "STARTED" | "COMPLETED" | "FAILED";
  billId?: string;
  createdAt: string;
  updatedAt: string;
  message?: string;
};

class BrainadzHospitalityOfflineDb extends Dexie {
  deviceMetadata!: EntityTable<KeyValue, "key">;
  preferences!: EntityTable<KeyValue, "key">;
  cachedGuests!: EntityTable<CachedGuest, "id">;
  cachedBookings!: EntityTable<CachedBooking, "id">;
  cachedFolios!: EntityTable<CachedFolio, "id">;
  cachedFolioLines!: EntityTable<CachedFolioLine, "id">;
  offlineBills!: EntityTable<LocalOfflineBill, "id">;
  billDocuments!: EntityTable<StoredDocument, "id">;
  syncMetadata!: EntityTable<KeyValue, "key">;
  recoveryJournal!: EntityTable<JournalEntry, "id">;
  offlineReservations!: EntityTable<LocalOfflineReservation, "id">;

  constructor() {
    super("brainadz-hospitality-front-desk");
    this.version(1).stores({
      deviceMetadata: "&key",
      preferences: "&key",
      cachedGuests: "&id, fullName",
      cachedBookings:
        "&id, &reference, guestId, guestName, status, arrivalDate",
      cachedFolios: "&id, &reservationId, status",
      cachedFolioLines: "&id, folioId, category",
      offlineBills:
        "&id, &offlineReference, bookingReference, reservationId, guestId, status, generatedAt",
      billDocuments: "&id, &billId, createdAt",
      syncMetadata: "&key",
      recoveryJournal: "&id, operation, status, billId, createdAt",
    });
    this.version(2).stores({
      deviceMetadata: "&key",
      preferences: "&key",
      cachedGuests: "&id, fullName",
      cachedBookings:
        "&id, &reference, guestId, guestName, status, arrivalDate",
      cachedFolios: "&id, &reservationId, status",
      cachedFolioLines: "&id, folioId, category",
      offlineBills:
        "&id, &offlineReference, bookingReference, reservationId, guestId, status, generatedAt",
      billDocuments: "&id, &billId, createdAt",
      syncMetadata: "&key",
      recoveryJournal: "&id, operation, status, billId, createdAt",
      offlineReservations: "&id, &localReference, syncStatus, createdAt",
    });
  }
}

export const offlineDb = new BrainadzHospitalityOfflineDb();

export type UiStyle = "sage" | "classic-blue";

export function normalizeUiStyle(value: unknown): UiStyle {
  return value === "classic-blue" ? "classic-blue" : "sage";
}

export async function loadUiStyle(): Promise<UiStyle> {
  return normalizeUiStyle((await offlineDb.preferences.get("ui-style"))?.value);
}

export async function saveUiStyle(value: UiStyle) {
  await offlineDb.preferences.put({
    key: "ui-style",
    value: normalizeUiStyle(value),
  });
}

export async function cacheCloudPayload(payload: {
  syncedAt: string;
  property: unknown;
  rooms: unknown[];
  reservations: Array<Record<string, unknown>>;
  folios: Array<Record<string, unknown>>;
  folioLines: Array<Record<string, unknown>>;
}) {
  const guests = new Map<string, CachedGuest>();
  const bookings: CachedBooking[] = [];
  payload.reservations.forEach((reservation) => {
    const guestId = String(reservation.guestId);
    guests.set(guestId, {
      id: guestId,
      fullName: String(reservation.guestName),
      email: reservation.email ? String(reservation.email) : null,
      phone: reservation.phone ? String(reservation.phone) : null,
      city: reservation.city ? String(reservation.city) : null,
      preferences: reservation.preferences
        ? String(reservation.preferences)
        : null,
      dietaryRequirements: reservation.dietaryRequirements
        ? String(reservation.dietaryRequirements)
        : null,
      loyaltyTier: reservation.loyaltyTier
        ? String(reservation.loyaltyTier)
        : null,
    });
    bookings.push({
      id: String(reservation.id),
      reference: String(reservation.reference),
      guestId,
      guestName: String(reservation.guestName),
      roomNumber: reservation.roomNumber
        ? String(reservation.roomNumber)
        : null,
      roomType: String(reservation.roomType),
      arrivalDate: String(reservation.arrivalDate),
      departureDate: String(reservation.departureDate),
      status: String(reservation.status),
    });
  });
  const pendingLocalReservations = await offlineDb.offlineReservations
    .where("syncStatus")
    .anyOf(["PENDING_SYNC", "SYNC_FAILED"])
    .toArray();
  pendingLocalReservations.forEach((reservation) => {
    guests.set(reservation.guestId, {
      id: reservation.guestId,
      fullName: reservation.guestName,
      email: reservation.email,
      phone: reservation.phone,
      city: reservation.city,
      preferences: "Walk-in reservation created offline",
      dietaryRequirements: reservation.dietaryRequirements,
      loyaltyTier: "Walk-in",
    });
    bookings.push({
      id: reservation.id,
      reference: reservation.localReference,
      guestId: reservation.guestId,
      guestName: reservation.guestName,
      roomNumber: null,
      roomType: reservation.roomType,
      arrivalDate: reservation.arrivalDate,
      departureDate: reservation.departureDate,
      status: reservation.status,
    });
  });
  const folios = payload.folios.map((folio) => ({
    id: String(folio.id),
    reservationId: String(folio.reservationId),
    status: String(folio.status),
    subtotalPaise: Number(folio.subtotalPaise),
    taxPaise: Number(folio.taxPaise),
    totalPaise: Number(folio.totalPaise),
  }));
  const lines = payload.folioLines.map((line) => ({
    id: String(line.id),
    folioId: String(line.folioId),
    description: String(line.description),
    category: String(line.category),
    quantity: Number(line.quantity),
    unitAmountPaise: Number(line.unitAmountPaise),
    taxRateBps: Number(line.taxRateBps),
    lineTotalPaise: Number(line.lineTotalPaise),
  }));
  const persistent =
    "storage" in navigator && "persist" in navigator.storage
      ? await navigator.storage.persist()
      : false;
  await offlineDb.transaction(
    "rw",
    [
      offlineDb.deviceMetadata,
      offlineDb.cachedGuests,
      offlineDb.cachedBookings,
      offlineDb.cachedFolios,
      offlineDb.cachedFolioLines,
      offlineDb.syncMetadata,
    ],
    async () => {
      await offlineDb.deviceMetadata.bulkPut([
        {
          key: "device",
          value: {
            deviceId: DEVICE_ID,
            propertyId: PROPERTY_ID,
            registered: true,
            offlineGrant: {
              role: "RECEPTION",
              capabilities: [
                "offline.cached.read",
                "offline.bill.create",
                "offline.bill.print",
                "offline.reservation.create",
              ],
              issuedAt: payload.syncedAt,
              expiresAt: "2026-09-24T23:59:59.999Z",
            },
          },
        },
        { key: "property", value: payload.property },
        { key: "rooms", value: payload.rooms },
        { key: "persistentStorage", value: persistent },
        {
          key: "billingTemplate",
          value: { version: 1, taxRateBps: 1800, paper: "A4" },
        },
      ]);
      await Promise.all([
        offlineDb.cachedGuests.clear(),
        offlineDb.cachedBookings.clear(),
        offlineDb.cachedFolios.clear(),
        offlineDb.cachedFolioLines.clear(),
      ]);
      await offlineDb.cachedGuests.bulkPut([...guests.values()]);
      await offlineDb.cachedBookings.bulkPut(bookings);
      await offlineDb.cachedFolios.bulkPut(folios);
      await offlineDb.cachedFolioLines.bulkPut(lines);
      await offlineDb.syncMetadata.put({
        key: "lastSuccessfulSync",
        value: payload.syncedAt,
      });
    },
  );
  return getOfflineReadiness();
}

export async function searchCachedBookings(query: string) {
  const normalized = query.trim().toLowerCase();
  const records = await offlineDb.cachedBookings.toArray();
  if (!normalized) return records;
  return records.filter(
    (booking) =>
      booking.reference.toLowerCase().includes(normalized) ||
      booking.guestName.toLowerCase().includes(normalized) ||
      booking.roomNumber?.toLowerCase().includes(normalized),
  );
}

export async function getCachedStay(reservationId: string) {
  const booking = await offlineDb.cachedBookings.get(reservationId);
  if (!booking) return null;
  const guest = await offlineDb.cachedGuests.get(booking.guestId);
  const folio = await offlineDb.cachedFolios
    .where("reservationId")
    .equals(reservationId)
    .first();
  const lines = folio
    ? await offlineDb.cachedFolioLines
        .where("folioId")
        .equals(folio.id)
        .toArray()
    : [];
  return { booking, guest, folio, lines };
}

export async function createLocalWalkInReservation(input: {
  guestName: string;
  email?: string;
  phone?: string;
  city?: string;
  dietaryRequirements?: string;
  guestCount?: number;
  createdById: string;
  createdByName: string;
  createdByRole: string;
  roomType: string;
  arrivalDate: string;
  departureDate: string;
  mealPlan?: MealService[];
}) {
  calculateStayNights(input.arrivalDate, input.departureDate);
  if (!["OWNER", "MANAGER", "RECEPTION"].includes(input.createdByRole))
    throw new Error("This role cannot create offline walk-in reservations.");
  const deviceRecord = await offlineDb.deviceMetadata.get("device");
  const device = deviceRecord?.value as
    | { registered?: boolean; offlineGrant?: { capabilities?: string[] } }
    | undefined;
  if (
    !device?.registered ||
    !device.offlineGrant?.capabilities?.includes("offline.reservation.create")
  )
    throw new Error(
      "This device is not registered for offline walk-in reservations.",
    );
  const guestName = input.guestName.trim();
  if (guestName.length < 2) throw new Error("Guest name is required.");
  const guestCount = input.guestCount ?? 1;
  if (!Number.isSafeInteger(guestCount) || guestCount < 1 || guestCount > 12)
    throw new Error("Guest count must be between 1 and 12.");
  const createdAt = new Date().toISOString();
  const reservationId = `local-reservation-${crypto.randomUUID()}`;
  const guestId = `local-guest-${crypto.randomUUID()}`;
  const record: LocalOfflineReservation = {
    id: reservationId,
    localReference: createOfflineReservationReference(
      crypto.randomUUID().slice(0, 8),
      input.arrivalDate,
    ),
    guestId,
    guestName,
    email: input.email?.trim() || null,
    phone: input.phone?.trim() || null,
    city: input.city?.trim() || null,
    dietaryRequirements: input.dietaryRequirements?.trim() || null,
    guestCount,
    createdById: input.createdById,
    createdByName: input.createdByName,
    createdByRole: input.createdByRole,
    roomType: input.roomType,
    arrivalDate: input.arrivalDate,
    departureDate: input.departureDate,
    mealPlan: input.mealPlan ?? [],
    source: "OFFLINE_WALK_IN",
    status: "CONFIRMED",
    syncStatus: "PENDING_SYNC",
    createdAt,
    updatedAt: createdAt,
  };
  await offlineDb.transaction(
    "rw",
    [
      offlineDb.offlineReservations,
      offlineDb.cachedGuests,
      offlineDb.cachedBookings,
    ],
    async () => {
      await offlineDb.offlineReservations.add(record);
      await offlineDb.cachedGuests.put({
        id: guestId,
        fullName: guestName,
        email: record.email,
        phone: record.phone,
        city: record.city,
        preferences: "Walk-in reservation created offline",
        dietaryRequirements: record.dietaryRequirements,
        loyaltyTier: "Walk-in",
      });
      await offlineDb.cachedBookings.put({
        id: reservationId,
        reference: record.localReference,
        guestId,
        guestName,
        roomNumber: null,
        roomType: record.roomType,
        arrivalDate: record.arrivalDate,
        departureDate: record.departureDate,
        status: record.status,
      });
    },
  );
  return record;
}

export async function getLocalOfflineReservations() {
  return offlineDb.offlineReservations.orderBy("createdAt").reverse().toArray();
}

export async function getPendingOfflineReservations() {
  return offlineDb.offlineReservations
    .where("syncStatus")
    .anyOf(["PENDING_SYNC", "SYNC_FAILED"])
    .toArray();
}

export async function markOfflineReservationSynced(
  localId: string,
  result: { reservationId: string; reference: string },
) {
  await offlineDb.offlineReservations.update(localId, {
    syncStatus: "SYNCED",
    syncedReservationId: result.reservationId,
    syncedReference: result.reference,
    syncError: undefined,
    updatedAt: new Date().toISOString(),
  });
}

export async function markOfflineReservationSyncFailed(
  localId: string,
  message: string,
) {
  await offlineDb.transaction("rw", offlineDb.offlineReservations, async () => {
    const current = await offlineDb.offlineReservations.get(localId);
    if (!current || current.syncStatus === "SYNCED") return;
    await offlineDb.offlineReservations.update(localId, {
      syncStatus: "SYNC_FAILED",
      syncError: message,
      updatedAt: new Date().toISOString(),
    });
  });
}

export async function cacheApplicationSnapshot(key: string, value: unknown) {
  await offlineDb.syncMetadata.put({
    key: `applicationSnapshot:${key}`,
    value,
  });
}

export async function getApplicationSnapshot<T>(
  key: string,
): Promise<T | null> {
  return (
    ((await offlineDb.syncMetadata.get(`applicationSnapshot:${key}`))
      ?.value as T | null) ?? null
  );
}

export function createOnlineFolioPdf(input: {
  bookingReference: string;
  guestName: string;
  roomNumber?: string | null;
  arrivalDate: string;
  departureDate: string;
  folioStatus: string;
  subtotalPaise: number;
  taxPaise: number;
  totalPaise: number;
  lines: Array<{
    description: string;
    quantity: number;
    unitAmountPaise: number;
    taxRateBps: number;
    lineTotalPaise: number;
  }>;
}) {
  const stayNights = calculateStayNights(
    input.arrivalDate,
    input.departureDate,
  );
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  doc.setTextColor(38, 57, 42);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(20);
  doc.text("BRAINADZ HOSPITALITY OS", 18, 22);
  doc.setFontSize(10);
  doc.setTextColor(93, 112, 91);
  doc.text("CURRENT GUEST FOLIO", 18, 30);
  doc.setDrawColor(205, 218, 198);
  doc.line(18, 36, 192, 36);
  doc.setFont("helvetica", "normal");
  const details: Array<[string, string]> = [
    ["Booking", input.bookingReference],
    ["Guest", input.guestName],
    ["Room", input.roomNumber ?? "Unassigned"],
    ["Stay dates", `${input.arrivalDate} to ${input.departureDate}`],
    ["Stay duration", `${stayNights} night${stayNights === 1 ? "" : "s"}`],
    ["Folio status", input.folioStatus],
    ["Generated", new Date().toLocaleString("en-IN")],
  ];
  details.forEach(([label, value], index) => {
    const y = 47 + index * 8;
    doc.setTextColor(100, 119, 142);
    doc.text(label, 18, y);
    doc.setTextColor(15, 40, 72);
    doc.setFont("helvetica", "bold");
    doc.text(value, 65, y);
    doc.setFont("helvetica", "normal");
  });
  let y = 113;
  doc.setFillColor(244, 247, 239);
  doc.roundedRect(
    18,
    105,
    174,
    Math.max(48, input.lines.length * 10 + 40),
    3,
    3,
    "F",
  );
  doc.setFont("helvetica", "bold");
  doc.setTextColor(38, 57, 42);
  doc.text("Description", 24, y);
  doc.text("Tax", 137, y, { align: "right" });
  doc.text("Amount", 184, y, { align: "right" });
  doc.setFont("helvetica", "normal");
  input.lines.forEach((line) => {
    y += 9;
    doc.setTextColor(42, 58, 46);
    doc.text(`${line.description} x${line.quantity}`, 24, y, { maxWidth: 92 });
    doc.text(`${(line.taxRateBps / 100).toFixed(0)}%`, 137, y, {
      align: "right",
    });
    doc.text(
      `INR ${(line.lineTotalPaise / 100).toLocaleString("en-IN", { minimumFractionDigits: 2 })}`,
      184,
      y,
      { align: "right" },
    );
  });
  y += 12;
  const totals: Array<[string, number]> = [
    ["Subtotal", input.subtotalPaise],
    ["Tax", input.taxPaise],
    ["Grand total", input.totalPaise],
  ];
  totals.forEach(([label, value], index) => {
    doc.setFont("helvetica", index === totals.length - 1 ? "bold" : "normal");
    doc.text(label, 118, y, { align: "right" });
    doc.text(
      `INR ${(value / 100).toLocaleString("en-IN", { minimumFractionDigits: 2 })}`,
      184,
      y,
      { align: "right" },
    );
    y += 9;
  });
  doc.setFont("helvetica", "normal");
  doc.setTextColor(80, 101, 126);
  doc.setFontSize(9);
  doc.text(
    "This PDF is a current folio statement generated from the authoritative cloud record.",
    18,
    270,
    { maxWidth: 170 },
  );
  return {
    blob: doc.output("blob"),
    filename: `BrainADZ-Folio-${input.bookingReference.replace(/[^a-z0-9-]/gi, "-")}.pdf`,
  };
}

export async function generateOfflineBill(input: {
  reservationId: string;
  generatedBy: string;
  roomChargesPaise: number;
  restaurantPaise: number;
  otherPaise: number;
  taxRateBps: number;
}) {
  const stay = await getCachedStay(input.reservationId);
  if (!stay?.booking || !stay.guest)
    throw new Error("Cached booking and guest are required.");
  const journalId = crypto.randomUUID();
  const billId = crypto.randomUUID();
  const generatedAt = new Date().toISOString();
  await offlineDb.recoveryJournal.add({
    id: journalId,
    operation: "GENERATE_OFFLINE_BILL",
    status: "STARTED",
    billId,
    createdAt: generatedAt,
    updatedAt: generatedAt,
  });
  try {
    const subtotalPaise =
      input.roomChargesPaise + input.restaurantPaise + input.otherPaise;
    const totals = calculateBill(subtotalPaise, input.taxRateBps);
    const sequence = (await offlineDb.offlineBills.count()) + 1;
    const offlineReference = createOfflineReference(sequence);
    const stayNights = calculateStayNights(
      stay.booking.arrivalDate,
      stay.booking.departureDate,
    );
    const doc = new jsPDF({ unit: "mm", format: "a4" });
    doc.setTextColor(38, 57, 42);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(20);
    doc.text("BRAINADZ HOSPITALITY OS", 18, 22);
    doc.setFontSize(10);
    doc.setTextColor(93, 112, 91);
    doc.text("OFFLINE BILLING RECORD", 18, 30);
    doc.setDrawColor(205, 218, 198);
    doc.line(18, 36, 192, 36);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    const details = [
      ["Offline reference", offlineReference],
      ["Booking", stay.booking.reference],
      ["Guest", stay.guest.fullName],
      ["Room", stay.booking.roomNumber ?? "Unassigned"],
      [
        "Stay dates",
        `${stay.booking.arrivalDate} to ${stay.booking.departureDate}`,
      ],
      ["Stay duration", `${stayNights} night${stayNights === 1 ? "" : "s"}`],
      ["Generated by", input.generatedBy],
      ["Device", DEVICE_ID],
    ];
    details.forEach(([label, value], index) => {
      const y = 47 + index * 8;
      doc.setTextColor(100, 119, 142);
      doc.text(label, 18, y);
      doc.setTextColor(15, 40, 72);
      doc.setFont("helvetica", "bold");
      doc.text(value, 65, y);
      doc.setFont("helvetica", "normal");
    });
    doc.setFillColor(244, 247, 239);
    doc.roundedRect(18, 117, 174, 58, 3, 3, "F");
    const moneyRows: Array<[string, number]> = [
      ["Room charges", input.roomChargesPaise],
      ["Restaurant", input.restaurantPaise],
      ["Other", input.otherPaise],
      ["Tax", totals.taxPaise],
      ["Grand total", totals.totalPaise],
    ];
    moneyRows.forEach(([label, value], index) => {
      const y = 129 + index * 9;
      doc.setFont(
        "helvetica",
        index === moneyRows.length - 1 ? "bold" : "normal",
      );
      doc.setTextColor(23, 52, 89);
      doc.text(label, 26, y);
      doc.text(
        `INR ${(value / 100).toLocaleString("en-IN", { minimumFractionDigits: 2 })}`,
        181,
        y,
        { align: "right" },
      );
    });
    doc.setFont("helvetica", "bold");
    doc.setTextColor(177, 94, 8);
    doc.text("PENDING MASTER HUB REVIEW", 18, 192);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(80, 101, 126);
    doc.setFontSize(9);
    doc.text("This local record is not a statutory GST invoice.", 18, 201, {
      maxWidth: 170,
    });
    doc.text(
      `Generated ${new Date(generatedAt).toLocaleString("en-IN")} | Review after connection returns.`,
      18,
      217,
      { maxWidth: 170 },
    );
    const blob = doc.output("blob");
    const documentHash = await sha256(blob);
    const bill: LocalOfflineBill = {
      id: billId,
      offlineReference,
      bookingReference: stay.booking.reference,
      reservationId: stay.booking.id,
      guestId: stay.guest.id,
      guestName: stay.guest.fullName,
      roomNumber: stay.booking.roomNumber,
      arrivalDate: stay.booking.arrivalDate,
      departureDate: stay.booking.departureDate,
      stayNights,
      subtotalPaise,
      taxPaise: totals.taxPaise,
      totalPaise: totals.totalPaise,
      currency: "INR",
      status: "PENDING_MANUAL_MASTER_UPDATE",
      documentHash,
      generatedAt,
      generatedBy: input.generatedBy,
      deviceId: DEVICE_ID,
      printCount: 0,
    };
    await offlineDb.transaction(
      "rw",
      offlineDb.offlineBills,
      offlineDb.billDocuments,
      offlineDb.recoveryJournal,
      async () => {
        await offlineDb.offlineBills.add(bill);
        await offlineDb.billDocuments.add({
          id: crypto.randomUUID(),
          billId,
          blob,
          createdAt: generatedAt,
        });
        await offlineDb.recoveryJournal.update(journalId, {
          status: "COMPLETED",
          updatedAt: new Date().toISOString(),
        });
      },
    );
    return { ...bill, documentBlob: blob };
  } catch (error) {
    await offlineDb.recoveryJournal.update(journalId, {
      status: "FAILED",
      updatedAt: new Date().toISOString(),
      message: error instanceof Error ? error.message : "Unknown failure",
    });
    throw error;
  }
}

export async function getLocalOfflineBills() {
  return offlineDb.offlineBills.orderBy("generatedAt").reverse().toArray();
}

export async function getBillBlob(billId: string) {
  return (
    (await offlineDb.billDocuments.where("billId").equals(billId).first())
      ?.blob ?? null
  );
}

export async function markBillPrinted(billId: string) {
  const bill = await offlineDb.offlineBills.get(billId);
  if (!bill) return null;
  await offlineDb.offlineBills.update(billId, {
    printCount: bill.printCount + 1,
  });
  return bill.printCount + 1;
}

export async function updateLocalBillStatus(
  billId: string,
  status: LocalOfflineBill["status"],
) {
  await offlineDb.offlineBills.update(billId, {
    status,
    uploadedAt: new Date().toISOString(),
  });
}

export async function getOfflineReadiness() {
  const [device, template, guests, bookings, folios, sync, persistence] =
    await Promise.all([
      offlineDb.deviceMetadata.get("device"),
      offlineDb.deviceMetadata.get("billingTemplate"),
      offlineDb.cachedGuests.count(),
      offlineDb.cachedBookings.count(),
      offlineDb.cachedFolios.count(),
      offlineDb.syncMetadata.get("lastSuccessfulSync"),
      offlineDb.deviceMetadata.get("persistentStorage"),
    ]);
  const serviceWorkerActive =
    typeof navigator !== "undefined" && "serviceWorker" in navigator
      ? Boolean((await navigator.serviceWorker.getRegistration())?.active)
      : false;
  const checks = {
    deviceRegistered: Boolean(device),
    serviceWorkerActive,
    applicationCached: serviceWorkerActive,
    existingBookingsCached: bookings > 0,
    billingTemplateCached: Boolean(template),
    guestDataCached: guests > 0,
    foliosCached: folios > 0,
    persistentStorage: persistence?.value === true,
  };
  return {
    checks,
    ready:
      checks.deviceRegistered &&
      checks.serviceWorkerActive &&
      checks.existingBookingsCached &&
      checks.billingTemplateCached &&
      checks.guestDataCached &&
      checks.foliosCached,
    lastSync: sync?.value as string | undefined,
  };
}

export async function getRecoveryIssues() {
  return offlineDb.recoveryJournal
    .where("status")
    .anyOf(["STARTED", "FAILED"])
    .toArray();
}

async function sha256(blob: Blob) {
  const buffer = await blob.arrayBuffer();
  const digest = await crypto.subtle.digest("SHA-256", buffer);
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
}
