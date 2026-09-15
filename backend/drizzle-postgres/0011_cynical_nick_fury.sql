CREATE TABLE "restaurant_order_items" (
	"id" text PRIMARY KEY NOT NULL,
	"property_id" text NOT NULL,
	"order_id" text NOT NULL,
	"menu_item_id" text NOT NULL,
	"item_name" text NOT NULL,
	"category" text NOT NULL,
	"quantity" integer NOT NULL,
	"unit_price_paise" integer NOT NULL,
	"tax_rate_bps" integer NOT NULL,
	"subtotal_paise" integer NOT NULL,
	"taxable_amount_paise" integer NOT NULL,
	"tax_paise" integer NOT NULL,
	"cgst_paise" integer DEFAULT 0 NOT NULL,
	"sgst_paise" integer DEFAULT 0 NOT NULL,
	"igst_paise" integer DEFAULT 0 NOT NULL,
	"total_paise" integer NOT NULL,
	"created_at" text NOT NULL
);
--> statement-breakpoint
ALTER TABLE "restaurant_orders" ADD COLUMN "kot_status" text DEFAULT 'NEW' NOT NULL;--> statement-breakpoint
ALTER TABLE "restaurant_orders" ADD COLUMN "item_count" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "restaurant_orders" ADD COLUMN "special_instructions" text;--> statement-breakpoint
ALTER TABLE "restaurant_order_items" ADD CONSTRAINT "restaurant_order_items_property_id_properties_id_fk" FOREIGN KEY ("property_id") REFERENCES "public"."properties"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "restaurant_order_items" ADD CONSTRAINT "restaurant_order_items_order_id_restaurant_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."restaurant_orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_restaurant_order_items_order" ON "restaurant_order_items" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "idx_restaurant_order_items_property" ON "restaurant_order_items" USING btree ("property_id","created_at");--> statement-breakpoint
CREATE INDEX "idx_restaurant_property_kot" ON "restaurant_orders" USING btree ("property_id","kot_status");