CREATE TABLE "app_ledger" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"client_id" uuid NOT NULL,
	"user_id" uuid,
	"delta" integer NOT NULL,
	"kind" text DEFAULT 'adjustment' NOT NULL,
	"reason" text,
	"ref" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "app_ledger_ref_unique" UNIQUE("ref"),
	CONSTRAINT "app_ledger_kind_check" CHECK ("app_ledger"."kind" in ('manual_fund', 'routed_income', 'owner_withdrawal', 'reverse_payout', 'adjustment'))
);
--> statement-breakpoint
ALTER TABLE "ledger" DROP CONSTRAINT "ledger_kind_check";--> statement-breakpoint
ALTER TABLE "clients" ADD COLUMN "income_destination" text DEFAULT 'owner' NOT NULL;--> statement-breakpoint
ALTER TABLE "app_ledger" ADD CONSTRAINT "app_ledger_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app_ledger" ADD CONSTRAINT "app_ledger_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "app_ledger_client_id_idx" ON "app_ledger" USING btree ("client_id");--> statement-breakpoint
CREATE INDEX "app_ledger_user_id_idx" ON "app_ledger" USING btree ("user_id");--> statement-breakpoint
ALTER TABLE "clients" ADD CONSTRAINT "clients_income_destination_check" CHECK ("clients"."income_destination" in ('owner', 'app_balance'));--> statement-breakpoint
ALTER TABLE "ledger" ADD CONSTRAINT "ledger_kind_check" CHECK ("ledger"."kind" in ('topup', 'charge', 'income', 'transfer_in', 'transfer_out', 'redeem', 'withdrawal', 'withdrawal_refund', 'app_fund', 'app_withdrawal', 'app_payout', 'adjustment'));