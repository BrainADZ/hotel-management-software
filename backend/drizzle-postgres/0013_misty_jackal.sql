ALTER TABLE "restaurant_orders" ADD COLUMN "table_number" text;--> statement-breakpoint
ALTER TABLE "restaurant_orders" ADD COLUMN "covers" integer;--> statement-breakpoint
ALTER TABLE "restaurant_orders" ADD COLUMN "waiter_user_id" text;--> statement-breakpoint
ALTER TABLE "restaurant_orders" ADD COLUMN "waiter_name" text;--> statement-breakpoint
ALTER TABLE "restaurant_orders" ADD CONSTRAINT "restaurant_orders_waiter_user_id_app_users_id_fk" FOREIGN KEY ("waiter_user_id") REFERENCES "public"."app_users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_restaurant_property_table" ON "restaurant_orders" USING btree ("property_id","table_number");--> statement-breakpoint
CREATE INDEX "idx_restaurant_property_waiter" ON "restaurant_orders" USING btree ("property_id","waiter_user_id");--> statement-breakpoint
ALTER TABLE "restaurant_orders" ADD CONSTRAINT "chk_restaurant_orders_covers" CHECK ("restaurant_orders"."covers" is null or ("restaurant_orders"."covers" >= 1 and "restaurant_orders"."covers" <= 100));