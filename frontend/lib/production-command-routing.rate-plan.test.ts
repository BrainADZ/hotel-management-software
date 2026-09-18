import { describe, expect, it } from "vitest";

import { routeProductionCommand } from "./production-command-routing";

describe("rate plan production routing", () => {
  it("routes SAVE_RATE_PLAN through operations", () => {
    expect(
      routeProductionCommand({
        action: "SAVE_RATE_PLAN",
        code: "BAR",
      }),
    ).toMatchObject({
      path: "/api/operations",
      method: "POST",
    });
  });
});
