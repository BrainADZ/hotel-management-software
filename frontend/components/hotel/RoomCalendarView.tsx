"use client";
/* eslint-disable @typescript-eslint/no-unused-vars */
import { useMemo, useState } from "react";
import { DataGrid, Empty, Heading, StatCards, Status, money, shortDate, today, type ExtraFeatureProps, type FeatureState, type Row } from "@/components/shared/feature-ui";
import type { PlatformViewProps } from "@/app/hotel-platform";
export function RoomCalendarView({ state }: { state: FeatureState }) {
  const [start, setStart] = useState(today());
  const dates = useMemo(
    () =>
      Array.from({ length: 7 }, (_, index) => {
        const date = new Date(`${start}T00:00:00Z`);
        date.setUTCDate(date.getUTCDate() + index);
        return date.toISOString().slice(0, 10);
      }),
    [start],
  );
  return (
    <>
      <Heading
        title="Room calendar"
        description="Seven-day room availability using the primary reservation and room records."
        actions={
          <input
            className="extra-input"
            type="date"
            value={start}
            onChange={(event) => setStart(event.target.value)}
          />
        }
      />
      <article className="glass-card extra-calendar">
        <div className="calendar-row calendar-head">
          <span>Room</span>
          {dates.map((date) => (
            <span key={date}>{shortDate(date).slice(0, 6)}</span>
          ))}
        </div>
        {state.rooms.map((room) => (
          <div className="calendar-row" key={String(room.id)}>
            <strong>
              {String(room.number)}
              <small>{String(room.roomType)}</small>
            </strong>
            {dates.map((date) => {
              const booking = state.reservations.find(
                (item) =>
                  item.roomId === room.id &&
                  String(item.arrivalDate) <= date &&
                  String(item.departureDate) > date &&
                  item.status !== "CANCELLED",
              );
              return (
                <span
                  className={
                    booking
                      ? "booked"
                      : String(room.operationalStatus) !== "CLEAN"
                        ? "blocked"
                        : "available"
                  }
                  key={date}
                >
                  {booking
                    ? String(booking.guestName).split(" ")[0]
                    : String(room.operationalStatus) === "CLEAN"
                      ? "Available"
                      : String(room.operationalStatus)}
                </span>
              );
            })}
          </div>
        ))}
      </article>
    </>
  );
}
