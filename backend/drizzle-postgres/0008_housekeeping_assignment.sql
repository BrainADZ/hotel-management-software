ALTER TABLE "housekeeping_tasks" ADD COLUMN IF NOT EXISTS "assigned_user_id" text;
DO $$ BEGIN
 ALTER TABLE "housekeeping_tasks" ADD CONSTRAINT "housekeeping_tasks_assigned_user_id_app_users_id_fk" FOREIGN KEY ("assigned_user_id") REFERENCES "public"."app_users"("id") ON DELETE SET NULL ON UPDATE NO ACTION;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
CREATE INDEX IF NOT EXISTS "idx_housekeeping_property_assignee_status" ON "housekeeping_tasks" ("property_id", "assigned_user_id", "status");
CREATE UNIQUE INDEX IF NOT EXISTS "idx_housekeeping_unique_checkout_cleaning" ON "housekeeping_tasks" ("reservation_id", "task_type") WHERE "task_type" = 'CHECKOUT_CLEANING';
