"use client";
/* eslint-disable @typescript-eslint/no-unused-vars */
import { Check, Download, Pencil, Plus, Printer, X } from "lucide-react";
import { useState, type FormEvent } from "react";
import type { AppRole } from "@hotel/shared/domain";
import { apiFetch } from "@/lib/api/client";
import { AppGlyph, PageHeading, SandboxBadge, Status, dateTime, downloadBlob, money, type PlatformViewProps, type AppGlyphName, type Row } from "@/app/hotel-platform";
export function TravelAuditLogsView({ state }: PlatformViewProps) {
  return (
    <>
      <PageHeading
        eyebrow="Administration"
        title="Audit log"
        description="Date, time, user and exact before/after values for every material update."
      />
      <div className="table-card">
        <table>
          <thead>
            <tr>
              <th>Time</th>
              <th>Actor</th>
              <th>Action</th>
              <th>Entity</th>
              <th>Changes</th>
              <th>Source</th>
              <th>Correlation</th>
            </tr>
          </thead>
          <tbody>
            {state.audit.map((entry) => (
              <tr key={String(entry.id)}>
                <td title={String(entry.timestamp)}>
                  {dateTime(entry.timestamp)}
                </td>
                <td>
                  <strong>{String(entry.actorName)}</strong>
                  <small>{String(entry.role)}</small>
                </td>
                <td>{String(entry.action).replaceAll("_", " ")}</td>
                <td>
                  {String(entry.entity)} · {String(entry.entityId).slice(0, 16)}
                </td>
                <td>
                  <AuditChanges entry={entry} />
                </td>
                <td>
                  <Status value={String(entry.source)} />
                </td>
                <td>
                  <code>{String(entry.correlationId).slice(0, 12)}</code>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

function AuditChanges({ entry }: { entry: Row }) {
  const previous = parseAuditObject(entry.previousValue);
  const next = parseAuditObject(entry.newValue);
  const keys = [
    ...new Set([...Object.keys(previous), ...Object.keys(next)]),
  ].filter(
    (key) => JSON.stringify(previous[key]) !== JSON.stringify(next[key]),
  );
  if (!keys.length) return <span className="audit-no-change">Recorded</span>;
  return (
    <span className="audit-change-list">
      {keys.slice(0, 3).map((key) => (
        <small key={key}>
          <b>{key.replace(/([A-Z])/g, " $1")}</b>:{" "}
          {formatAuditValue(previous[key])} → {formatAuditValue(next[key])}
        </small>
      ))}
      {keys.length > 3 && <em>+{keys.length - 3} more</em>}
    </span>
  );
}

function parseAuditObject(value: unknown): Record<string, unknown> {
  try {
    return value ? (JSON.parse(String(value)) as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

function formatAuditValue(value: unknown) {
  if (value == null || value === "") return "Not available";
  if (typeof value === "object") return "details";
  const text = String(value);
  return text.length > 28 ? `${text.slice(0, 27)}…` : text;
}
