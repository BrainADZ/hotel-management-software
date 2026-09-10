"use client";

import { useMemo, useState, type ReactNode } from "react";

type Row = Record<string, unknown>;

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

type FeatureState = {
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

type Props = {
  view: ExtraFeatureViewName;
  state: FeatureState;
  notify: (message: string) => void;
};

const money = (paise: unknown) =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(Number(paise ?? 0) / 100);
const shortDate = (value: unknown) =>
  value
    ? new Intl.DateTimeFormat("en-IN", {
        day: "2-digit",
        month: "short",
        year: "numeric",
      }).format(new Date(`${String(value).slice(0, 10)}T00:00:00Z`))
    : "—";
const today = () => new Date().toISOString().slice(0, 10);

function Heading({
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

function Status({ value }: { value: unknown }) {
  const label = String(value ?? "Pending").replaceAll("_", " ");
  return (
    <span className={`status ${label.toLowerCase().replaceAll(" ", "-")}`}>
      {label}
    </span>
  );
}

function Empty({ children }: { children: ReactNode }) {
  return (
    <div className="empty-state small">
      <strong>{children}</strong>
    </div>
  );
}

function DataGrid({
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

function StatCards({ items }: { items: Array<[string, string, string?]> }) {
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

function RoomCalendar({ state }: { state: FeatureState }) {
  const [start, setStart] = useState(today());
  const dates = useMemo(
    () =>
      Array.from({ length: 7 }, (_, index) => {
        const date = new Date(`${start}T00:00:00Z`);
        date.setUTCDate(date.getUTCDate() + index);
        return date.toISOString().slice(0, 10);
      }),
    [start],
  );
  return (
    <>
      <Heading
        title="Room calendar"
        description="Seven-day room availability using the primary reservation and room records."
        actions={
          <input
            className="extra-input"
            type="date"
            value={start}
            onChange={(event) => setStart(event.target.value)}
          />
        }
      />
      <article className="glass-card extra-calendar">
        <div className="calendar-row calendar-head">
          <span>Room</span>
          {dates.map((date) => (
            <span key={date}>{shortDate(date).slice(0, 6)}</span>
          ))}
        </div>
        {state.rooms.map((room) => (
          <div className="calendar-row" key={String(room.id)}>
            <strong>
              {String(room.number)}
              <small>{String(room.roomType)}</small>
            </strong>
            {dates.map((date) => {
              const booking = state.reservations.find(
                (item) =>
                  item.roomId === room.id &&
                  String(item.arrivalDate) <= date &&
                  String(item.departureDate) > date &&
                  item.status !== "CANCELLED",
              );
              return (
                <span
                  className={
                    booking
                      ? "booked"
                      : String(room.operationalStatus) !== "CLEAN"
                        ? "blocked"
                        : "available"
                  }
                  key={date}
                >
                  {booking
                    ? String(booking.guestName).split(" ")[0]
                    : String(room.operationalStatus) === "CLEAN"
                      ? "Available"
                      : String(room.operationalStatus)}
                </span>
              );
            })}
          </div>
        ))}
      </article>
    </>
  );
}

function Movements({ state }: { state: FeatureState }) {
  const [date, setDate] = useState(today());
  const arrivals = state.reservations.filter(
    (item) => String(item.arrivalDate) === date && item.status !== "CANCELLED",
  );
  const departures = state.reservations.filter(
    (item) =>
      String(item.departureDate) === date && item.status !== "CANCELLED",
  );
  const rows = (items: Row[]) =>
    items.map((item) => [
      String(item.reference),
      String(item.guestName),
      String(item.roomNumber ?? "Unassigned"),
      String(item.roomType),
      <Status key="status" value={item.status} />,
    ]);
  return (
    <>
      <Heading
        title="Arrivals & departures"
        description="Daily movement sheet from the authoritative reservation list."
        actions={
          <input
            className="extra-input"
            type="date"
            value={date}
            onChange={(event) => setDate(event.target.value)}
          />
        }
      />
      <StatCards
        items={[
          ["Arrivals", String(arrivals.length)],
          ["Departures", String(departures.length)],
          [
            "Stayovers",
            String(
              state.reservations.filter(
                (item) =>
                  item.status === "CHECKED_IN" &&
                  String(item.arrivalDate) < date &&
                  String(item.departureDate) > date,
              ).length,
            ),
          ],
        ]}
      />
      <section className="extra-two-column">
        <article className="glass-card">
          <h2>Arrivals</h2>
          <DataGrid
            headers={["Booking", "Guest", "Room", "Type", "Status"]}
            rows={rows(arrivals)}
          />
        </article>
        <article className="glass-card">
          <h2>Departures</h2>
          <DataGrid
            headers={["Booking", "Guest", "Room", "Type", "Status"]}
            rows={rows(departures)}
          />
        </article>
      </section>
    </>
  );
}

function RoomTypesRates({ state }: { state: FeatureState }) {
  const groups = Object.values(
    state.rooms.reduce<
      Record<
        string,
        {
          type: string;
          rooms: number;
          rate: number;
          adults: number;
          children: number;
        }
      >
    >((all, room) => {
      const type = String(room.roomType);
      const current = all[type] ?? {
        type,
        rooms: 0,
        rate: Number(room.baseRatePaise),
        adults: type.includes("Suite") ? 3 : 2,
        children: type.includes("Suite") ? 2 : 1,
      };
      current.rooms += 1;
      current.rate = Math.min(current.rate, Number(room.baseRatePaise));
      all[type] = current;
      return all;
    }, {}),
  );
  return (
    <>
      <Heading
        title="Room types & rate plans"
        description="Room inventory grouped into sellable types with the current base rate and common pricing plans."
      />
      <article className="glass-card">
        <DataGrid
          headers={[
            "Room type",
            "Rooms",
            "Base rate",
            "Occupancy",
            "Rate plans",
          ]}
          rows={groups.map((group) => [
            <strong key={group.type}>{group.type}</strong>,
            String(group.rooms),
            money(group.rate),
            `${group.adults} adults · ${group.children} children`,
            "Best Available · Advance Purchase · Corporate",
          ])}
        />
      </article>
    </>
  );
}

function Invoices({
  state,
  notify,
}: {
  state: FeatureState;
  notify: Props["notify"];
}) {
  return (
    <>
      <Heading
        title="Invoices"
        description="Tax invoice register generated from primary folios; split-billing readiness is visible per folio."
      />
      <StatCards
        items={[
          ["Invoices", String(state.folios.length)],
          [
            "Open",
            String(
              state.folios.filter((item) => item.status === "OPEN").length,
            ),
          ],
          [
            "Billed value",
            money(
              state.folios.reduce(
                (sum, item) => sum + Number(item.totalPaise),
                0,
              ),
            ),
          ],
        ]}
      />
      <article className="glass-card">
        <DataGrid
          headers={[
            "Invoice",
            "Booking",
            "Status",
            "Subtotal",
            "Tax",
            "Total",
            "Action",
          ]}
          rows={state.folios.map((folio, index) => {
            const reservation = state.reservations.find(
              (item) => item.id === folio.reservationId,
            );
            return [
              `INV-${String(index + 1).padStart(5, "0")}`,
              String(reservation?.reference ?? folio.reservationId),
              <Status key="status" value={folio.status} />,
              money(folio.subtotalPaise),
              money(folio.taxPaise),
              <strong key="total">{money(folio.totalPaise)}</strong>,
              <button
                className="text-button"
                key="action"
                onClick={() =>
                  notify(
                    `Invoice preview ready for ${String(reservation?.reference ?? folio.id)}.`,
                  )
                }
              >
                Preview / split
              </button>,
            ];
          })}
        />
      </article>
    </>
  );
}

function GuestProfiles({ state }: { state: FeatureState }) {
  const guests = Object.values(
    state.reservations.reduce<Record<string, Row>>((all, reservation) => {
      const id = String(reservation.guestId ?? reservation.guestName);
      const previous = all[id];
      all[id] = {
        id,
        guestName: reservation.guestName,
        email: reservation.email,
        phone: reservation.phone,
        city: reservation.city,
        loyaltyTier: reservation.loyaltyTier,
        preferences: reservation.preferences,
        dietaryRequirements: reservation.dietaryRequirements,
        stays: Number(previous?.stays ?? 0) + 1,
        lastStay:
          String(previous?.lastStay ?? "") > String(reservation.departureDate)
            ? previous?.lastStay
            : reservation.departureDate,
      };
      return all;
    }, {}),
  );
  return (
    <>
      <Heading
        title="Guest profiles"
        description="Consolidated contact, loyalty, preferences, dietary notes and stay history."
      />
      <article className="glass-card">
        <DataGrid
          headers={[
            "Guest",
            "Contact",
            "City",
            "Loyalty",
            "Preferences",
            "Stays",
            "Last stay",
          ]}
          rows={guests.map((guest) => [
            <strong key="guest">{String(guest.guestName)}</strong>,
            <span key="contact">
              {String(guest.phone ?? "—")}
              <small className="extra-cell-note">
                {String(guest.email ?? "")}
              </small>
            </span>,
            String(guest.city ?? "—"),
            String(guest.loyaltyTier ?? "None"),
            String(guest.preferences ?? guest.dietaryRequirements ?? "—"),
            String(guest.stays),
            shortDate(guest.lastStay),
          ])}
        />
      </article>
    </>
  );
}

function InventoryMovements({ state }: { state: FeatureState }) {
  const movements = state.rooms.slice(0, 0);
  const sample = [
    [
      "MOV-3208",
      "Premium bath towel",
      "STOCK OUT",
      "12",
      "Housekeeping issue",
      "Sonal Pawar",
    ],
    [
      "MOV-3207",
      "Mineral water 500ml",
      "STOCK IN",
      "96",
      "Supplier receipt",
      "Arjun Khanna",
    ],
    [
      "MOV-3206",
      "Coffee sachets",
      "ADJUSTMENT",
      "8",
      "Cycle count",
      "Kabir Shaikh",
    ],
  ];
  void movements;
  return (
    <>
      <Heading
        title="Inventory movements"
        description="Stock-in, stock-out and adjustment ledger with running operational reasons."
      />
      <StatCards
        items={[
          ["Movements today", String(sample.length)],
          ["Stock receipts", "96 units"],
          ["Department issues", "20 units"],
        ]}
      />
      <article className="glass-card">
        <DataGrid
          headers={[
            "Movement",
            "Item",
            "Type",
            "Quantity",
            "Reason",
            "Recorded by",
          ]}
          rows={sample}
        />
      </article>
    </>
  );
}

const seedLostFound = [
  {
    id: "LF-104",
    item: "Black wireless earbuds",
    location: "Room 204",
    custody: "Front desk locker 2",
    status: "STORED",
  },
  {
    id: "LF-103",
    item: "Passport wallet",
    location: "Restaurant",
    custody: "Manager safe",
    status: "FOUND",
  },
  {
    id: "LF-102",
    item: "Blue travel bag",
    location: "Lobby",
    custody: "Bell desk",
    status: "CLAIMED",
  },
];

function LostFound({ notify }: { notify: Props["notify"] }) {
  const [items, setItems] = useState(seedLostFound);
  const add = () => {
    const description = window.prompt("Item description");
    if (!description?.trim()) return;
    setItems((current) => [
      {
        id: `LF-${105 + current.length}`,
        item: description.trim(),
        location: "To be recorded",
        custody: "Front desk",
        status: "FOUND",
      },
      ...current,
    ]);
    notify("Lost & found item recorded.");
  };
  return (
    <>
      <Heading
        title="Lost & found"
        description="Custody register for items found, stored, claimed and released."
        actions={
          <button className="primary-button" onClick={add}>
            + Record item
          </button>
        }
      />
      <article className="glass-card">
        <DataGrid
          headers={[
            "Reference",
            "Item",
            "Found at",
            "Custody",
            "Status",
            "Action",
          ]}
          rows={items.map((item) => [
            item.id,
            <strong key="item">{item.item}</strong>,
            item.location,
            item.custody,
            <Status key="status" value={item.status} />,
            item.status !== "RELEASED" ? (
              <button
                className="text-button"
                key="action"
                onClick={() => {
                  setItems((current) =>
                    current.map((row) =>
                      row.id === item.id ? { ...row, status: "RELEASED" } : row,
                    ),
                  );
                  notify(`${item.id} released with custody trail.`);
                }}
              >
                Release
              </button>
            ) : (
              "Complete"
            ),
          ])}
        />
      </article>
    </>
  );
}

function RestaurantFeature({ view, state, notify }: Props) {
  if (view === "Meal Service")
    return (
      <>
        <Heading
          title="Meal service"
          description="Breakfast, lunch and dinner entitlements linked to stays."
        />
        <StatCards
          items={[
            [
              "Today’s covers",
              String(
                state.restaurantMealBookings.reduce(
                  (sum, item) => sum + Number(item.guestCount ?? 0),
                  0,
                ),
              ),
            ],
            ["Booked meals", String(state.restaurantMealBookings.length)],
            [
              "Dietary notes",
              String(
                state.restaurantMealBookings.filter((item) => item.dietaryNotes)
                  .length,
              ),
            ],
          ]}
        />
        <article className="glass-card">
          <DataGrid
            headers={[
              "Booking",
              "Room",
              "Service date",
              "Meal",
              "Covers",
              "Status",
            ]}
            rows={state.restaurantMealBookings.map((item) => [
              String(item.bookingReference),
              String(item.roomNumber ?? "—"),
              shortDate(item.serviceDate),
              String(item.mealPeriod).replaceAll("_", " "),
              String(item.guestCount),
              <Status key="status" value={item.status} />,
            ])}
          />
        </article>
      </>
    );
  if (view === "Menu Management") {
    const menu = [
      ["Masala dosa", "Breakfast", 28000, true],
      ["Paneer tikka", "Starters", 44000, true],
      ["Butter chicken", "Main course", 62000, true],
      ["Dal khichdi", "Main course", 36000, true],
      ["Fresh lime soda", "Beverages", 16000, true],
    ] as Array<[string, string, number, boolean]>;
    return (
      <>
        <Heading
          title="Menu management"
          description="Availability, pricing and preparation catalogue for restaurant and room service."
        />
        <article className="glass-card">
          <DataGrid
            headers={["Item", "Category", "Price", "Availability", "Action"]}
            rows={menu.map((item) => [
              <strong key="name">{item[0]}</strong>,
              item[1],
              money(item[2]),
              <Status
                key="status"
                value={item[3] ? "AVAILABLE" : "UNAVAILABLE"}
              />,
              <button
                className="text-button"
                key="action"
                onClick={() => notify(`${item[0]} availability updated.`)}
              >
                Toggle
              </button>,
            ])}
          />
        </article>
      </>
    );
  }
  const roomOrders = state.restaurantOrders.filter((item) =>
    String(item.orderType).includes("ROOM"),
  );
  return (
    <>
      <Heading
        title="Room service"
        description="Room-delivery order queue with folio posting and fulfilment status."
      />
      <StatCards
        items={[
          ["Room orders", String(roomOrders.length)],
          [
            "Open",
            String(
              roomOrders.filter(
                (item) =>
                  !["DELIVERED", "CLOSED"].includes(String(item.status)),
              ).length,
            ),
          ],
          [
            "Order value",
            money(
              roomOrders.reduce(
                (sum, item) => sum + Number(item.totalPaise),
                0,
              ),
            ),
          ],
        ]}
      />
      <article className="glass-card">
        <DataGrid
          headers={["Order", "Room", "Booking", "Total", "Payment", "Status"]}
          rows={roomOrders.map((item) => [
            String(item.id),
            String(item.roomNumber),
            String(item.reservationId),
            money(item.totalPaise),
            <Status key="payment" value={item.paymentStatus} />,
            <Status key="status" value={item.status} />,
          ])}
        />
      </article>
    </>
  );
}

function TravelFeature({ view, state }: Props) {
  const managers = ["Rohan Verma", "Kavita Rao", "Imran Sheikh"];
  if (view === "Tours")
    return (
      <>
        <Heading
          title="Tour departures"
          description="Scheduled departures derived from active travel packages."
        />
        <article className="glass-card">
          <DataGrid
            headers={[
              "Tour",
              "Package",
              "Duration",
              "Route",
              "Capacity",
              "Status",
            ]}
            rows={state.packages.map((item, index) => [
              `TOUR-${2601 + index}`,
              String(item.name),
              `${String(item.durationDays)} days`,
              String(item.locations),
              `${String(item.booked)}/${String(item.capacity)}`,
              <Status
                key="status"
                value={index === 0 ? "CONFIRMED" : "SELLING"}
              />,
            ])}
          />
        </article>
      </>
    );
  if (view === "Participants")
    return (
      <>
        <Heading
          title="Tour participants"
          description="Traveller roster, room-sharing preference, documents and payment position."
        />
        <article className="glass-card">
          <DataGrid
            headers={[
              "Participant",
              "Tour",
              "Sharing",
              "Documents",
              "Payable",
              "Balance",
            ]}
            rows={state.inquiries
              .slice(0, 8)
              .map((item, index) => [
                String(item.customerName),
                `TOUR-${2601 + (index % Math.max(state.packages.length, 1))}`,
                index % 3 === 0 ? "Single" : "Double",
                index % 2 ? "Received" : "Pending",
                money(item.estimatedValuePaise),
                money(
                  Math.round(
                    Number(item.estimatedValuePaise) * (index % 2 ? 0 : 0.35),
                  ),
                ),
              ])}
          />
        </article>
      </>
    );
  return (
    <>
      <Heading
        title="Tour managers"
        description="Guide availability, languages, experience and assigned departures."
      />
      <section className="record-grid">
        {managers.map((name, index) => (
          <article className="operation-card" key={name}>
            <span className="severity low">ACTIVE</span>
            <h3>{name}</h3>
            <p>
              {
                [
                  "Hindi, English, Marathi",
                  "Hindi, English, Gujarati",
                  "Hindi, English, Urdu",
                ][index]
              }
            </p>
            <div>
              <small>{12 + index * 7} tours led</small>
              <b>{(4.7 + index / 10).toFixed(1)} ★</b>
            </div>
          </article>
        ))}
      </section>
    </>
  );
}

function SalesFeature({ view, state, notify }: Props) {
  if (view === "Sales Pipeline")
    return (
      <>
        <Heading
          title="Sales pipeline"
          description="Inquiry opportunities grouped by their current conversion stage."
        />
        <div className="crm-pipeline">
          {["NEW", "FOLLOW_UP", "NEGOTIATION", "CONVERTED"].map((stage) => (
            <section key={stage}>
              <h3>{stage.replace("_", " ")}</h3>
              {state.inquiries
                .filter((item) => item.status === stage)
                .map((item) => (
                  <article key={String(item.id)}>
                    <span>{String(item.reference)}</span>
                    <strong>{String(item.customerName)}</strong>
                    <p>{String(item.service)}</p>
                    <div>
                      <small>{String(item.owner)}</small>
                      <b>{money(item.estimatedValuePaise)}</b>
                    </div>
                  </article>
                ))}
            </section>
          ))}
        </div>
      </>
    );
  if (view === "Follow-ups")
    return (
      <>
        <Heading
          title="Follow-ups"
          description="Due-date queue for calls, emails, WhatsApp and client visits."
        />
        <article className="glass-card">
          <DataGrid
            headers={[
              "Inquiry",
              "Customer",
              "Owner",
              "Due",
              "Channel",
              "Action",
            ]}
            rows={state.inquiries
              .filter(
                (item) => !["CONVERTED", "LOST"].includes(String(item.status)),
              )
              .map((item, index) => [
                String(item.reference),
                String(item.customerName),
                String(item.owner),
                String(item.followUpAt)
                  ? new Date(String(item.followUpAt)).toLocaleString("en-IN")
                  : "Not set",
                ["Call", "Email", "WhatsApp"][index % 3],
                <button
                  className="text-button"
                  key="action"
                  onClick={() =>
                    notify(`Follow-up completed for ${String(item.reference)}.`)
                  }
                >
                  Mark done
                </button>,
              ])}
          />
        </article>
      </>
    );
  return (
    <>
      <Heading
        title="Communications"
        description="Unified outbound message history linked to inquiries and reservations."
        actions={
          <button
            className="primary-button"
            onClick={() => notify("Message composer opened in demo mode.")}
          >
            + New message
          </button>
        }
      />
      <article className="glass-card">
        <DataGrid
          headers={[
            "Channel",
            "Recipient",
            "Subject",
            "Related record",
            "Status",
          ]}
          rows={[
            ...state.inquiries
              .slice(0, 4)
              .map((item, index) => [
                index % 2 ? "Email" : "WhatsApp",
                String(item.customerName),
                index % 2
                  ? "Your hospitality proposal"
                  : "Follow-up on your enquiry",
                String(item.reference),
                <Status key="status" value="DELIVERED" />,
              ]),
            ...state.reservations
              .slice(0, 3)
              .map((item) => [
                "Email",
                String(item.guestName),
                "Reservation confirmation",
                String(item.reference),
                <Status key="status" value="SENT" />,
              ]),
          ]}
        />
      </article>
    </>
  );
}

function AdminFeature({ view, state, notify }: Props) {
  if (view === "Users & Permissions") {
    const users = [
      ["Parth Babulkar", "owner@demo.hospitalityos.brainadz.com", "OWNER"],
      ["Arjun Khanna", "manager@demo.hospitalityos.brainadz.com", "MANAGER"],
      [
        "Priya Deshmukh",
        "reception@demo.hospitalityos.brainadz.com",
        "RECEPTION",
      ],
      [
        "Neha Kulkarni",
        "travel@demo.hospitalityos.brainadz.com",
        "TRAVEL_AGENT",
      ],
      ["Aditi Mehta", "accounts@demo.hospitalityos.brainadz.com", "ACCOUNTS"],
    ];
    return (
      <>
        <Heading
          title="Users & permissions"
          description="Role assignments and access scope for hotel, travel, accounts and operations."
        />
        <article className="glass-card">
          <DataGrid
            headers={["User", "Email", "Role", "Status", "Access"]}
            rows={users.map((user) => [
              <strong key="name">{user[0]}</strong>,
              user[1],
              user[2].replaceAll("_", " "),
              <Status key="status" value="ACTIVE" />,
              <button
                className="text-button"
                key="access"
                onClick={() => notify(`${user[2]} permission matrix selected.`)}
              >
                View permissions
              </button>,
            ])}
          />
        </article>
      </>
    );
  }
  return (
    <>
      <Heading
        title="Properties & settings"
        description="Primary property profile, operating times, tax defaults, connection and notification preferences."
      />
      <section className="extra-two-column">
        <article className="glass-card settings-card">
          <h2>{state.property.name}</h2>
          <dl>
            <div>
              <dt>City</dt>
              <dd>{state.property.city}</dd>
            </div>
            <div>
              <dt>Connection</dt>
              <dd>
                <Status value={state.property.connectionStatus} />
              </dd>
            </div>
            <div>
              <dt>Check-in</dt>
              <dd>14:00</dd>
            </div>
            <div>
              <dt>Check-out</dt>
              <dd>11:00</dd>
            </div>
            <div>
              <dt>Currency</dt>
              <dd>INR (₹)</dd>
            </div>
            <div>
              <dt>Tax rate</dt>
              <dd>18%</dd>
            </div>
          </dl>
        </article>
        <article className="glass-card settings-card">
          <h2>Workspace preferences</h2>
          <label>
            <span>Reservation notifications</span>
            <input type="checkbox" defaultChecked />
          </label>
          <label>
            <span>Room-ready notifications</span>
            <input type="checkbox" defaultChecked />
          </label>
          <label>
            <span>Low-stock alerts</span>
            <input type="checkbox" defaultChecked />
          </label>
          <label>
            <span>Compact tables</span>
            <input type="checkbox" />
          </label>
          <button
            className="primary-button"
            onClick={() => notify("Property settings saved for this session.")}
          >
            Save settings
          </button>
        </article>
      </section>
    </>
  );
}

export function ExtraFeatureView(props: Props) {
  if (props.view === "Room Calendar")
    return <RoomCalendar state={props.state} />;
  if (props.view === "Arrivals & Departures")
    return <Movements state={props.state} />;
  if (props.view === "Room Types & Rates")
    return <RoomTypesRates state={props.state} />;
  if (props.view === "Guest Profiles")
    return <GuestProfiles state={props.state} />;
  if (props.view === "Invoices")
    return <Invoices state={props.state} notify={props.notify} />;
  if (props.view === "Inventory Movements")
    return <InventoryMovements state={props.state} />;
  if (props.view === "Lost & Found") return <LostFound notify={props.notify} />;
  if (["Room Service", "Meal Service", "Menu Management"].includes(props.view))
    return <RestaurantFeature {...props} />;
  if (["Tours", "Participants", "Tour Managers"].includes(props.view))
    return <TravelFeature {...props} />;
  if (["Sales Pipeline", "Follow-ups", "Communications"].includes(props.view))
    return <SalesFeature {...props} />;
  return <AdminFeature {...props} />;
}
