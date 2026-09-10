ALTER TABLE "app_users" ADD COLUMN IF NOT EXISTS "display_name" text;
ALTER TABLE "app_users" ADD COLUMN IF NOT EXISTS "google_avatar_url" text;
ALTER TABLE "app_users" ADD COLUMN IF NOT EXISTS "custom_avatar_key" text;

CREATE TABLE IF NOT EXISTS "user_auth_identities" (
  "id" text PRIMARY KEY NOT NULL,
  "user_id" text REFERENCES "app_users"("id") ON DELETE CASCADE,
  "provider" text NOT NULL,
  "provider_subject" text NOT NULL,
  "email" text NOT NULL,
  "email_verified" boolean DEFAULT false NOT NULL,
  "display_name" text,
  "avatar_url" text,
  "status" text DEFAULT 'PENDING' NOT NULL,
  "created_at" timestamp with time zone NOT NULL,
  "updated_at" timestamp with time zone NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS "idx_user_auth_identity_provider_subject" ON "user_auth_identities" ("provider", "provider_subject");
CREATE INDEX IF NOT EXISTS "idx_user_auth_identity_email" ON "user_auth_identities" ("email");
