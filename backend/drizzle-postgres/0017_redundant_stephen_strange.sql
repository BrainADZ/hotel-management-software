ALTER TABLE "payments" DROP CONSTRAINT "chk_payments_source";--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "chk_payments_source" CHECK (
   (
    "payments"."folio_id" is not null
    and "payments"."reservation_id" is not null
    and "payments"."restaurant_order_id" is null
   )
   or
   (
    "payments"."folio_id" is null
    and "payments"."reservation_id" is null
    and "payments"."restaurant_order_id" is not null
   )
  );