ALTER TABLE "inquiries" ADD COLUMN IF NOT EXISTS "notes" text;
ALTER TABLE "inquiries" ADD COLUMN IF NOT EXISTS "updated_by" text;
ALTER TABLE "inquiries" ADD COLUMN IF NOT EXISTS "updated_at" text;

CREATE TABLE IF NOT EXISTS "travel_follow_ups" (
  "id" text PRIMARY KEY NOT NULL,
  "organisation_id" text NOT NULL REFERENCES "organisations"("id"),
  "inquiry_id" text NOT NULL REFERENCES "inquiries"("id"),
  "channel" text NOT NULL,
  "due_at" text NOT NULL,
  "status" text DEFAULT 'PENDING' NOT NULL,
  "notes" text,
  "assigned_to_id" text,
  "assigned_to_name" text NOT NULL,
  "created_by_id" text NOT NULL,
  "completed_by_id" text,
  "completed_at" text,
  "created_at" text NOT NULL,
  "updated_at" text NOT NULL,
  "version" integer DEFAULT 1 NOT NULL
);
CREATE INDEX IF NOT EXISTS "idx_travel_followups_org_status_due" ON "travel_follow_ups" ("organisation_id", "status", "due_at");
CREATE INDEX IF NOT EXISTS "idx_travel_followups_inquiry" ON "travel_follow_ups" ("inquiry_id");
