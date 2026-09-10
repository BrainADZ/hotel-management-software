"use client";

import {
  AlertTriangle,
  Check,
  Clock3,
  IndianRupee,
  Pencil,
  Plus,
  X,
} from "lucide-react";
import { useState, type FormEvent } from "react";
import type { AppRole } from "@hotel/shared/domain";
import {
  AppGlyph,
  Metric,
  PageHeading,
  Status,
  dateTime,
  localDateTimeInputValue,
  money,
  type DamageSeverity,
  type PlatformViewProps,
  type ReservationInspectionSummary,
  type Row,
  type Surface,
} from "@/app/hotel-platform";

export function OperationsView(props: PlatformViewProps) {
  const { view, state, role } = props;
  if (view === "Housekeeping") return <HousekeepingView {...props} />;
  if (view === "Maintenance")
    return (
      <>
        <PageHeading
          eyebrow="Operations"
          title="Maintenance tickets"
          description="Operational issues can remove rooms from service with an auditable status trail."
        />
        <div className="record-grid">
          {state.maintenance.map((ticket) => (
            <article className="operation-card" key={String(ticket.id)}>
              <AppGlyph
                name="maintenance"
                size={36}
                className="operation-glyph"
              />
              <span
                className={`severity ${String(ticket.severity).toLowerCase()}`}
              >
                {String(ticket.severity)}
              </span>
              <h3>{String(ticket.issue)}</h3>
              <p>
                {String(ticket.id)} · Room{" "}
                {String(ticket.roomNumber ?? "General")}
              </p>
              <div>
                <Status value={String(ticket.status)} />
                <small>{String(ticket.assignedTo ?? "Unassigned")}</small>
              </div>
            </article>
          ))}
        </div>
      </>
    );
  if (view === "Inventory") return <InventoryView {...props} />;
  return (
    <>
      <PageHeading
        eyebrow="Restaurant"
        title="Orders & room service"
        description="Room postings validate an active checked-in stay before changing the cloud folio."
      />
      <div className="table-card">
        <table>
          <thead>
            <tr>
              <th>Order</th>
              <th>Room</th>
              <th>Type</th>
              <th>Total</th>
              <th>Kitchen / service</th>
              <th>Payment</th>
            </tr>
          </thead>
          <tbody>
            {state.restaurantOrders.map((order) => (
              <tr key={String(order.id)}>
                <td>
                  <strong>{String(order.id)}</strong>
                  <small>{dateTime(order.createdAt)}</small>
                </td>
                <td>{String(order.roomNumber ?? "Restaurant")}</td>
                <td>{String(order.orderType).replaceAll("_", " ")}</td>
                <td>{money(order.totalPaise)}</td>
                <td>
                  <Status value={String(order.status)} />
                </td>
                <td>
                  <Status value={String(order.paymentStatus)} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {role === "HOUSEKEEPING" && (
        <p className="privacy-note">
          <AppGlyph name="policy" size={22} /> Financial order details are
          restricted for this role.
        </p>
      )}
    </>
  );
}

export function HousekeepingOverviewView({
  state,
  surface,
  command,
  refresh,
  updateState,
  notify,
}: PlatformViewProps) {
  const [pending, setPending] = useState<Set<string>>(new Set());
  const [deferTask, setDeferTask] = useState<Row | null>(null);
  const [damageTask, setDamageTask] = useState<Row | null>(null);
  const tasks = state.housekeeping.filter(
    (task) => !["COMPLETED", "CANCELLED"].includes(String(task.status)),
  );
  const serviceTasks = tasks.filter(
    (task) => task.taskType !== "CHECKOUT_INSPECTION",
  );
  const inspections = tasks.filter(
    (task) => task.taskType === "CHECKOUT_INSPECTION",
  );
  const deferred = serviceTasks.filter((task) => task.status === "DEFERRED");

  async function optimisticCommand(
    task: Row,
    payload: Row,
    message: string,
    remove = true,
  ) {
    const taskId = String(task.id);
    if (pending.has(taskId)) return;
    setPending((current) => new Set(current).add(taskId));
    const previous = state.housekeeping;
    updateState((current) =>
      current
        ? {
            ...current,
            housekeeping: remove
              ? current.housekeeping.filter((item) => item.id !== task.id)
              : current.housekeeping.map((item) =>
                  item.id === task.id
                    ? {
                        ...item,
                        status: "DEFERRED",
                        outcome: "COME_LATER",
                        deferredUntil: payload.deferredUntil,
                        scheduledAt: payload.deferredUntil,
                        version: Number(item.version) + 1,
                      }
                    : item,
                ),
          }
        : current,
    );
    try {
      await command(payload);
      notify(message);
      await refresh();
    } catch (cause) {
      updateState((current) =>
        current ? { ...current, housekeeping: previous } : current,
      );
      notify(
        cause instanceof Error
          ? cause.message
          : "Room task could not be updated.",
      );
    } finally {
      setPending((current) => {
        const next = new Set(current);
        next.delete(taskId);
        return next;
      });
    }
  }

  function recordOutcome(
    task: Row,
    outcome: "DONE" | "GUEST_REFUSED",
    message: string,
  ) {
    return optimisticCommand(
      task,
      {
        action: "RECORD_HOUSEKEEPING_OUTCOME",
        taskId: task.id,
        expectedVersion: task.version,
        outcome,
        surface,
      },
      message,
    );
  }

  function submitNoDamage(task: Row) {
    return optimisticCommand(
      task,
      {
        action: "SUBMIT_ROOM_INSPECTION",
        taskId: task.id,
        expectedVersion: task.version,
        result: "NO_DAMAGE",
        surface,
      },
      `Room ${task.roomNumber} inspection completed with no damage.`,
    );
  }

  return (
    <>
      <PageHeading
        eyebrow="Housekeeping overview"
        title={`Good afternoon, ${state.actor.name.split(" ")[0]}.`}
        description="Only rooms that need service or checkout inspection are shown here."
      />
      <section className="service-summary-grid">
        <Metric
          label="Rooms needing service"
          value={serviceTasks.length - deferred.length}
        />
        <Metric label="Checkout inspections" value={inspections.length} />
        <Metric label="Come back later" value={deferred.length} />
      </section>
      {tasks.length ? (
        <section className="service-task-grid">
          {tasks.map((task) => {
            const isInspection = task.taskType === "CHECKOUT_INSPECTION";
            const isCheckoutCleaning = task.taskType === "CHECKOUT_CLEANING";
            return (
              <article
                className={`service-task-card ${pending.has(String(task.id)) ? "task-pending" : ""}`}
                key={String(task.id)}
              >
                <div className="service-task-heading">
                  <span className="record-icon" aria-hidden="true">
                    {isInspection ? (
                      <AppGlyph name="damage-alert" size={26} />
                    ) : (
                      <AppGlyph name="housekeeping" size={26} />
                    )}
                  </span>
                  <div>
                    <small>
                      {isInspection
                        ? "Checkout inspection"
                        : task.status === "DEFERRED"
                          ? "Return visit"
                          : isCheckoutCleaning
                            ? "Checkout cleaning"
                            : "Room service"}
                    </small>
                    <h2>Room {String(task.roomNumber)}</h2>
                  </div>
                  <Status value={String(task.priority)} />
                </div>
                <p>
                  {String(
                    task.notes ??
                      (isInspection
                        ? "Inspect the room before final folio closure."
                        : "Complete the requested room service."),
                  )}
                </p>
                <div className="service-task-meta">
                  <span>
                    <Clock3 size={13} />{" "}
                    {dateTime(task.deferredUntil ?? task.scheduledAt)}
                  </span>
                  {Boolean(task.assignedTo) && (
                    <span>
                      <AppGlyph name="staff" size={18} />{" "}
                      {String(task.assignedTo)}
                    </span>
                  )}
                </div>
                {isInspection ? (
                  <div className="service-actions">
                    <button
                      className="secondary-button"
                      disabled={pending.has(String(task.id))}
                      onClick={() => void submitNoDamage(task)}
                    >
                      <Check size={14} /> No damage
                    </button>
                    <button
                      className="primary-button"
                      disabled={pending.has(String(task.id))}
                      onClick={() => setDamageTask(task)}
                    >
                      <AlertTriangle size={14} /> Damage found
                    </button>
                  </div>
                ) : (
                  <div className="service-actions">
                    <button
                      className="primary-button"
                      disabled={pending.has(String(task.id))}
                      onClick={() =>
                        void recordOutcome(
                          task,
                          "DONE",
                          `Room ${task.roomNumber} marked done.`,
                        )
                      }
                    >
                      <Check size={14} /> Done
                    </button>
                    {!isCheckoutCleaning && (
                      <button
                        className="secondary-button"
                        disabled={pending.has(String(task.id))}
                        onClick={() =>
                          void recordOutcome(
                            task,
                            "GUEST_REFUSED",
                            `Guest refusal recorded for room ${task.roomNumber}.`,
                          )
                        }
                      >
                        Guest refused
                      </button>
                    )}
                    <button
                      className="secondary-button"
                      disabled={pending.has(String(task.id))}
                      onClick={() => setDeferTask(task)}
                    >
                      <Clock3 size={14} /> Come later
                    </button>
                  </div>
                )}
              </article>
            );
          })}
        </section>
      ) : (
        <div className="empty-state glass-card service-empty">
          <AppGlyph name="housekeeping" size={44} />
          <strong>All assigned rooms are complete</strong>
          <p>
            New service and checkout inspection tasks will appear automatically.
          </p>
        </div>
      )}
      {deferTask && (
        <ComeLaterModal
          task={deferTask}
          onClose={() => setDeferTask(null)}
          onSave={async (deferredUntil) => {
            setDeferTask(null);
            await optimisticCommand(
              deferTask,
              {
                action: "RECORD_HOUSEKEEPING_OUTCOME",
                taskId: deferTask.id,
                expectedVersion: deferTask.version,
                outcome: "COME_LATER",
                deferredUntil,
                surface,
              },
              `Return visit scheduled for room ${deferTask.roomNumber}.`,
              false,
            );
          }}
        />
      )}
      {damageTask && (
        <DamageInspectionModal
          task={damageTask}
          onClose={() => setDamageTask(null)}
          onSave={async (form) => {
            setDamageTask(null);
            await optimisticCommand(
              damageTask,
              {
                action: "SUBMIT_ROOM_INSPECTION",
                taskId: damageTask.id,
                expectedVersion: damageTask.version,
                result: "DAMAGE_FOUND",
                surface,
                ...form,
              },
              `Damage report submitted for room ${damageTask.roomNumber}.`,
            );
          }}
        />
      )}
    </>
  );
}

function HousekeepingView(props: PlatformViewProps) {
  return <HousekeepingOverviewView {...props} />;
}

function ComeLaterModal({
  task,
  onClose,
  onSave,
}: {
  task: Row;
  onClose: () => void;
  onSave: (deferredUntil: string) => Promise<void>;
}) {
  const [value, setValue] = useState(() =>
    localDateTimeInputValue(new Date(Date.now() + 60 * 60 * 1000)),
  );
  const [busy, setBusy] = useState(false);
  return (
    <div
      className="modal-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <form
        className="modal-card compact-modal"
        onSubmit={async (event) => {
          event.preventDefault();
          setBusy(true);
          try {
            await onSave(new Date(value).toISOString());
          } finally {
            setBusy(false);
          }
        }}
      >
        <div className="modal-heading">
          <div>
            <p className="section-kicker">Room {String(task.roomNumber)}</p>
            <h2>Schedule a return visit</h2>
            <p>Choose when housekeeping should come back.</p>
          </div>
          <button type="button" className="icon-button" onClick={onClose}>
            <X size={17} />
          </button>
        </div>
        <div className="form-grid">
          <label className="wide">
            <span>Return date and time</span>
            <input
              required
              type="datetime-local"
              value={value}
              onChange={(event) => setValue(event.target.value)}
            />
          </label>
        </div>
        <div className="modal-actions">
          <button type="button" className="secondary-button" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="primary-button" disabled={busy}>
            {busy ? "Saving…" : "Schedule return"}
          </button>
        </div>
      </form>
    </div>
  );
}

function DamageInspectionModal({
  task,
  onClose,
  onSave,
}: {
  task: Row;
  onClose: () => void;
  onSave: (form: Row) => Promise<void>;
}) {
  const [description, setDescription] = useState("");
  const [severity, setSeverity] = useState<DamageSeverity>("LOW");
  const [busy, setBusy] = useState(false);
  return (
    <div
      className="modal-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <form
        className="modal-card compact-modal"
        onSubmit={async (event) => {
          event.preventDefault();
          setBusy(true);
          try {
            await onSave({ description, severity });
          } finally {
            setBusy(false);
          }
        }}
      >
        <div className="modal-heading">
          <div>
            <p className="section-kicker">
              Room {String(task.roomNumber)} inspection
            </p>
            <h2>Record room damage</h2>
            <p>
              The property manager will review the report and decide whether a
              guest charge is required.
            </p>
          </div>
          <button type="button" className="icon-button" onClick={onClose}>
            <X size={17} />
          </button>
        </div>
        <div className="condition-only-note">
          <AppGlyph name="damage-alert" size={26} />
          <span>
            <strong>Condition report only</strong>
            <small>
              Housekeeping records the damage and severity. Guest liability is
              calculated from the hotel&apos;s active policy.
            </small>
          </span>
        </div>
        <div className="form-grid">
          <label className="wide">
            <span>Damage and repair notes</span>
            <textarea
              required
              minLength={5}
              maxLength={1000}
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              placeholder="Describe the damaged item, condition and repair likely needed"
            />
          </label>
          <label className="wide">
            <span>Severity</span>
            <select
              value={severity}
              onChange={(event) =>
                setSeverity(event.target.value as DamageSeverity)
              }
            >
              <option value="LOW">Low · cosmetic or minor repair</option>
              <option value="MEDIUM">
                Medium · repair and maintenance review required
              </option>
              <option value="HIGH">
                High · urgent; room may be unavailable
              </option>
            </select>
          </label>
        </div>
        <div className="modal-actions">
          <button type="button" className="secondary-button" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="primary-button" disabled={busy}>
            {busy ? "Submitting…" : "Submit inspection"}
          </button>
        </div>
      </form>
    </div>
  );
}

export function DamageReviewPanel({
  reports,
  surface,
  command,
  refresh,
  notify,
}: {
  reports: Row[];
  surface: Surface;
  command: (payload: Record<string, unknown>) => Promise<Row>;
  refresh: () => Promise<void>;
  notify: (message: string) => void;
}) {
  const [charging, setCharging] = useState<Row | null>(null);
  const [busyId, setBusyId] = useState("");
  const pendingReports = reports.filter(
    (report) => report.status === "PENDING_REVIEW",
  );
  if (!pendingReports.length) return null;
  async function resolve(
    report: Row,
    decision: "POST_CHARGE" | "WAIVE",
    details: { repairCostPaise?: number; decisionNote?: string } = {},
  ) {
    setBusyId(String(report.id));
    try {
      await command({
        action: "RESOLVE_DAMAGE_REPORT",
        reportId: report.id,
        expectedVersion: report.version,
        decision,
        surface,
        ...details,
      });
      setCharging(null);
      await refresh();
      notify(
        decision === "POST_CHARGE"
          ? `Damage charge posted for room ${report.roomNumber}.`
          : `Damage report for room ${report.roomNumber} closed without charge.`,
      );
    } catch (cause) {
      notify(
        cause instanceof Error
          ? cause.message
          : "Damage report could not be reviewed.",
      );
    } finally {
      setBusyId("");
    }
  }
  return (
    <section className="damage-review-section">
      <div className="subsection-heading">
        <div>
          <p className="section-kicker">Post-checkout inspection</p>
          <h2>Damage review</h2>
        </div>
        <span>{pendingReports.length} awaiting decision</span>
      </div>
      <div className="damage-review-grid">
        {pendingReports.map((report) => (
          <article key={String(report.id)}>
            <div>
              <span className="record-icon">
                <AppGlyph name="damage-alert" size={26} />
              </span>
              <div>
                <small>
                  {String(report.bookingReference)} · Room{" "}
                  {String(report.roomNumber)}
                </small>
                <h3>{String(report.description)}</h3>
              </div>
              <Status value={String(report.severity)} />
            </div>
            <p>
              Reported by {String(report.reportedBy)} ·{" "}
              {dateTime(report.reportedAt)}
            </p>
            <div className="damage-policy-inline">
              <span>{String(report.policyLabel ?? "Hotel damage policy")}</span>
              <strong>
                Liability up to {money(report.policyLiabilityPaise)}
              </strong>
            </div>
            <div className="service-actions">
              <button
                className="secondary-button"
                disabled={busyId === String(report.id)}
                onClick={() =>
                  void resolve(report, "WAIVE", {
                    decisionNote: "No guest charge after manager review.",
                  })
                }
              >
                No guest charge
              </button>
              <button
                className="primary-button"
                disabled={busyId === String(report.id)}
                onClick={() => setCharging(report)}
              >
                <IndianRupee size={14} /> Review policy charge
              </button>
            </div>
          </article>
        ))}
      </div>
      {charging && (
        <DamageChargeModal
          report={charging}
          onClose={() => setCharging(null)}
          onSave={(details) => resolve(charging, "POST_CHARGE", details)}
        />
      )}
    </section>
  );
}

export function DamageChargeModal({
  report,
  onClose,
  onSave,
}: {
  report: Row | ReservationInspectionSummary;
  onClose: () => void;
  onSave: (details: {
    repairCostPaise: number;
    decisionNote: string;
  }) => Promise<void>;
}) {
  const policyLiabilityPaise = Number(report.policyLiabilityPaise ?? 0);
  const [repairCost, setRepairCost] = useState(() =>
    Math.max(1, Math.round(policyLiabilityPaise / 100)),
  );
  const [decisionNote, setDecisionNote] = useState(
    "Repair estimate reviewed against hotel policy.",
  );
  const [busy, setBusy] = useState(false);
  const repairCostPaise = Math.round(repairCost * 100);
  const chargePreviewPaise = Math.min(repairCostPaise, policyLiabilityPaise);
  const description =
    "damageDescription" in report
      ? report.damageDescription
      : "description" in report
        ? report.description
        : null;
  return (
    <div
      className="modal-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <form
        className="modal-card compact-modal"
        onSubmit={async (event) => {
          event.preventDefault();
          setBusy(true);
          try {
            await onSave({ repairCostPaise, decisionNote });
          } finally {
            setBusy(false);
          }
        }}
      >
        <div className="modal-heading">
          <div>
            <p className="section-kicker">
              {String(report.bookingReference)} · Room{" "}
              {String(report.roomNumber)}
            </p>
            <h2>Review the policy-based charge</h2>
            <p>
              {String(description ?? "Room damage recorded after checkout.")}
            </p>
          </div>
          <button type="button" className="icon-button" onClick={onClose}>
            <X size={17} />
          </button>
        </div>
        <div className="policy-charge-summary">
          <AppGlyph name="policy" size={34} />
          <span>
            <small>{String(report.policyLabel ?? "Hotel damage policy")}</small>
            <strong>Liability limit {money(policyLiabilityPaise)}</strong>
            <em>{String(report.severity ?? "Damage")} severity</em>
          </span>
        </div>
        <div className="form-grid">
          <label className="wide">
            <span>Documented repair cost (₹)</span>
            <input
              required
              type="number"
              min="1"
              max="1000000"
              step="1"
              value={repairCost}
              onChange={(event) => setRepairCost(Number(event.target.value))}
            />
            <small>
              The server will cap the guest charge at the policy liability
              limit.
            </small>
          </label>
          <label className="wide">
            <span>Manager review note</span>
            <textarea
              required
              minLength={5}
              maxLength={500}
              value={decisionNote}
              onChange={(event) => setDecisionNote(event.target.value)}
            />
          </label>
        </div>
        <div className="charge-preview">
          <span>
            <small>Repair estimate</small>
            <strong>{money(repairCostPaise)}</strong>
          </span>
          <AppGlyph name="charge-receipt" size={28} />
          <span>
            <small>Guest charge</small>
            <strong>{money(chargePreviewPaise)}</strong>
          </span>
        </div>
        <div className="modal-actions">
          <button type="button" className="secondary-button" onClick={onClose}>
            Cancel
          </button>
          <button
            type="submit"
            className="primary-button"
            disabled={busy || policyLiabilityPaise <= 0}
          >
            {busy ? "Posting…" : "Post policy charge"}
          </button>
        </div>
      </form>
    </div>
  );
}

function InventoryView({
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
                <td>{money(item.unitCostPaise)}</td>
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
    unitCostRupees: Number(item?.unitCostPaise ?? 0) / 100,
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
        unitCostPaise: Math.round(form.unitCostRupees * 100),
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
