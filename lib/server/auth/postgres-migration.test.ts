import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const migration = readFileSync('drizzle-postgres/0000_production_foundation.sql', 'utf8');
const reservationMigration = readFileSync('drizzle-postgres/0001_reservation_lifecycle.sql', 'utf8');

describe('PostgreSQL production schema', () => {
  it('creates the organisation, property and application-user context tables', () => {
    expect(migration).toContain('CREATE TABLE "organisations"');
    expect(migration).toContain('CREATE TABLE "properties"');
    expect(migration).toContain('CREATE TABLE "app_users"');
  });

  it('stores active flags as PostgreSQL booleans', () => {
    expect(migration).toMatch(/"active" boolean DEFAULT true NOT NULL/);
    expect(migration).not.toContain('integer DEFAULT true');
  });

  it('enforces one application user per trusted provider identity', () => {
    expect(migration).toContain('CREATE UNIQUE INDEX "idx_users_auth_identity"');
    expect(migration).toContain('"auth_provider","auth_subject"');
  });

  it('keeps tenant foreign keys and property indexes', () => {
    expect(migration).toContain('FOREIGN KEY ("organisation_id") REFERENCES "public"."organisations"("id")');
    expect(migration).toContain('CREATE UNIQUE INDEX "idx_properties_org_code"');
  });
});

describe('PostgreSQL reservation migration', () => {
  it('adds scoped lifecycle, rate and actor fields without rewriting the baseline', () => {
    expect(reservationMigration).toContain('CREATE TABLE "reservation_events"');
    expect(reservationMigration).toContain('CREATE TABLE "reservation_sequences"');
    expect(reservationMigration).toContain('ADD COLUMN "organisation_id" text NOT NULL');
    expect(reservationMigration).toContain('ADD COLUMN "nightly_rate_paise" integer');
    expect(reservationMigration).toContain('ADD COLUMN "created_by" text NOT NULL');
  });

  it('uses timezone-aware audit and hold timestamps plus JSON event metadata', () => {
    expect(reservationMigration).toContain('"created_at" timestamp with time zone NOT NULL');
    expect(reservationMigration).toContain('ADD COLUMN "hold_until" timestamp with time zone');
    expect(reservationMigration).toContain('"metadata" jsonb');
  });
});
