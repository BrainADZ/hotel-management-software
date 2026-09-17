ALTER TABLE "payments"
ALTER COLUMN "folio_id" DROP NOT NULL;
--> statement-breakpoint

ALTER TABLE "payments"
ALTER COLUMN "reservation_id" DROP NOT NULL;
--> statement-breakpoint

ALTER TABLE "payments"
ADD COLUMN "restaurant_order_id" text;
--> statement-breakpoint

ALTER TABLE "restaurant_orders"
ADD COLUMN "customer_name" text;
--> statement-breakpoint

ALTER TABLE "restaurant_orders"
ADD COLUMN "customer_phone" text;
--> statement-breakpoint

ALTER TABLE "restaurant_orders"
ADD COLUMN "paid_paise" integer DEFAULT 0 NOT NULL;
--> statement-breakpoint

ALTER TABLE "restaurant_orders"
ADD COLUMN "settled_at" timestamp with time zone;
--> statement-breakpoint

ALTER TABLE "payments"
ADD CONSTRAINT "payments_restaurant_order_id_restaurant_orders_id_fk"
FOREIGN KEY ("restaurant_order_id")
REFERENCES "public"."restaurant_orders"("id")
ON DELETE no action
ON UPDATE no action;
--> statement-breakpoint

CREATE UNIQUE INDEX "idx_payments_restaurant_idempotency"
ON "payments" USING btree ("restaurant_order_id", "idempotency_key");
--> statement-breakpoint

CREATE INDEX "idx_payments_restaurant_status"
ON "payments" USING btree ("restaurant_order_id", "status");
--> statement-breakpoint

ALTER TABLE "payments"
ADD CONSTRAINT "chk_payments_source"
CHECK (
  (
    "folio_id" IS NOT NULL
    AND "reservation_id" IS NOT NULL
    AND "restaurant_order_id" IS NULL
  )
  OR
  (
    "folio_id" IS NULL
    AND "reservation_id" IS NULL
    AND "restaurant_order_id" IS NOT NULL
  )
);
--> statement-breakpoint

ALTER TABLE "restaurant_orders"
ADD CONSTRAINT "chk_restaurant_orders_paid_paise"
CHECK (
  "paid_paise" >= 0
  AND "paid_paise" <= "total_paise"
);