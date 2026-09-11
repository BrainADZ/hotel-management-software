"use client";
/* eslint-disable @typescript-eslint/no-unused-vars */
import { AlertTriangle, Check, Clock3, IndianRupee, Pencil, Plus, X } from "lucide-react";
import { useState, type FormEvent } from "react";
import type { AppRole } from "@hotel/shared/domain";
import { AppGlyph, Metric, PageHeading, Status, dateTime, localDateTimeInputValue, money, type DamageSeverity, type PlatformViewProps, type ReservationInspectionSummary, type Row, type Surface } from "@/app/hotel-platform";
export function MaintenanceView({ state }: PlatformViewProps) {
  return (
    <>
      <PageHeading eyebrow="Operations" title="Maintenance tickets" description="Operational issues can remove rooms from service with an auditable status trail." />
      <div className="record-grid">
        {state.maintenance.map((ticket) => (
          <article className="operation-card" key={String(ticket.id)}>
            <AppGlyph name="maintenance" size={36} className="operation-glyph" />
            <span className={`severity ${String(ticket.severity).toLowerCase()}`}>{String(ticket.severity)}</span>
            <h3>{String(ticket.issue)}</h3><p>{String(ticket.id)} · Room {String(ticket.roomNumber ?? "General")}</p>
            <div><Status value={String(ticket.status)} /><small>{String(ticket.assignedTo ?? "Unassigned")}</small></div>
          </article>
        ))}
      </div>
    </>
  );
}
