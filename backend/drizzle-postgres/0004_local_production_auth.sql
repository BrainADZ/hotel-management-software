ALTER TABLE "app_users" ADD COLUMN "password_hash" text;
--> statement-breakpoint
CREATE TABLE "user_sessions" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"token_hash" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"last_used_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "user_sessions" ADD CONSTRAINT "user_sessions_user_id_app_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."app_users"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE UNIQUE INDEX "idx_user_sessions_token_hash" ON "user_sessions" USING btree ("token_hash");
--> statement-breakpoint
CREATE INDEX "idx_user_sessions_user_expiry" ON "user_sessions" USING btree ("user_id","expires_at");
