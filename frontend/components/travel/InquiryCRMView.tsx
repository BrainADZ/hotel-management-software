"use client";
/* eslint-disable @typescript-eslint/no-unused-vars */
import { Check, Download, Pencil, Plus, Printer, X } from "lucide-react";
import { useState, type FormEvent } from "react";
import type { AppRole } from "@hotel/shared/domain";
import { apiFetch } from "@/lib/api/client";
import { AppGlyph, PageHeading, SandboxBadge, Status, dateTime, downloadBlob, money, type PlatformViewProps, type AppGlyphName, type Row } from "@/app/hotel-platform";
export function InquiryCRMView(props: PlatformViewProps) {
  const { state } = props;
    return (
      <>
        <PageHeading
          eyebrow="Sales / Inquiry CRM"
          title="Inquiry pipeline"
          description="Source, owner, follow-up and conversion status in a live operational pipeline."
        />
        <div className="crm-pipeline">
          {["NEW", "FOLLOW_UP", "NEGOTIATION", "CONVERTED"].map((stage) => (
            <section key={stage}>
              <h3>{stage.replace("_", " ")}</h3>
              {state.inquiries
                .filter((inquiry) => inquiry.status === stage)
                .map((inquiry) => (
                  <article key={String(inquiry.id)}>
                    <span>{String(inquiry.reference)}</span>
                    <strong>{String(inquiry.customerName)}</strong>
                    <p>{String(inquiry.service)}</p>
                    <div>
                      <small>
                        {String(inquiry.source)} · {String(inquiry.owner)}
                      </small>
                      <b>{money(inquiry.estimatedValuePaise)}</b>
                    </div>
                    <em>Follow-up {dateTime(inquiry.followUpAt)}</em>
                  </article>
                ))}
            </section>
          ))}
        </div>
      </>
    );
  const pendingRequests = state.discountRequests.filter(
    (request) => request.status === "PENDING",
  );
}
