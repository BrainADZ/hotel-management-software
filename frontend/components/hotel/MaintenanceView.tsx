"use client";

import {
  AlertTriangle,
  Check,
  Clock3,
  Pencil,
  Play,
  Plus,
  Wrench,
  X,
} from "lucide-react";
import { useMemo, useState, type FormEvent } from "react";

import {
  AppGlyph,
  Metric,
  PageHeading,
  Status,
  dateTime,
  type PlatformViewProps,
  type Row,
} from "@/app/hotel-platform";

type MaintenanceSeverity = "LOW" | "MEDIUM" | "HIGH";

type TicketEditor = {
  mode: "CREATE" | "EDIT";
  ticket: Row | null;
  roomId: string;
  issue: string;
  category: string;
  severity: MaintenanceSeverity;
  assignedTo: string;
  blockRoom: boolean;
};

type ResolveDialog = {
  ticket: Row;
  resolutionNote: string;
};

const categories = [
  ["HVAC", "HVAC / AC"],
  ["PLUMBING", "Plumbing"],
  ["ELECTRICAL", "Electrical"],
  ["FURNITURE", "Furniture"],
  ["ROOM_DAMAGE", "Room damage"],
  ["SAFETY", "Safety"],
  ["OTHER", "Other"],
] as const;

function humanize(value: unknown) {
  return String(value ?? "")
    .replaceAll("_", " ")
    .toLowerCase()
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

function roomLabel(state: PlatformViewProps["state"], ticket: Row) {
  const direct = String(ticket.roomNumber ?? "").trim();

  if (direct) return direct;

  const roomId = String(ticket.roomId ?? "");
  const room = state.rooms.find((item) => String(item.id) === roomId);

  return room ? String(room.number) : "General";
}

function emptyEditor(): TicketEditor {
  return {
    mode: "CREATE",
    ticket: null,
    roomId: "",
    issue: "",
    category: "OTHER",
    severity: "MEDIUM",
    assignedTo: "",
    blockRoom: false,
  };
}

export function MaintenanceView({
  state,
  role,
  surface,
  propertyRestricted,
  command,
  refresh,
  notify,
}: PlatformViewProps) {
  const [editor, setEditor] = useState<TicketEditor | null>(null);
  const [resolveDialog, setResolveDialog] = useState<ResolveDialog | null>(
    null,
  );
  const [busyId, setBusyId] = useState("");
  const [formError, setFormError] = useState("");

  const canManage = ["OWNER", "MANAGER"].includes(role);

  const summary = useMemo(() => {
    const active = state.maintenance.filter((ticket) =>
      ["OPEN", "ASSIGNED", "IN_PROGRESS"].includes(String(ticket.status)),
    );

    return {
      active: active.length,
      inProgress: active.filter(
        (ticket) => String(ticket.status) === "IN_PROGRESS",
      ).length,
      resolved: state.maintenance.filter(
        (ticket) => String(ticket.status) === "RESOLVED",
      ).length,
    };
  }, [state.maintenance]);

  function openCreate() {
    setFormError("");
    setEditor(emptyEditor());
  }

  function openEdit(ticket: Row) {
    setFormError("");
    setEditor({
      mode: "EDIT",
      ticket,
      roomId: String(ticket.roomId ?? ""),
      issue: String(ticket.issue ?? ""),
      category: String(ticket.category ?? "OTHER"),
      severity: String(ticket.severity ?? "MEDIUM") as MaintenanceSeverity,
      assignedTo: String(ticket.assignedTo ?? ""),
      blockRoom: false,
    });
  }

  async function saveTicket(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!editor) return;

    const issue = editor.issue.trim();

    if (issue.length < 5) {
      setFormError("Describe the maintenance issue in at least 5 characters.");
      return;
    }

    setBusyId(
      editor.mode === "CREATE"
        ? "CREATE"
        : String(editor.ticket?.id ?? "EDIT"),
    );
    setFormError("");

    try {
      await command({
        action:
          editor.mode === "CREATE"
            ? "CREATE_MAINTENANCE"
            : "UPDATE_MAINTENANCE",
        surface,
        ...(editor.mode === "EDIT"
          ? {
              ticketId: editor.ticket?.id,
              expectedVersion: editor.ticket?.version,
            }
          : {}),
        roomId: editor.roomId || undefined,
        issue,
        category: editor.category,
        severity: editor.severity,
        assignedTo: editor.assignedTo.trim(),
        blockRoom: editor.blockRoom,
      });

      setEditor(null);
      await refresh();
      notify(
        editor.mode === "CREATE"
          ? "Maintenance ticket created and audit logged."
          : "Maintenance ticket updated.",
      );
    } catch (cause) {
      const message =
        cause instanceof Error
          ? cause.message
          : "Maintenance ticket could not be saved.";
      setFormError(message);
      notify(message);
    } finally {
      setBusyId("");
    }
  }

  async function runAction(
    ticket: Row,
    action: "START_MAINTENANCE" | "CLOSE_MAINTENANCE",
  ) {
    const id = String(ticket.id);
    setBusyId(id);

    try {
      await command({
        action,
        ticketId: ticket.id,
        expectedVersion: ticket.version,
        surface,
      });
      await refresh();
      notify(
        action === "START_MAINTENANCE"
          ? "Maintenance work marked in progress."
          : "Maintenance ticket closed.",
      );
    } catch (cause) {
      notify(
        cause instanceof Error
          ? cause.message
          : "Maintenance status could not be updated.",
      );
    } finally {
      setBusyId("");
    }
  }

  async function resolveTicket(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!resolveDialog) return;

    const resolutionNote = resolveDialog.resolutionNote.trim();

    if (resolutionNote.length < 3) {
      setFormError("Enter a short resolution note.");
      return;
    }

    const ticket = resolveDialog.ticket;
    setBusyId(String(ticket.id));
    setFormError("");

    try {
      await command({
        action: "RESOLVE_MAINTENANCE",
        ticketId: ticket.id,
        expectedVersion: ticket.version,
        resolutionNote,
        surface,
      });
      setResolveDialog(null);
      await refresh();
      notify(
        "Maintenance resolved. Any maintenance-blocked vacant room was returned to housekeeping.",
      );
    } catch (cause) {
      const message =
        cause instanceof Error
          ? cause.message
          : "Maintenance ticket could not be resolved.";
      setFormError(message);
      notify(message);
    } finally {
      setBusyId("");
    }
  }

  return (
    <>
      <PageHeading
        eyebrow="Operations"
        title="Maintenance tickets"
        description="Report, assign, track and resolve property maintenance with PostgreSQL persistence and an auditable status trail."
        actions={
          canManage ? (
            <button
              type="button"
              className="primary-button"
              disabled={propertyRestricted}
              title={
                propertyRestricted
                  ? "Maintenance changes require an online property connection."
                  : undefined
              }
              onClick={openCreate}
            >
              <Plus size={16} /> Report maintenance
            </button>
          ) : undefined
        }
      />

      <section className="service-summary-grid">
        <Metric label="Active tickets" value={summary.active} />
        <Metric label="In progress" value={summary.inProgress} />
        <Metric label="Awaiting closure" value={summary.resolved} />
      </section>

      {state.maintenance.length ? (
        <div className="record-grid">
          {state.maintenance.map((ticket) => {
            const status = String(ticket.status ?? "OPEN");
            const ticketId = String(ticket.id);
            const busy = busyId === ticketId;
            const editable = ["OPEN", "ASSIGNED", "IN_PROGRESS"].includes(
              status,
            );
            const canStart = ["OPEN", "ASSIGNED"].includes(status);
            const canResolve = ["OPEN", "ASSIGNED", "IN_PROGRESS"].includes(
              status,
            );
            const canClose = status === "RESOLVED";

            return (
              <article className="operation-card" key={ticketId}>
                <AppGlyph
                  name="maintenance"
                  size={36}
                  className="operation-glyph"
                />

                <span
                  className={`severity ${String(
                    ticket.severity ?? "LOW",
                  ).toLowerCase()}`}
                >
                  {String(ticket.severity ?? "LOW")}
                </span>

                <h3>{String(ticket.issue)}</h3>

                <p>
                  Room {roomLabel(state, ticket)} ·{" "}
                  {humanize(ticket.category ?? "OTHER")}
                </p>

                <div>
                  <Status value={status} />
                  <small>
                    {String(ticket.assignedTo ?? "Unassigned")}
                  </small>
                </div>

                <p>
                  <Clock3 size={13} /> Opened {dateTime(ticket.openedAt)}
                </p>

                {canManage && (
                  <div className="service-actions">
                    {editable && (
                      <button
                        type="button"
                        className="secondary-button"
                        disabled={busy || propertyRestricted}
                        onClick={() => openEdit(ticket)}
                      >
                        <Pencil size={14} /> Edit / assign
                      </button>
                    )}

                    {canStart && (
                      <button
                        type="button"
                        className="secondary-button"
                        disabled={busy || propertyRestricted}
                        onClick={() =>
                          void runAction(ticket, "START_MAINTENANCE")
                        }
                      >
                        <Play size={14} /> Start work
                      </button>
                    )}

                    {canResolve && (
                      <button
                        type="button"
                        className="primary-button"
                        disabled={busy || propertyRestricted}
                        onClick={() => {
                          setFormError("");
                          setResolveDialog({
                            ticket,
                            resolutionNote:
                              "Issue repaired and room checked by maintenance.",
                          });
                        }}
                      >
                        <Check size={14} /> Resolve
                      </button>
                    )}

                    {canClose && (
                      <button
                        type="button"
                        className="primary-button"
                        disabled={busy || propertyRestricted}
                        onClick={() =>
                          void runAction(ticket, "CLOSE_MAINTENANCE")
                        }
                      >
                        <Check size={14} /> Close ticket
                      </button>
                    )}
                  </div>
                )}
              </article>
            );
          })}
        </div>
      ) : (
        <div className="empty-state">
          <AppGlyph name="maintenance" size={42} />
          <strong>No maintenance tickets</strong>
          <span>
            Report the first property or room issue when maintenance is
            required.
          </span>
        </div>
      )}

      {!canManage && (
        <p className="privacy-note">
          <AlertTriangle size={18} /> Maintenance changes are restricted to
          owners and managers.
        </p>
      )}

      {editor && (
        <div
          className="modal-backdrop"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget && !busyId) setEditor(null);
          }}
        >
          <form
            className="modal-card compact-modal"
            onSubmit={saveTicket}
          >
            <div className="modal-heading">
              <div>
                <p className="section-kicker">Maintenance operations</p>
                <h2>
                  {editor.mode === "CREATE"
                    ? "Report maintenance"
                    : "Edit maintenance ticket"}
                </h2>
                <p>
                  Track the issue, responsible technician and whether the room
                  must be blocked from sale.
                </p>
              </div>
              <button
                type="button"
                className="icon-button"
                disabled={Boolean(busyId)}
                onClick={() => setEditor(null)}
              >
                <X size={17} />
              </button>
            </div>

            <div className="form-grid">
              <label>
                <span>Room</span>
                <select
                  value={editor.roomId}
                  disabled={editor.mode === "EDIT"}
                  onChange={(event) =>
                    setEditor((current) =>
                      current
                        ? { ...current, roomId: event.target.value }
                        : current,
                    )
                  }
                >
                  <option value="">General / property issue</option>
                  {state.rooms.map((room) => (
                    <option key={String(room.id)} value={String(room.id)}>
                      Room {String(room.number)} · {String(room.roomType)}
                    </option>
                  ))}
                </select>
                {editor.mode === "EDIT" && (
                  <small>Room is locked after ticket creation.</small>
                )}
              </label>

              <label>
                <span>Category</span>
                <select
                  value={editor.category}
                  onChange={(event) =>
                    setEditor((current) =>
                      current
                        ? { ...current, category: event.target.value }
                        : current,
                    )
                  }
                >
                  {categories.map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>

              <label className="wide">
                <span>Issue</span>
                <textarea
                  required
                  minLength={5}
                  maxLength={1000}
                  value={editor.issue}
                  onChange={(event) =>
                    setEditor((current) =>
                      current
                        ? { ...current, issue: event.target.value }
                        : current,
                    )
                  }
                  placeholder="Example: AC is running but the room is not cooling."
                />
              </label>

              <label>
                <span>Severity</span>
                <select
                  value={editor.severity}
                  onChange={(event) =>
                    setEditor((current) =>
                      current
                        ? {
                            ...current,
                            severity: event.target
                              .value as MaintenanceSeverity,
                          }
                        : current,
                    )
                  }
                >
                  <option value="LOW">Low</option>
                  <option value="MEDIUM">Medium</option>
                  <option value="HIGH">High</option>
                </select>
              </label>

              <label>
                <span>Assigned technician / staff</span>
                <input
                  value={editor.assignedTo}
                  maxLength={120}
                  onChange={(event) =>
                    setEditor((current) =>
                      current
                        ? { ...current, assignedTo: event.target.value }
                        : current,
                    )
                  }
                  placeholder="Example: Electrician / Ramesh"
                />
              </label>

              {Boolean(editor.roomId) && (
                <label className="wide">
                  <span>Room availability</span>
                  <span className="control-note">
                    <input
                      type="checkbox"
                      checked={editor.blockRoom}
                      onChange={(event) =>
                        setEditor((current) =>
                          current
                            ? {
                                ...current,
                                blockRoom: event.target.checked,
                              }
                            : current,
                        )
                      }
                    />
                    <span>
                      <strong>Take room out of service for maintenance</strong>
                      <small>
                        The room will be marked MAINTENANCE. Resolving the final
                        active ticket returns a vacant room to housekeeping.
                      </small>
                    </span>
                  </span>
                </label>
              )}
            </div>

            {formError && <p className="inline-alert">{formError}</p>}

            <div className="modal-actions">
              <button
                type="button"
                className="secondary-button"
                disabled={Boolean(busyId)}
                onClick={() => setEditor(null)}
              >
                Cancel
              </button>
              <button
                type="submit"
                className="primary-button"
                disabled={Boolean(busyId)}
              >
                <Wrench size={15} />
                {busyId
                  ? "Saving…"
                  : editor.mode === "CREATE"
                    ? "Create ticket"
                    : "Save changes"}
              </button>
            </div>
          </form>
        </div>
      )}

      {resolveDialog && (
        <div
          className="modal-backdrop"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget && !busyId)
              setResolveDialog(null);
          }}
        >
          <form
            className="modal-card compact-modal"
            onSubmit={resolveTicket}
          >
            <div className="modal-heading">
              <div>
                <p className="section-kicker">
                  Room {roomLabel(state, resolveDialog.ticket)}
                </p>
                <h2>Resolve maintenance</h2>
                <p>{String(resolveDialog.ticket.issue)}</p>
              </div>
              <button
                type="button"
                className="icon-button"
                disabled={Boolean(busyId)}
                onClick={() => setResolveDialog(null)}
              >
                <X size={17} />
              </button>
            </div>

            <div className="form-grid">
              <label className="wide">
                <span>Resolution note</span>
                <textarea
                  required
                  minLength={3}
                  maxLength={1000}
                  value={resolveDialog.resolutionNote}
                  onChange={(event) =>
                    setResolveDialog((current) =>
                      current
                        ? {
                            ...current,
                            resolutionNote: event.target.value,
                          }
                        : current,
                    )
                  }
                />
                <small>
                  The resolution is written to the audit trail. If this is the
                  room&apos;s final active maintenance ticket, the room is
                  released from MAINTENANCE safely.
                </small>
              </label>
            </div>

            {formError && <p className="inline-alert">{formError}</p>}

            <div className="modal-actions">
              <button
                type="button"
                className="secondary-button"
                disabled={Boolean(busyId)}
                onClick={() => setResolveDialog(null)}
              >
                Cancel
              </button>
              <button
                type="submit"
                className="primary-button"
                disabled={Boolean(busyId)}
              >
                <Check size={15} /> {busyId ? "Resolving…" : "Resolve ticket"}
              </button>
            </div>
          </form>
        </div>
      )}
    </>
  );
}
