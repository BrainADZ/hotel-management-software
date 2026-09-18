import { describe, expect, it } from "vitest";
import { assertOfflinePayloadSafe, createOnlineFolioPdf, isOfflineQueueableCommand, normalizeUiStyle } from "./offline-db";

describe("interface style preference", () => {
  it("keeps the current Sage interface as the safe default", () => {
    expect(normalizeUiStyle(undefined)).toBe("sage");
    expect(normalizeUiStyle("unknown")).toBe("sage");
  });

  it("accepts the optional Classic Blue interface", () => {
    expect(normalizeUiStyle("classic-blue")).toBe("classic-blue");
  });
});

describe("production offline queue policy", () => {
  it.each(["SYNC_OFFLINE_RESERVATION", "RECORD_HOUSEKEEPING_OUTCOME"])("allows %s", command => expect(isOfflineQueueableCommand(command)).toBe(true));
  it.each(["CAPTURE_PAYMENT", "REFUND_PAYMENT", "UPLOAD_KYC", "CREATE_USER", "DELETE_RESERVATION"])("blocks %s", command => expect(isOfflineQueueableCommand(command)).toBe(false));
  it.each(["password", "accessToken", "refreshToken", "cookie", "passportNumber", "aadhaarNumber"])("rejects sensitive nested field %s", field => expect(() => assertOfflinePayloadSafe({ nested: { [field]: "secret" } })).toThrow());
  it("allows non-sensitive operational payloads", () => expect(() => assertOfflinePayloadSafe({ outcome: "CLEAN", version: 3 })).not.toThrow());
});

describe("folio PDF generation", () => {
  it("creates a downloadable PDF from authoritative folio totals", async () => {
    const result = createOnlineFolioPdf({
      bookingReference: "BH-PDF-1001",
      guestName: "PDF Test Guest",
      roomNumber: "204",
      arrivalDate: "2026-08-24",
      departureDate: "2026-08-26",
      folioStatus: "OPEN",
      subtotalRupees: 9350,
      taxRupees: 1683,
      totalRupees: 11033,
      lines: [
        {
          description: "Room charges",
          quantity: 1,
          unitAmountRupees: 9350,
          taxRateBps: 1_800,
          lineTotalRupees: 9350,
        },
      ],
    });
    expect(result.filename).toBe("BrainADZ-Folio-BH-PDF-1001.pdf");
    expect(result.blob.type).toBe("application/pdf");
    const bytes = new Uint8Array(await result.blob.arrayBuffer());
    const contents = new TextDecoder().decode(bytes);
    expect(contents.slice(0, 4)).toBe("%PDF");
    expect(contents).toContain("2 nights");
  });
});
