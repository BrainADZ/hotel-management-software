"use client";
/* eslint-disable @typescript-eslint/no-unused-vars */
import { AlertTriangle, Check, Clock3, IndianRupee, Pencil, Plus, X } from "lucide-react";
import { useState, type FormEvent } from "react";
import type { AppRole } from "@hotel/shared/domain";
import { assignmentLabel, assignmentState, canManageHousekeepingAssignment, eligibleHousekeepingStaff, submitHousekeepingAssignment } from "@/lib/housekeeping-assignment";
import { CreateHousekeepingTask } from './OperationalWorkspace';
import { AppGlyph, Metric, PageHeading, Status, dateTime, localDateTimeInputValue, money, type DamageSeverity, type PlatformViewProps, type ReservationInspectionSummary, type Row, type Surface } from "@/app/hotel-platform";
export function HousekeepingOverviewView(props: PlatformViewProps) {
 const {
  state,
  surface,
  command,
  refresh,
  updateState,
  notify,
  propertyRestricted,
 } = props;
  const [pending, setPending] = useState<Set<string>>(new Set());
  const [deferTask, setDeferTask] = useState<Row | null>(null);
  const [damageTask, setDamageTask] = useState<Row | null>(null);
  const [assignmentTask, setAssignmentTask] = useState<Row | null>(null);
  const canAssign = canManageHousekeepingAssignment(state.actor.role, propertyRestricted);
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
        <CreateHousekeepingTask {...props}/>
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
                  <span>
                    <AppGlyph name="staff" size={18} />{" "}
                    {assignmentState(task)}
                  </span>
                </div>
                {canAssign && (
                  <button className="secondary-button" onClick={() => setAssignmentTask(task)} disabled={pending.has(String(task.id))}>
                    <Pencil size={14} /> {assignmentLabel(task)}
                  </button>
                )}
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
      {assignmentTask && (
        <HousekeepingAssignmentModal
          task={assignmentTask}
          staff={eligibleHousekeepingStaff(state.housekeepingStaff)}
          onClose={() => setAssignmentTask(null)}
          onSave={async (assigneeId) => {
            const saved = await submitHousekeepingAssignment({ task: assignmentTask, assigneeId, surface, command, refresh, notify });
            if (saved) setAssignmentTask(null);
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

export function HousekeepingAssignmentModal({ task, staff, onClose, onSave }: { task: Row; staff: Row[]; onClose: () => void; onSave: (assigneeId: string) => Promise<void> }) {
  const [assigneeId, setAssigneeId] = useState(String(task.assignedUserId ?? ""));
  const [busy, setBusy] = useState(false);
  return <div className="modal-backdrop" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }}>
    <form className="modal-card compact-modal" onSubmit={async event => { event.preventDefault(); if (!assigneeId) return; setBusy(true); try { await onSave(assigneeId); } finally { setBusy(false); } }}>
      <div className="modal-heading"><div><p className="section-kicker">Room {String(task.roomNumber)}</p><h2>{task.assignedUserId ? "Reassign housekeeping" : "Assign housekeeping"}</h2><p>{String(task.taskType).replaceAll("_", " ")} · {String(task.priority)}</p></div><button type="button" className="icon-button" onClick={onClose}><X size={17} /></button></div>
      {staff.length ? <div className="form-grid"><label className="wide"><span>Housekeeper</span><select required value={assigneeId} onChange={event => setAssigneeId(event.target.value)}><option value="">Select housekeeper</option>{staff.map(person => <option key={String(person.id)} value={String(person.id)}>{String(person.name)}</option>)}</select></label></div> : <div className="empty-state small"><AppGlyph name="staff" size={38} /><strong>No active housekeeping staff are available for this property.</strong></div>}
      <div className="modal-actions"><button type="button" className="secondary-button" onClick={onClose}>Cancel</button><button type="submit" className="primary-button" disabled={busy || !assigneeId || !staff.length}>{busy ? "Assigning…" : "Assign Room"}</button></div>
    </form>
  </div>;
}

export function HousekeepingView(props: PlatformViewProps) {
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
