"use client";
/* eslint-disable @typescript-eslint/no-unused-vars */
import { useMemo, useState } from "react";
import { DataGrid, Empty, Heading, StatCards, Status, money, shortDate, today, type ExtraFeatureProps, type FeatureState, type Row } from "@/components/shared/feature-ui";
import type { PlatformViewProps } from "@/app/hotel-platform";
export function UsersPermissionsView(props: ExtraFeatureProps) {
  const { notify } = props;
    const users = [
      ["Parth Babulkar", "owner@demo.hospitalityos.brainadz.com", "OWNER"],
      ["Arjun Khanna", "manager@demo.hospitalityos.brainadz.com", "MANAGER"],
      [
        "Priya Deshmukh",
        "reception@demo.hospitalityos.brainadz.com",
        "RECEPTION",
      ],
      [
        "Neha Kulkarni",
        "travel@demo.hospitalityos.brainadz.com",
        "TRAVEL_AGENT",
      ],
      ["Aditi Mehta", "accounts@demo.hospitalityos.brainadz.com", "ACCOUNTS"],
    ];

    return (
      <>
        <Heading
          title="Users & permissions"
          description="Role assignments and access scope for hotel, travel, accounts and operations."
        />
        <article className="glass-card">
          <DataGrid
            headers={["User", "Email", "Role", "Status", "Access"]}
            rows={users.map((user) => [
              <strong key="name">{user[0]}</strong>,
              user[1],
              user[2].replaceAll("_", " "),
              <Status key="status" value="ACTIVE" />,
              <button
                className="text-button"
                key="access"
                onClick={() => notify(`${user[2]} permission matrix selected.`)}
              >
                View permissions
              </button>,
            ])}
          />
        </article>
      </>
    );
}
