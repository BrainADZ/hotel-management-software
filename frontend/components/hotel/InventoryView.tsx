"use client";
/* eslint-disable @typescript-eslint/no-unused-vars */
import { AlertTriangle, Check, Clock3, IndianRupee, Pencil, Plus, X } from "lucide-react";
import { useState, type FormEvent } from "react";
import type { AppRole } from "@hotel/shared/domain";
import { AppGlyph, Metric, PageHeading, Status, dateTime, localDateTimeInputValue, money, type DamageSeverity, type PlatformViewProps, type ReservationInspectionSummary, type Row, type Surface } from "@/app/hotel-platform";
export function InventoryView({
  state,
  role,
  surface,
  propertyRestricted,
  command,
  refresh,
  updateState,
  notify,
}: PlatformViewProps) {
  const [editing, setEditing] = useState<Row | "NEW" | null>(null);
  const canEdit = ["OWNER", "MANAGER", "RESTAURANT"].includes(role);
  async function save(form: Row) {
    const result = await command({
      action: "UPSERT_INVENTORY",
      surface,
      ...form,
    });
    const item = result.item as Row;
    updateState((current) =>
      current
        ? {
            ...current,
            inventory: [
              ...current.inventory.filter((record) => record.id !== item.id),
              item,
            ].sort((a, b) => String(a.name).localeCompare(String(b.name))),
          }
        : current,
    );
    setEditing(null);
    notify(
      result.noOp
        ? "No inventory values changed."
        : `${item.name} saved and logged with date, time and field changes.`,
    );
    void refresh();
  }
  return (
    <>
      <PageHeading
        eyebrow={role === "RESTAURANT" ? "Restaurant operations" : "Operations"}
        title="Inventory control"
        description={
          role === "RESTAURANT"
            ? "Manage kitchen, beverage and restaurant supplies with a complete change history."
            : "Add or edit stock with an automatic record of who changed what and when."
        }
        actions={
          canEdit && (
            <button
              className="primary-button"
              disabled={propertyRestricted}
              title={
                propertyRestricted
                  ? "Requires Master Hub connection"
                  : undefined
              }
              onClick={() => setEditing("NEW")}
            >
              <Plus size={16} /> Add inventory
            </button>
          )
        }
      />
      <div className="table-card">
        <table>
          <thead>
            <tr>
              <th>Item</th>
              <th>Category</th>
              {role !== "RESTAURANT" && <th>Department</th>}
              <th>Current</th>
              <th>Minimum</th>
              <th>Unit cost</th>
              <th>Updated</th>
              <th>Status</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {state.inventory.map((item) => (
              <tr key={String(item.id)}>
                <td>
                  <span className="table-domain-item">
                    <AppGlyph
                      name={role === "RESTAURANT" ? "restaurant" : "inventory"}
                      size={27}
                    />
                    <strong>{String(item.name)}</strong>
                  </span>
                </td>
                <td>{String(item.category)}</td>
                {role !== "RESTAURANT" && (
                  <td>
                    {String(item.department ?? "HOTEL").replaceAll("_", " ")}
                  </td>
                )}
                <td>
                  {Number(item.currentQuantity)} {String(item.unit)}
                </td>
                <td>
                  {Number(item.minimumQuantity)} {String(item.unit)}
                </td>
                <td>{money(item.unitCostRupees)}</td>
                <td>{dateTime(item.updatedAt)}</td>
                <td>
                  <Status
                    value={
                      Number(item.currentQuantity) <=
                      Number(item.minimumQuantity)
                        ? "REORDER"
                        : "IN STOCK"
                    }
                  />
                </td>
                <td>
                  {canEdit && (
                    <button
                      className="row-action"
                      disabled={propertyRestricted}
                      onClick={() => setEditing(item)}
                    >
                      <Pencil size={13} /> Edit
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {editing && (
        <InventoryModal
          role={role}
          item={editing === "NEW" ? null : editing}
          onClose={() => setEditing(null)}
          onSave={async (form) => {
            try {
              await save(form);
            } catch (cause) {
              notify(
                cause instanceof Error
                  ? cause.message
                  : "Inventory item could not be saved.",
              );
            }
          }}
        />
      )}
    </>
  );
}

function InventoryModal({
  item,
  role,
  onClose,
  onSave,
}: {
  item: Row | null;
  role: AppRole;
  onClose: () => void;
  onSave: (form: Row) => Promise<void>;
}) {
  const [form, setForm] = useState({
    name: String(item?.name ?? ""),
    category: String(
      item?.category ?? (role === "RESTAURANT" ? "Kitchen" : "Housekeeping"),
    ),
    department: String(
      item?.department ?? (role === "RESTAURANT" ? "RESTAURANT" : "HOTEL"),
    ),
    unit: String(item?.unit ?? "piece"),
    currentQuantity: Number(item?.currentQuantity ?? 0),
    minimumQuantity: Number(item?.minimumQuantity ?? 0),
    unitCostRupees: Number(item?.unitCostRupees ?? 0),
  });
  const [busy, setBusy] = useState(false);
  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    try {
      await onSave({
        id: item?.id,
        expectedUpdatedAt: item?.updatedAt,
        name: form.name,
        category: form.category,
        department: form.department,
        unit: form.unit,
        currentQuantity: form.currentQuantity,
        minimumQuantity: form.minimumQuantity,
        unitCostRupees: form.unitCostRupees,
      });
    } finally {
      setBusy(false);
    }
  }
  return (
    <div
      className="modal-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <form className="modal-card compact-modal" onSubmit={submit}>
        <div className="modal-heading">
          <div>
            <p className="section-kicker">Inventory audit</p>
            <h2>{item ? "Edit inventory item" : "Add inventory item"}</h2>
            <p>
              The saved values and their previous state will be timestamped
              automatically.
            </p>
          </div>
          <button type="button" className="icon-button" onClick={onClose}>
            <X size={17} />
          </button>
        </div>
        <div className="form-grid">
          <label className="wide">
            <span>Item name</span>
            <input
              required
              value={form.name}
              onChange={(event) =>
                setForm({ ...form, name: event.target.value })
              }
            />
          </label>
          <label>
            <span>Category</span>
            {role === "RESTAURANT" ? (
              <select
                value={form.category}
                onChange={(event) =>
                  setForm({ ...form, category: event.target.value })
                }
              >
                {["Kitchen", "Beverage", "Restaurant Supplies"].map((value) => (
                  <option key={value}>{value}</option>
                ))}
              </select>
            ) : (
              <input
                required
                value={form.category}
                onChange={(event) =>
                  setForm({ ...form, category: event.target.value })
                }
              />
            )}
          </label>
          {role !== "RESTAURANT" && (
            <label>
              <span>Department</span>
              <select
                value={form.department}
                onChange={(event) =>
                  setForm({ ...form, department: event.target.value })
                }
              >
                <option value="HOTEL">Hotel operations</option>
                <option value="RESTAURANT">Restaurant</option>
              </select>
            </label>
          )}
          <label>
            <span>Unit</span>
            <input
              required
              value={form.unit}
              onChange={(event) =>
                setForm({ ...form, unit: event.target.value })
              }
            />
          </label>
          <label>
            <span>Current quantity</span>
            <input
              type="number"
              min="0"
              step="1"
              value={form.currentQuantity}
              onChange={(event) =>
                setForm({
                  ...form,
                  currentQuantity: Number(event.target.value),
                })
              }
            />
          </label>
          <label>
            <span>Minimum quantity</span>
            <input
              type="number"
              min="0"
              step="1"
              value={form.minimumQuantity}
              onChange={(event) =>
                setForm({
                  ...form,
                  minimumQuantity: Number(event.target.value),
                })
              }
            />
          </label>
          <label className="wide">
            <span>Unit cost (₹)</span>
            <input
              type="number"
              min="0"
              step="0.01"
              value={form.unitCostRupees}
              onChange={(event) =>
                setForm({ ...form, unitCostRupees: Number(event.target.value) })
              }
            />
          </label>
        </div>
        <div className="modal-actions">
          <button type="button" className="secondary-button" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="primary-button" disabled={busy}>
            {busy ? "Saving & logging…" : "Save inventory item"}
          </button>
        </div>
      </form>
    </div>
  );
}
