import { describe, expect, it } from "vitest";

import {
  isWorkflowAction,
  restaurantGstRateBps,
  workflowSchemas,
} from "./workflows";

describe("operations workflow routing guards", () => {
  it("does not expose dedicated maintenance creation as a generic workflow action", () => {
    expect(isWorkflowAction("CREATE_MAINTENANCE")).toBe(false);
  });

  it("does not expose dedicated maintenance resolution as a generic workflow action", () => {
    expect(isWorkflowAction("RESOLVE_MAINTENANCE")).toBe(false);
  });

  it("keeps non-maintenance generic workflow actions available", () => {
    expect(isWorkflowAction("MOVE_STOCK")).toBe(true);
    expect(isWorkflowAction("SAVE_MENU_ITEM")).toBe(true);
    expect(isWorkflowAction("RECORD_LOST_ITEM")).toBe(true);
  });
});

describe("restaurant order workflow validation", () => {
  it("accepts a multi-item POS cart", () => {
    const parsed = workflowSchemas.CREATE_RESTAURANT_ORDER.parse({
      clientOperationId: "00000000-0000-4000-8000-000000000999",
      reservationId: "reservation-1",
      orderType: "RESTAURANT",
      tableNumber: "T1",
      covers: 2,
      waiterUserId: "waiter-1",
      items: [
        {
          menuItemId: "menu-1",
          quantity: 2,
        },
        {
          menuItemId: "menu-2",
          quantity: 1,
        },
      ],
      specialInstructions: "Less spicy",
    });

    expect(parsed.items).toHaveLength(2);
  });

  it("keeps the legacy single-item order payload valid", () => {
    const parsed = workflowSchemas.CREATE_RESTAURANT_ORDER.parse({
      clientOperationId: "00000000-0000-4000-8000-000000000998",
      reservationId: "reservation-1",
      orderType: "ROOM_SERVICE",
      menuItemId: "menu-1",
      quantity: 1,
    });

    expect(parsed.menuItemId).toBe("menu-1");
    expect(parsed.quantity).toBe(1);
  });

  it("rejects a restaurant order with no items", () => {
    expect(() =>
      workflowSchemas.CREATE_RESTAURANT_ORDER.parse({
        clientOperationId: "00000000-0000-4000-8000-000000000997",
        reservationId: "reservation-1",
        orderType: "RESTAURANT",
      }),
    ).toThrow("Add at least one menu item");
  });
});

describe("restaurant GST profile", () => {
  it("maps standard restaurant service to 5 percent without ITC", () => {
    expect(restaurantGstRateBps("STANDARD_5_NO_ITC")).toBe(500);
  });

  it("maps specified premises / opted hotel restaurant service to 18 percent", () => {
    expect(restaurantGstRateBps("SPECIFIED_18_WITH_ITC")).toBe(1800);
  });

  it("defaults legacy unconfigured restaurant GST to 5 percent", () => {
    expect(restaurantGstRateBps("UNCONFIGURED")).toBe(500);
  });

  it("accepts the supported restaurant GST profiles in property settings", () => {
    const base = {
      name: "Test Hotel",
      city: "Delhi",
      expectedVersion: 1,
      checkInTime: "14:00",
      checkOutTime: "11:00",
      defaultTaxRateBps: 1800,
    };

    expect(
      workflowSchemas.SAVE_PROPERTY.parse({
        ...base,
        restaurantGstProfile: "STANDARD_5_NO_ITC",
      }).restaurantGstProfile,
    ).toBe("STANDARD_5_NO_ITC");

    expect(
      workflowSchemas.SAVE_PROPERTY.parse({
        ...base,
        restaurantGstProfile: "SPECIFIED_18_WITH_ITC",
      }).restaurantGstProfile,
    ).toBe("SPECIFIED_18_WITH_ITC");
  });
});
