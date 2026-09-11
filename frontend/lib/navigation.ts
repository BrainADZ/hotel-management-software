import type { AppRole, BusinessUnit } from "@hotel/shared/domain";

export type FeatureView =
  | "Overview"
  | "Reservations"
  | "Connectivity"
  | "Front Desk"
  | "Guests"
  | "Folios & Billing"
  | "Room Calendar"
  | "Arrivals & Departures"
  | "Room Types & Rates"
  | "Guest Profiles"
  | "Invoices"
  | "Housekeeping"
  | "Maintenance"
  | "Inventory"
  | "Inventory Movements"
  | "Lost & Found"
  | "Restaurant Orders"
  | "Room Service"
  | "Meal Service"
  | "Menu Management"
  | "Packages & Tours"
  | "Tours"
  | "Participants"
  | "Tour Managers"
  | "Inquiry CRM"
  | "Sales Pipeline"
  | "Follow-ups"
  | "Communications"
  | "Offline Billing"
  | "Verification"
  | "Device Status"
  | "Integrations"
  | "Reports"
  | "Audit Logs"
  | "Users & Permissions"
  | "Properties & Settings";

export type NavigationItem = { label: FeatureView; href: string };
export type NavigationGroup = {
  label: string;
  workspace: BusinessUnit;
  items: NavigationItem[];
};

const hotel = (label: FeatureView, slug = "") => ({
  label,
  href: `/hotel${slug ? `/${slug}` : ""}`,
});
const travel = (label: FeatureView, slug = "") => ({
  label,
  href: `/travel${slug ? `/${slug}` : ""}`,
});

export const navigationGroups: NavigationGroup[] = [
  {
    label: "Master Hub",
    workspace: "HOTEL",
    items: [
      hotel("Overview"),
      hotel("Reservations", "reservations"),
      hotel("Connectivity", "connectivity"),
    ],
  },
  {
    label: "Hotel",
    workspace: "HOTEL",
    items: [
      hotel("Front Desk", "front-desk"),
      hotel("Guests", "guests"),
      hotel("Folios & Billing", "folios"),
    ],
  },
  {
    label: "Planning",
    workspace: "HOTEL",
    items: [
      hotel("Room Calendar", "room-calendar"),
      hotel("Arrivals & Departures", "arrivals-departures"),
      hotel("Room Types & Rates", "room-types-rates"),
      hotel("Guest Profiles", "guest-profiles"),
      hotel("Invoices", "invoices"),
    ],
  },
  {
    label: "Operations",
    workspace: "HOTEL",
    items: [
      hotel("Housekeeping", "housekeeping"),
      hotel("Maintenance", "maintenance"),
      hotel("Inventory", "inventory"),
      hotel("Inventory Movements", "inventory-movements"),
      hotel("Lost & Found", "lost-found"),
      hotel("Restaurant Orders", "restaurant-orders"),
    ],
  },
  {
    label: "Restaurant tools",
    workspace: "HOTEL",
    items: [
      hotel("Room Service", "room-service"),
      hotel("Meal Service", "meal-service"),
      hotel("Menu Management", "menu-management"),
    ],
  },
  {
    label: "Offline Centre",
    workspace: "HOTEL",
    items: [
      hotel("Offline Billing", "offline-billing"),
      hotel("Verification", "verification"),
      hotel("Device Status", "device-status"),
    ],
  },
  {
    label: "Administration",
    workspace: "HOTEL",
    items: [
      hotel("Integrations", "integrations"),
      hotel("Reports", "reports"),
      hotel("Audit Logs", "audit-logs"),
      hotel("Users & Permissions", "users-permissions"),
      hotel("Properties & Settings", "properties-settings"),
    ],
  },
  {
    label: "Travel & Sales",
    workspace: "TRAVEL",
    items: [
      travel("Overview"),
      travel("Packages & Tours", "packages"),
      travel("Tours", "tours"),
      travel("Participants", "participants"),
      travel("Tour Managers", "tour-managers"),
      travel("Inquiry CRM", "inquiry-crm"),
    ],
  },
  {
    label: "Sales tools",
    workspace: "TRAVEL",
    items: [
      travel("Sales Pipeline", "sales-pipeline"),
      travel("Follow-ups", "follow-ups"),
      travel("Communications", "communications"),
    ],
  },
  {
    label: "Travel administration",
    workspace: "TRAVEL",
    items: [
      travel("Reports", "reports"),
      travel("Audit Logs", "audit-logs"),
      travel("Users & Permissions", "users-permissions"),
      travel("Properties & Settings", "properties-settings"),
    ],
  },
];

export const roleViewAccess: Partial<Record<AppRole, FeatureView[]>> = {
  MANAGER: [...new Set(navigationGroups.flatMap(group => group.items.map(item => item.label)))].filter(view => view !== 'Users & Permissions'),
  RECEPTION: [
    "Housekeeping",
    "Overview",
    "Reservations",
    "Front Desk",
    "Guests",
    "Folios & Billing",
    "Room Calendar",
    "Arrivals & Departures",
    "Guest Profiles",
    "Invoices",
    "Lost & Found",
    "Offline Billing",
    "Device Status",
  ],
  HOUSEKEEPING: ["Overview", "Housekeeping", "Device Status"],
  RESTAURANT: [
    "Overview",
    "Restaurant Orders",
    "Inventory",
    "Inventory Movements",
    "Room Service",
    "Meal Service",
    "Menu Management",
  ],
  TRAVEL_AGENT: [
    "Overview",
    "Packages & Tours",
    "Tours",
    "Participants",
    "Tour Managers",
    "Inquiry CRM",
    "Sales Pipeline",
    "Follow-ups",
    "Communications",
  ],
  TOUR_MANAGER: [
    "Overview",
    "Packages & Tours",
    "Tours",
    "Participants",
    "Tour Managers",
    "Inquiry CRM",
    "Sales Pipeline",
    "Follow-ups",
    "Communications",
  ],
  REPORTING: ["Overview", "Reports"],
  ACCOUNTS: [
    "Overview",
    "Reservations",
    "Folios & Billing",
    "Invoices",
    "Verification",
    "Reports",
    "Audit Logs",
  ],
};

export function workspaceFromPathname(pathname: string): BusinessUnit {
  return pathname === "/travel" || pathname.startsWith("/travel/")
    ? "TRAVEL"
    : "HOTEL";
}

export function viewFromPathname(pathname: string): FeatureView {
  for (const group of navigationGroups) {
    const item = group.items.find(({ href }) => href === pathname);
    if (item) return item.label;
  }
  return "Overview";
}

export function hrefForView(
  workspace: BusinessUnit,
  view: FeatureView,
): string {
  return (
    navigationGroups
      .filter((group) => group.workspace === workspace)
      .flatMap((group) => group.items)
      .find((item) => item.label === view)?.href ??
    (workspace === "TRAVEL" ? "/travel" : "/hotel")
  );
}
