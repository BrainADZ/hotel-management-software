import { describe, expect, it } from "vitest";
import {
  hrefForView,
  navigationGroups,
  viewFromPathname,
  workspaceFromPathname,
} from "./navigation";

describe("route navigation", () => {
  it("keeps every sidebar href unique and reversible", () => {
    const items = navigationGroups.flatMap((group) => group.items);
    expect(new Set(items.map((item) => item.href)).size).toBe(items.length);

    for (const item of items) {
      expect(viewFromPathname(item.href)).toBe(item.label);
      expect(hrefForView(workspaceFromPathname(item.href), item.label)).toBe(
        item.href,
      );
    }
  });

  it("derives the business workspace from the URL", () => {
    expect(workspaceFromPathname("/hotel/front-desk")).toBe("HOTEL");
    expect(workspaceFromPathname("/travel/inquiry-crm")).toBe("TRAVEL");
  });
});
