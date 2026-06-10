ALTER TABLE "app_ledger" DROP CONSTRAINT IF EXISTS "app_ledger_kind_check";--> statement-breakpoint
ALTER TABLE "app_ledger" ADD CONSTRAINT "app_ledger_kind_check" CHECK ("app_ledger"."kind" in ('manual_fund', 'routed_income', 'owner_withdrawal', 'reverse_payout', 'adjustment'));--> statement-breakpoint
ALTER TABLE "ledger" DROP CONSTRAINT IF EXISTS "ledger_kind_check";--> statement-breakpoint
ALTER TABLE "ledger" ADD CONSTRAINT "ledger_kind_check" CHECK ("ledger"."kind" in ('topup', 'charge', 'income', 'transfer_in', 'transfer_out', 'redeem', 'withdrawal', 'withdrawal_refund', 'app_fund', 'app_withdrawal', 'app_payout', 'adjustment'));
