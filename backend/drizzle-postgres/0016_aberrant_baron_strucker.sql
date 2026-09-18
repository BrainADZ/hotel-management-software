CREATE TABLE "rate_plans" (
	"id" text PRIMARY KEY NOT NULL,
	"property_id" text NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"room_type" text NOT NULL,
	"rate_paise" integer NOT NULL,
	"meal_plan" text DEFAULT 'EP' NOT NULL,
	"refundable" boolean DEFAULT true NOT NULL,
	"min_stay" integer DEFAULT 1 NOT NULL,
	"valid_from" text,
	"valid_to" text,
	"active" boolean DEFAULT true NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"updated_at" text NOT NULL,
	CONSTRAINT "chk_rate_plans_rate_nonnegative" CHECK ("rate_plans"."rate_paise" >= 0),
	CONSTRAINT "chk_rate_plans_min_stay" CHECK ("rate_plans"."min_stay" >= 1 and "rate_plans"."min_stay" <= 365),
	CONSTRAINT "chk_rate_plans_meal_plan" CHECK ("rate_plans"."meal_plan" in ('EP', 'CP', 'MAP', 'AP')),
	CONSTRAINT "chk_rate_plans_validity" CHECK ("rate_plans"."valid_from" is null or "rate_plans"."valid_to" is null or "rate_plans"."valid_from" <= "rate_plans"."valid_to")
);
--> statement-breakpoint
ALTER TABLE "rate_plans" ADD CONSTRAINT "rate_plans_property_id_properties_id_fk" FOREIGN KEY ("property_id") REFERENCES "public"."properties"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "idx_rate_plans_property_code" ON "rate_plans" USING btree ("property_id","code");--> statement-breakpoint
CREATE INDEX "idx_rate_plans_property_room_type" ON "rate_plans" USING btree ("property_id","room_type","active");