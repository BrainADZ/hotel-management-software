"use client";
import { apiFetch } from "@/lib/api/client";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import type { AppRole } from "@hotel/shared/domain";
type Row = Record<string, unknown>;
const fields = [
  ["firstName", "First Name", "text"],
  ["lastName", "Last Name", "text"],
  ["phone", "Phone", "text"],
  ["alternatePhone", "Alternate Phone", "text"],
  ["email", "Email", "email"],
  ["dateOfBirth", "Date of Birth", "date"],
  ["nationality", "Nationality", "text"],
  ["addressLine1", "Address Line 1", "text"],
  ["addressLine2", "Address Line 2", "text"],
  ["city", "City", "text"],
  ["state", "State", "text"],
  ["postalCode", "Postal Code", "text"],
  ["country", "Country", "text"],
  ["companyName", "Company Name", "text"],
  ["gstin", "Company GSTIN", "text"],
] as const;
const blank = Object.fromEntries([
  ...fields.map(([key]) => [key, ""]),
  ["notes", ""],
]) as Record<string, string>;
async function api<T = Row>(path: string, init?: RequestInit): Promise<T> {
  const response = await apiFetch(path, {
      ...init,
      cache: "no-store",
      headers: { "content-type": "application/json", ...(init?.headers ?? {}) },
    }),
    body = (await response.json()) as T;
  if (!response.ok)
    throw new Error(
      (body as { error?: { message?: string } }).error?.message ??
        "Request failed.",
    );
  return body;
}
export function ProductionFrontDesk({
  openReservation,
  openStay,
  notify,
  refreshKey,
}: {
  openReservation: () => void;
  openStay: (row: Row) => void;
  notify: (m: string) => void;
  refreshKey: string;
}) {
  const [tab, setTab] = useState("arrivals");
  const [rows, setRows] = useState<Row[]>([]);
  const [busy, setBusy] = useState(true);
  const load = useCallback(async () => {
    void refreshKey;
    setBusy(true);
    try {
      setRows(
        (await api<{ items: Row[] }>(`/api/front-desk?view=${tab}&pageSize=50`))
          .items,
      );
    } catch (e) {
      notify(e instanceof Error ? e.message : "Front desk could not load.");
    } finally {
      setBusy(false);
    }
  }, [tab, notify, refreshKey]);
  useEffect(() => {
    const t = setTimeout(() => void load(), 0);
    return () => clearTimeout(t);
  }, [load]);
  return (
    <>
      <section className="page-heading platform-page-heading">
        <div>
          <p className="eyebrow">Hotel / Front Desk</p>
          <h1>Front desk command board</h1>
          <p>Property-time arrivals, departures and in-house guests.</p>
        </div>
        <div className="page-actions">
          <button className="primary-button" onClick={openReservation}>
            + New reservation
          </button>
        </div>
      </section>
      <div className="toolbar">
        <div className="segmented">
          {[
            ["arrivals", "Today's Arrivals"],
            ["expected", "Expected Arrivals"],
            ["departures", "Departures"],
            ["in-house", "In-House"],
            ["no-shows", "No-Shows"],
          ].map(([v, l]) => (
            <button
              key={v}
              className={tab === v ? "active" : ""}
              onClick={() => setTab(v)}
            >
              {l}
            </button>
          ))}
        </div>
        <span>{busy ? "Loading…" : `${rows.length} guests`}</span>
      </div>
      <div className="record-grid">
        {rows.map((r) => (
          <button
            className="guest-card"
            key={String(r.id)}
            onClick={() => openStay(r)}
          >
            <span className="record-icon">FD</span>
            <div>
              <strong>{String(r.guestName)}</strong>
              <small>
                {String(r.reference)} · {String(r.arrivalDate)} –{" "}
                {String(r.departureDate)}
              </small>
              <small>
                {String(r.phone ?? "No phone")} · {String(r.source)}
              </small>
            </div>
            <span className="room-chip">
              {r.roomNumber
                ? `Room ${String(r.roomNumber)}`
                : "Room unassigned"}
            </span>
            <span
              className={`status ${String(r.status).toLowerCase().replaceAll("_", "-")}`}
            >
              {String(r.status).replaceAll("_", " ")}
            </span>
          </button>
        ))}
      </div>
      {!busy && !rows.length && (
        <div className="empty-state">
          <strong>No records for this view.</strong>
        </div>
      )}
    </>
  );
}
export function ProductionGuests({
  notify,
  role,
}: {
  notify: (m: string) => void;
  role: AppRole;
}) {
  const [search, setSearch] = useState("");
  const [rows, setRows] = useState<Row[]>([]);
  const [selected, setSelected] = useState<Row | null>(null);
  const [history, setHistory] = useState<Row | null>(null);
  const [docs, setDocs] = useState<Row[]>([]);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState(blank);
  const [showKyc, setShowKyc] = useState(false);
  const [kyc, setKyc] = useState({
    documentType: "AADHAAR",
    last4: "",
    verified: false,
  });
  const canKyc = ["OWNER", "MANAGER", "RECEPTION"].includes(role);
  const load = useCallback(async () => {
    try {
      setRows(
        (
          await api<{ items: Row[] }>(
            `/api/guests?search=${encodeURIComponent(search)}&pageSize=50`,
          )
        ).items,
      );
    } catch (e) {
      notify(e instanceof Error ? e.message : "Guests could not load.");
    }
  }, [search, notify]);
  useEffect(() => {
    const t = setTimeout(() => void load(), 200);
    return () => clearTimeout(t);
  }, [load]);
  async function open(g: Row) {
    try {
      const [d, h, k] = await Promise.all([
        api<Row>(`/api/guests/${String(g.id)}`),
        api<Row>(`/api/guests/${String(g.id)}/history`),
        canKyc
          ? api<Row[]>(`/api/guests/${String(g.id)}/identity-documents`)
          : Promise.resolve([]),
      ]);
      setSelected(d);
      setHistory(h);
      setDocs(k);
    } catch (e) {
      notify(e instanceof Error ? e.message : "Guest details could not load.");
    }
  }
  function edit(g: Row | null) {
    setForm(
      g
        ? Object.fromEntries(
            Object.keys(blank).map((k) => [k, String(g[k] ?? "")]),
          )
        : blank,
    );
    setEditing(true);
  }
  async function save(e: FormEvent) {
    e.preventDefault();
    try {
      const payload = Object.fromEntries(
          Object.entries(form).map(([k, v]) => [k, v || undefined]),
        ),
        saved = selected
          ? await api<Row>(`/api/guests/${String(selected.id)}`, {
              method: "PATCH",
              body: JSON.stringify(payload),
            })
          : await api<Row>("/api/guests", {
              method: "POST",
              body: JSON.stringify(payload),
            });
      setSelected(saved);
      setEditing(false);
      await load();
      notify("Guest profile saved.");
    } catch (x) {
      notify(x instanceof Error ? x.message : "Guest could not be saved.");
    }
  }
  async function saveKyc(e: FormEvent) {
    e.preventDefault();
    if (!selected) return;
    try {
      setDocs(
        await api<Row[]>(
          `/api/guests/${String(selected.id)}/identity-documents`,
          { method: "POST", body: JSON.stringify(kyc) },
        ),
      );
      setShowKyc(false);
      setKyc({ documentType: "AADHAAR", last4: "", verified: false });
      notify("Masked KYC metadata saved.");
    } catch (x) {
      notify(x instanceof Error ? x.message : "KYC could not be saved.");
    }
  }
  return (
    <>
      <section className="page-heading platform-page-heading">
        <div>
          <p className="eyebrow">Hotel / Guests</p>
          <h1>Guest profiles</h1>
          <p>
            Searchable guest directory, profile data, stay history and masked
            KYC.
          </p>
        </div>
        <div className="page-actions">
          <button
            className="primary-button"
            onClick={() => {
              setSelected(null);
              edit(null);
            }}
          >
            + New guest
          </button>
        </div>
      </section>
      <div className="toolbar">
        <input
          placeholder="Search name, phone or email"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <span>{rows.length} guests</span>
      </div>
      <div className="record-grid">
        {rows.map((g) => (
          <button
            className="guest-card guest-profile-card"
            key={String(g.id)}
            onClick={() => void open(g)}
          >
            <span className="record-icon">G</span>
            <div>
              <strong>{String(g.displayName ?? g.fullName)}</strong>
              <small>{String(g.city ?? "City not recorded")}</small>
            </div>
            <div className="guest-meta">
              <span>{String(g.phone)}</span>
              <small>{String(g.email ?? "No email")}</small>
            </div>
          </button>
        ))}
      </div>
      {(selected || editing) && (
        <div className="modal-backdrop">
          <div className="modal-card">
            <div className="modal-heading">
              <div>
                <p className="section-kicker">Guest profile</p>
                <h2>
                  {editing
                    ? selected
                      ? "Edit Guest"
                      : "New Guest"
                    : String(selected?.displayName ?? selected?.fullName)}
                </h2>
              </div>
              <button
                className="icon-button"
                onClick={() => {
                  setSelected(null);
                  setEditing(false);
                }}
              >
                ×
              </button>
            </div>
            {editing ? (
              <form onSubmit={(e) => void save(e)}>
                <div className="form-grid">
                  {fields.map(([k, l, t]) => (
                    <label key={k}>
                      <span>{l}</span>
                      <input
                        required={k === "firstName" || k === "phone"}
                        type={t}
                        value={form[k]}
                        onChange={(e) =>
                          setForm({ ...form, [k]: e.target.value })
                        }
                      />
                    </label>
                  ))}
                  <label className="wide">
                    <span>Guest Notes</span>
                    <textarea
                      value={form.notes}
                      onChange={(e) =>
                        setForm({ ...form, notes: e.target.value })
                      }
                    />
                  </label>
                </div>
                <div className="modal-actions">
                  <button
                    type="button"
                    className="secondary-button"
                    onClick={() => setEditing(false)}
                  >
                    Cancel
                  </button>
                  <button className="primary-button">Save Guest</button>
                </div>
              </form>
            ) : (
              selected && (
                <>
                  <div className="drawer-folio">
                    <div>
                      <span>Phone / Email</span>
                      <strong>
                        {String(selected.phone)} ·{" "}
                        {String(selected.email ?? "—")}
                      </strong>
                    </div>
                    <div>
                      <span>Address</span>
                      <strong>
                        {[
                          selected.addressLine1,
                          selected.addressLine2,
                          selected.city,
                          selected.state,
                          selected.postalCode,
                          selected.country,
                        ]
                          .filter(Boolean)
                          .join(", ") || "—"}
                      </strong>
                    </div>
                    <div>
                      <span>Company / GSTIN</span>
                      <strong>
                        {String(selected.companyName ?? "—")} ·{" "}
                        {String(selected.gstin ?? "—")}
                      </strong>
                    </div>
                    <div>
                      <span>Guest Notes</span>
                      <strong>{String(selected.notes ?? "—")}</strong>
                    </div>
                  </div>
                  {canKyc && (
                    <section className="drawer-folio">
                      <div className="card-heading">
                        <h3>KYC</h3>
                        <button
                          className="secondary-button"
                          onClick={() => setShowKyc(true)}
                        >
                          Add Identity Document
                        </button>
                      </div>
                      {docs.map((d) => (
                        <div key={String(d.id)}>
                          <span>
                            {String(d.documentType).replaceAll("_", " ")}
                          </span>
                          <strong>
                            {String(d.maskedNumber)} ·{" "}
                            {d.verified ? "Verified" : "Not verified"}
                          </strong>
                        </div>
                      ))}
                    </section>
                  )}
                  <h3>Stay history</h3>
                  {((history?.reservations as Row[]) ?? []).map((r) => (
                    <div className="guest-card" key={String(r.id)}>
                      <strong>{String(r.reference)}</strong>
                      <small>
                        {String(r.arrivalDate)} – {String(r.departureDate)} ·{" "}
                        {String(r.status)}
                      </small>
                    </div>
                  ))}
                  <div className="modal-actions">
                    <button
                      className="secondary-button"
                      onClick={() => edit(selected)}
                    >
                      Edit Guest
                    </button>
                    <button
                      className="primary-button"
                      onClick={() => setSelected(null)}
                    >
                      Done
                    </button>
                  </div>
                </>
              )
            )}
          </div>
        </div>
      )}
      {showKyc && selected && (
        <div className="modal-backdrop">
          <form
            className="modal-card compact-modal"
            onSubmit={(e) => void saveKyc(e)}
          >
            <div className="modal-heading">
              <div>
                <p className="section-kicker">Safe identity metadata</p>
                <h2>Add Identity Document</h2>
              </div>
              <button
                type="button"
                className="icon-button"
                onClick={() => setShowKyc(false)}
              >
                ×
              </button>
            </div>
            <div className="form-grid">
              <label>
                <span>Document Type</span>
                <select
                  value={kyc.documentType}
                  onChange={(e) =>
                    setKyc({ ...kyc, documentType: e.target.value })
                  }
                >
                  {[
                    ["AADHAAR", "Aadhaar"],
                    ["PASSPORT", "Passport"],
                    ["DRIVING_LICENCE", "Driving Licence"],
                    ["VOTER_ID", "Voter ID"],
                    ["OTHER", "Other"],
                  ].map(([v, l]) => (
                    <option key={v} value={v}>
                      {l}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                <span>
                  {kyc.documentType === "AADHAAR"
                    ? "Aadhaar — Last 4 digits"
                    : "Last 4 characters"}
                </span>
                <input
                  required
                  minLength={4}
                  maxLength={4}
                  pattern="[A-Za-z0-9]{4}"
                  value={kyc.last4}
                  onChange={(e) => setKyc({ ...kyc, last4: e.target.value })}
                />
                <small>Only last 4 are accepted and stored masked.</small>
              </label>
              <label>
                <span>Verified</span>
                <input
                  type="checkbox"
                  checked={kyc.verified}
                  onChange={(e) =>
                    setKyc({ ...kyc, verified: e.target.checked })
                  }
                />
              </label>
            </div>
            <div className="modal-actions">
              <button
                type="button"
                className="secondary-button"
                onClick={() => setShowKyc(false)}
              >
                Cancel
              </button>
              <button className="primary-button">Save KYC</button>
            </div>
          </form>
        </div>
      )}
    </>
  );
}
export function ProductionReservationGuests({
  reservationId,
  notify,
}: {
  reservationId: string;
  notify: (m: string) => void;
}) {
  const [linked, setLinked] = useState<Row[]>([]);
  const [q, setQ] = useState("");
  const [results, setResults] = useState<Row[]>([]);
  const load = useCallback(
    async () =>
      setLinked(await api<Row[]>(`/api/reservations/${reservationId}/guests`)),
    [reservationId],
  );
  useEffect(() => {
    const t = setTimeout(() => void load(), 0);
    return () => clearTimeout(t);
  }, [load]);
  useEffect(() => {
    const t = setTimeout(() => {
      if (!q) return setResults([]);
      void api<{ items: Row[] }>(
        `/api/guests?search=${encodeURIComponent(q)}&pageSize=8`,
      ).then((x) => setResults(x.items));
    }, 250);
    return () => clearTimeout(t);
  }, [q]);
  async function link(id: string) {
    try {
      await api(`/api/reservations/${reservationId}/guests`, {
        method: "POST",
        body: JSON.stringify({ guestId: id }),
      });
      setQ("");
      await load();
      notify("Accompanying guest linked.");
    } catch (e) {
      notify(e instanceof Error ? e.message : "Guest could not be linked.");
    }
  }
  return (
    <section className="drawer-folio">
      <div className="card-heading">
        <h3>Reservation Guests</h3>
        <strong>{linked.length}</strong>
      </div>
      {linked.map((g) => (
        <div key={String(g.id)}>
          <span>{String(g.guestRole)}</span>
          <strong>{String(g.displayName)}</strong>
        </div>
      ))}
      <label>
        <span>Add existing guest</span>
        <input value={q} onChange={(e) => setQ(e.target.value)} />
      </label>
      {results.map((g) => (
        <button
          className="secondary-button"
          key={String(g.id)}
          onClick={() => void link(String(g.id))}
        >
          {String(g.displayName ?? g.fullName)} · {String(g.phone)}
        </button>
      ))}
    </section>
  );
}
