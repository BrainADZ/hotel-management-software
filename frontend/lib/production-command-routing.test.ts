import { describe, expect, it } from "vitest";

import { routeProductionCommand } from "./production-command-routing";

describe("production command routing", () => {
  it.each([
    ["CREATE_CUSTOM_PACKAGE", "/api/travel/packages"],
    ["SET_PACKAGE_PRICING", "/api/travel/packages/pkg-1/pricing"],
    [
      "RESOLVE_DISCOUNT_REQUEST",
      "/api/travel/discount-requests/request-1/decision",
    ],
  ])("routes %s to Travel", (action, path) => {
    expect(
      routeProductionCommand({
        action,
        packageId: "pkg-1",
        requestId: "request-1",
      }).path,
    ).toBe(path);
  });

  it("preserves reservation action routing", () => {
    expect(
      routeProductionCommand({
        action: "CANCEL",
        reservationId: "res-1",
        reason: "Changed",
      }).path,
    ).toBe("/api/reservations/res-1/actions");
  });

  it("preserves operations routing", () => {
    expect(
      routeProductionCommand({
        action: "UPSERT_INVENTORY",
      }).path,
    ).toBe("/api/operations");
  });

  it("routes housekeeping assignment with its version and assignee", () => {
    expect(
      routeProductionCommand({
        action: "ASSIGN_HOUSEKEEPING_TASK",
        taskId: "task-1",
        assigneeId: "staff-1",
        expectedVersion: 2,
      }),
    ).toMatchObject({
      path: "/api/operations",
      method: "POST",
    });
  });

  it("routes maintenance resolution to operations and preserves the dedicated contract", () => {
    const route = routeProductionCommand({
      action: "RESOLVE_MAINTENANCE",
      ticketId: "ticket-1",
      expectedVersion: 1,
      resolutionNote: "Issue repaired and room checked.",
      surface: "PROPERTY",
    });

    expect(route).toEqual({
      path: "/api/operations",
      method: "POST",
      body: {
        action: "RESOLVE_MAINTENANCE",
        ticketId: "ticket-1",
        expectedVersion: 1,
        resolutionNote: "Issue repaired and room checked.",
        surface: "PROPERTY",
      },
    });

    expect(route.body.ticketId).toBe("ticket-1");
    expect(route.body.expectedVersion).toBe(1);
    expect(route.body.resolutionNote).toBe(
      "Issue repaired and room checked.",
    );
    expect(route.body).not.toHaveProperty("id");
    expect(route.body).not.toHaveProperty("reservationId");
  });

  it("routes all dedicated maintenance lifecycle actions through /api/operations", () => {
    const actions = [
      "CREATE_MAINTENANCE",
      "UPDATE_MAINTENANCE",
      "ASSIGN_MAINTENANCE",
      "START_MAINTENANCE",
      "RESOLVE_MAINTENANCE",
      "CLOSE_MAINTENANCE",
    ];

    for (const action of actions) {
      expect(
        routeProductionCommand({
          action,
          ticketId: "ticket-1",
          expectedVersion: 1,
        }),
      ).toMatchObject({
        path: "/api/operations",
        method: "POST",
      });
    }
  });

  it("rejects unknown commands", () => {
    expect(() =>
      routeProductionCommand({
        action: "UNKNOWN",
      }),
    ).toThrow("Unsupported production command");
  });

  it("never creates undefined URLs", () => {
    expect(() =>
      routeProductionCommand({
        action: "CANCEL",
      }),
    ).toThrow("requires reservationId");
  });
});
