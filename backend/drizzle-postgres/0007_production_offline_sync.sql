CREATE TABLE IF NOT EXISTS "offline_sync_mutations" (
  "id" text PRIMARY KEY NOT NULL,
  "organisation_id" text NOT NULL REFERENCES "organisations"("id"),
  "property_id" text NOT NULL REFERENCES "properties"("id"),
  "user_id" text NOT NULL REFERENCES "app_users"("id"),
  "client_mutation_id" text NOT NULL,
  "command" text NOT NULL,
  "entity_type" text NOT NULL,
  "entity_id" text,
  "payload_hash" text NOT NULL,
  "status" text NOT NULL,
  "result_json" text,
  "error_json" text,
  "created_at" text NOT NULL,
  "completed_at" text
);
CREATE UNIQUE INDEX IF NOT EXISTS "idx_offline_sync_org_client_mutation" ON "offline_sync_mutations" ("organisation_id", "client_mutation_id");
CREATE INDEX IF NOT EXISTS "idx_offline_sync_property_status" ON "offline_sync_mutations" ("property_id", "status", "created_at");
