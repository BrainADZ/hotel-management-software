"use client";
/* eslint-disable @typescript-eslint/no-unused-vars */
import { Check, Download, Pencil, Plus, Printer, X } from "lucide-react";
import { useState, type FormEvent } from "react";
import type { AppRole } from "@hotel/shared/domain";
import { apiFetch } from "@/lib/api/client";
import { AppGlyph, PageHeading, SandboxBadge, Status, dateTime, downloadBlob, money, type PlatformViewProps, type AppGlyphName, type Row } from "@/app/hotel-platform";
export function IntegrationsView({ state, refresh, notify }: PlatformViewProps) {
  const integrations: Array<{
    key: string;
    name: string;
    detail: string;
    glyph: AppGlyphName;
  }> = [
    {
      key: "payment",
      name: "Payment gateway",
      detail: "Initiated · pending · successful · failed · refunded",
      glyph: "payment",
    },
    {
      key: "whatsapp",
      name: "WhatsApp Business",
      detail: "Template and delivery log adapter",
      glyph: "phone-chat",
    },
    {
      key: "email",
      name: "Transactional email",
      detail: "Template and delivery log adapter",
      glyph: "email",
    },
    {
      key: "channelManager",
      name: "Channel manager",
      detail: "Rates, availability, inventory and reservations",
      glyph: "channel-sync",
    },
    {
      key: "godrej",
      name: "Godrej locks / room status",
      detail: "Capability-driven simulator only",
      glyph: "smart-lock",
    },
  ];
  async function ota() {
    try {
      const response = await apiFetch("/api/bookings/inbound", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-demo-provider": "channel-manager-sandbox",
        },
        body: JSON.stringify({
          providerReference: `OTA-DEMO-${Date.now()}`,
          source: "OTA",
          guestName: "Rohit Sharma",
          email: "rohit.sharma@example.in",
          phone: "+91 98100 44556",
          city: "Pune",
          arrivalDate: "2026-08-27",
          departureDate: "2026-08-29",
          roomType: "Deluxe",
        }),
      });
      const body = (await response.json()) as {
        result?: Row;
        error?: { message?: string };
      };
      if (!response.ok)
        throw new Error(
          body.error?.message ?? "Provider booking was rejected.",
        );
      await refresh();
      notify(
        `${body.result?.reference ?? "OTA booking"} arrived through the live provider intake and is now reflected everywhere.`,
      );
    } catch (cause) {
      notify(cause instanceof Error ? cause.message : "OTA simulation failed.");
    }
  }
  return (
    <>
      <PageHeading
        eyebrow="Administration / Integrations"
        title="Provider adapters"
        description="Production interfaces with clearly identified sandbox providers until client credentials and API documentation arrive."
        actions={
          <button className="primary-button" onClick={ota}>
            <AppGlyph name="travel" size={22} /> Simulate OTA booking
          </button>
        }
      />
      <div className="integration-grid">
        {integrations.map((item) => (
          <article className="glass-card integration-card" key={item.key}>
            <span className="integration-icon">
              <AppGlyph name={item.glyph} size={30} />
            </span>
            <div>
              <h3>{item.name}</h3>
              <p>{item.detail}</p>
            </div>
            <SandboxBadge value={state.sandbox[item.key]} />
          </article>
        ))}
      </div>
    </>
  );
}
