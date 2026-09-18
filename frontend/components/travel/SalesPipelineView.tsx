"use client";
/* eslint-disable @typescript-eslint/no-unused-vars */
import { useMemo, useState } from "react";
import { DataGrid, Empty, Heading, StatCards, Status, money, shortDate, today, type ExtraFeatureProps, type FeatureState, type Row } from "@/components/shared/feature-ui";
import type { PlatformViewProps } from "@/app/hotel-platform";
export function SalesPipelineView(props: ExtraFeatureProps) {
  const { state } = props;
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
                      <b>{money(item.estimatedValueRupees)}</b>
                    </div>
                  </article>
                ))}
            </section>
          ))}
        </div>
      </>
    );
}
