DELETE FROM "access_tokens"
WHERE NOT EXISTS (
	SELECT 1 FROM "clients" WHERE "clients"."client_id" = "access_tokens"."client_id"
);--> statement-breakpoint
DELETE FROM "authorization_codes"
WHERE NOT EXISTS (
	SELECT 1 FROM "clients" WHERE "clients"."client_id" = "authorization_codes"."client_id"
);--> statement-breakpoint
DELETE FROM "payment_intents"
WHERE NOT EXISTS (
	SELECT 1 FROM "clients" WHERE "clients"."client_id" = "payment_intents"."client_id"
);--> statement-breakpoint
DELETE FROM "refresh_tokens"
WHERE NOT EXISTS (
	SELECT 1 FROM "clients" WHERE "clients"."client_id" = "refresh_tokens"."client_id"
);--> statement-breakpoint
ALTER TABLE "access_tokens" ADD CONSTRAINT "access_tokens_client_id_clients_client_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("client_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "authorization_codes" ADD CONSTRAINT "authorization_codes_client_id_clients_client_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("client_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_intents" ADD CONSTRAINT "payment_intents_client_id_clients_client_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("client_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "refresh_tokens" ADD CONSTRAINT "refresh_tokens_client_id_clients_client_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("client_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "device_authorizations" ADD CONSTRAINT "device_authorizations_status_check" CHECK ("device_authorizations"."status" in ('pending', 'approved', 'denied', 'consumed'));--> statement-breakpoint
ALTER TABLE "ledger" ADD CONSTRAINT "ledger_kind_check" CHECK ("ledger"."kind" in ('topup', 'charge', 'income', 'transfer_in', 'transfer_out', 'redeem', 'withdrawal', 'withdrawal_refund', 'adjustment'));--> statement-breakpoint
ALTER TABLE "login_handoffs" ADD CONSTRAINT "login_handoffs_status_check" CHECK ("login_handoffs"."status" in ('pending', 'approved', 'denied', 'consumed'));--> statement-breakpoint
ALTER TABLE "payment_intents" ADD CONSTRAINT "payment_intents_amount_positive" CHECK ("payment_intents"."amount" > 0);--> statement-breakpoint
ALTER TABLE "payment_intents" ADD CONSTRAINT "payment_intents_status_check" CHECK ("payment_intents"."status" in ('pending', 'completed', 'cancelled'));--> statement-breakpoint
ALTER TABLE "payment_intents" ADD CONSTRAINT "payment_intents_webhook_status_check" CHECK ("payment_intents"."webhook_status" is null or "payment_intents"."webhook_status" in ('pending', 'delivered', 'failed'));--> statement-breakpoint
ALTER TABLE "payment_intents" ADD CONSTRAINT "payment_intents_webhook_attempts_nonnegative" CHECK ("payment_intents"."webhook_attempts" >= 0);--> statement-breakpoint
ALTER TABLE "redeem_codes" ADD CONSTRAINT "redeem_codes_amount_positive" CHECK ("redeem_codes"."amount" > 0);--> statement-breakpoint
ALTER TABLE "redeem_codes" ADD CONSTRAINT "redeem_codes_max_redemptions_positive" CHECK ("redeem_codes"."max_redemptions" is null or "redeem_codes"."max_redemptions" > 0);--> statement-breakpoint
ALTER TABLE "withdrawals" ADD CONSTRAINT "withdrawals_amount_positive" CHECK ("withdrawals"."amount" > 0);--> statement-breakpoint
ALTER TABLE "withdrawals" ADD CONSTRAINT "withdrawals_status_check" CHECK ("withdrawals"."status" in ('pending', 'paid', 'rejected', 'cancelled'));
