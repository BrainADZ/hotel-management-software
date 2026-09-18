"use client";
import { type ReactNode } from "react";

export type Row = Record<string, unknown>;

export type ExtraFeatureViewName =
  | "Room Calendar"
  | "Arrivals & Departures"
  | "Room Types & Rates"
  | "Guest Profiles"
  | "Invoices"
  | "Inventory Movements"
  | "Lost & Found"
  | "Room Service"
  | "Meal Service"
  | "Menu Management"
  | "Tours"
  | "Participants"
  | "Tour Managers"
  | "Sales Pipeline"
  | "Follow-ups"
  | "Communications"
  | "Users & Permissions"
  | "Properties & Settings";

export const extraFeatureViews = new Set<ExtraFeatureViewName>([
  "Room Calendar",
  "Arrivals & Departures",
  "Room Types & Rates",
  "Guest Profiles",
  "Invoices",
  "Inventory Movements",
  "Lost & Found",
  "Room Service",
  "Meal Service",
  "Menu Management",
  "Tours",
  "Participants",
  "Tour Managers",
  "Sales Pipeline",
  "Follow-ups",
  "Communications",
  "Users & Permissions",
  "Properties & Settings",
]);

export function isExtraFeatureView(view: string): view is ExtraFeatureViewName {
  return extraFeatureViews.has(view as ExtraFeatureViewName);
}

export type FeatureState = {
  actor: { name: string; email: string; role: string };
  property: {
    id: string;
    name: string;
    city: string;
    connectionStatus: string;
    lastSyncAt: string;
  };
  rooms: Row[];
  reservations: Row[];
  folios: Row[];
  folioLines: Row[];
  restaurantOrders: Row[];
  restaurantMealBookings: Row[];
  packages: Row[];
  inquiries: Row[];
};

export type ExtraFeatureProps = {
  view: string;
  state: FeatureState;
  notify: (message: string) => void;
};

export const money = (rupees: unknown) =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(Number(rupees ?? 0));
export const shortDate = (value: unknown) =>
  value
    ? new Intl.DateTimeFormat("en-IN", {
        day: "2-digit",
        month: "short",
        year: "numeric",
      }).format(new Date(`${String(value).slice(0, 10)}T00:00:00Z`))
    : "—";
export const today = () => new Date().toISOString().slice(0, 10);

export function Heading({
  title,
  description,
  actions,
}: {
  title: string;
  description: string;
  actions?: ReactNode;
}) {
  return (
    <section className="page-heading platform-page-heading">
      <div>
        <p className="eyebrow">Expanded operations</p>
        <h1>{title}</h1>
        <p>{description}</p>
      </div>
      {actions && <div className="page-actions">{actions}</div>}
    </section>
  );
}

export function Status({ value }: { value: unknown }) {
  const label = String(value ?? "Pending").replaceAll("_", " ");
  return (
    <span className={`status ${label.toLowerCase().replaceAll(" ", "-")}`}>
      {label}
    </span>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return (
    <div className="empty-state small">
      <strong>{children}</strong>
    </div>
  );
}

export function DataGrid({
  headers,
  rows,
}: {
  headers: string[];
  rows: ReactNode[][];
}) {
  return (
    <div className="extra-table-wrap">
      <table className="data-table extra-table">
        <thead>
          <tr>
            {headers.map((header) => (
              <th key={header}>{header}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((cells, index) => (
            <tr key={index}>
              {cells.map((cell, cellIndex) => (
                <td key={cellIndex}>{cell}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      {rows.length === 0 && <Empty>No records match this view.</Empty>}
    </div>
  );
}

export function StatCards({ items }: { items: Array<[string, string, string?]> }) {
  return (
    <section className="extra-stat-grid">
      {items.map(([label, value, detail]) => (
        <article className="glass-card" key={label}>
          <small>{label}</small>
          <strong>{value}</strong>
          {detail && <p>{detail}</p>}
        </article>
      ))}
    </section>
  );
}
