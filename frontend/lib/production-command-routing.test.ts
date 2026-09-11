import { describe, expect, it } from "vitest";
import { routeProductionCommand } from "./production-command-routing";

describe("production command routing", () => {
  it.each([
    ["CREATE_CUSTOM_PACKAGE", "/api/travel/packages"],
    ["SET_PACKAGE_PRICING", "/api/travel/packages/pkg-1/pricing"],
    ["RESOLVE_DISCOUNT_REQUEST", "/api/travel/discount-requests/request-1/decision"],
  ])("routes %s to Travel", (action, path) => expect(routeProductionCommand({ action, packageId: "pkg-1", requestId: "request-1" }).path).toBe(path));
  it("preserves reservation action routing", () => expect(routeProductionCommand({ action: "CANCEL", reservationId: "res-1", reason: "Changed" }).path).toBe("/api/reservations/res-1/actions"));
  it("preserves operations routing", () => expect(routeProductionCommand({ action: "UPSERT_INVENTORY" }).path).toBe("/api/operations"));
  it("rejects unknown commands", () => expect(() => routeProductionCommand({ action: "UNKNOWN" })).toThrow("Unsupported production command"));
  it("never creates undefined URLs", () => expect(() => routeProductionCommand({ action: "CANCEL" })).toThrow("requires reservationId"));
});
