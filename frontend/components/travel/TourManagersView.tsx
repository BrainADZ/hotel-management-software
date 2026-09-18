"use client";
/* eslint-disable @typescript-eslint/no-unused-vars */
import { useMemo, useState } from "react";
import { DataGrid, Empty, Heading, StatCards, Status, money, shortDate, today, type ExtraFeatureProps, type FeatureState, type Row } from "@/components/shared/feature-ui";
import type { PlatformViewProps } from "@/app/hotel-platform";
export function TourManagersView(props: ExtraFeatureProps) {
  const managers = ["Rohan Verma", "Kavita Rao", "Imran Sheikh"];
  return (
    <>
      <Heading
        title="Tour managers"
        description="Guide availability, languages, experience and assigned departures."
      />
      <section className="record-grid">
        {managers.map((name, index) => (
          <article className="operation-card" key={name}>
            <span className="severity low">ACTIVE</span>
            <h3>{name}</h3>
            <p>
              {
                [
                  "Hindi, English, Marathi",
                  "Hindi, English, Gujarati",
                  "Hindi, English, Urdu",
                ][index]
              }
            </p>
            <div>
              <small>{12 + index * 7} tours led</small>
              <b>{(4.7 + index / 10).toFixed(1)} / 5</b>
            </div>
          </article>
        ))}
      </section>
    </>
  );
}
