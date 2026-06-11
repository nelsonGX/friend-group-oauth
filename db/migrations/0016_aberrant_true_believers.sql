CREATE TABLE "crypto_scan_state" (
	"chain_id" integer PRIMARY KEY NOT NULL,
	"last_block" bigint NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
