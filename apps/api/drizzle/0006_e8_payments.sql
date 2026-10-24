CREATE TYPE "public"."invoice_status" AS ENUM('pending', 'issued', 'failed');--> statement-breakpoint
CREATE TYPE "public"."payment_status" AS ENUM('open', 'paid', 'cancelled', 'expired', 'refunded');--> statement-breakpoint
CREATE TYPE "public"."payout_account_status" AS ENUM('pending', 'verified', 'rejected');--> statement-breakpoint
CREATE TYPE "public"."payout_status" AS ENUM('pending', 'settled', 'held', 'failed');--> statement-breakpoint
CREATE TYPE "public"."split_kind" AS ENUM('platform', 'seller_agent', 'buyer_agent');--> statement-breakpoint
CREATE TABLE "invoices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"request_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"net" bigint NOT NULL,
	"vat" bigint NOT NULL,
	"total" bigint NOT NULL,
	"vat_rate_bps" integer NOT NULL,
	"status" "invoice_status" DEFAULT 'pending' NOT NULL,
	"number" text,
	"issued_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payment_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"provider" text NOT NULL,
	"event_id" text NOT NULL,
	"type" text NOT NULL,
	"payload" jsonb NOT NULL,
	"request_id" uuid,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payment_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"public_token" text NOT NULL,
	"created_by" uuid NOT NULL,
	"listing_id" uuid,
	"buyer_agent_id" uuid,
	"buyer_share" integer DEFAULT 0 NOT NULL,
	"payer_name" text NOT NULL,
	"payer_phone" text,
	"payer_email" text,
	"description" text NOT NULL,
	"amount" bigint NOT NULL,
	"currency" text DEFAULT 'TRY' NOT NULL,
	"platform_fee_bps" integer NOT NULL,
	"status" "payment_status" DEFAULT 'open' NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"provider" text NOT NULL,
	"provider_session_id" text,
	"provider_payment_id" text,
	"paid_at" timestamp with time zone,
	"cancelled_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "payment_requests_public_token_unique" UNIQUE("public_token")
);
--> statement-breakpoint
CREATE TABLE "payment_splits" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"request_id" uuid NOT NULL,
	"kind" "split_kind" NOT NULL,
	"user_id" uuid,
	"amount" bigint NOT NULL,
	"payout_status" "payout_status" DEFAULT 'pending' NOT NULL,
	"payout_ref" text,
	"settled_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payout_accounts" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"holder_name" text NOT NULL,
	"iban" text NOT NULL,
	"tax_id" text NOT NULL,
	"status" "payout_account_status" DEFAULT 'pending' NOT NULL,
	"provider_ref" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_request_id_payment_requests_id_fk" FOREIGN KEY ("request_id") REFERENCES "public"."payment_requests"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_events" ADD CONSTRAINT "payment_events_request_id_payment_requests_id_fk" FOREIGN KEY ("request_id") REFERENCES "public"."payment_requests"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_requests" ADD CONSTRAINT "payment_requests_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_requests" ADD CONSTRAINT "payment_requests_listing_id_listings_id_fk" FOREIGN KEY ("listing_id") REFERENCES "public"."listings"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_requests" ADD CONSTRAINT "payment_requests_buyer_agent_id_users_id_fk" FOREIGN KEY ("buyer_agent_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_splits" ADD CONSTRAINT "payment_splits_request_id_payment_requests_id_fk" FOREIGN KEY ("request_id") REFERENCES "public"."payment_requests"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_splits" ADD CONSTRAINT "payment_splits_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payout_accounts" ADD CONSTRAINT "payout_accounts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "invoices_request_idx" ON "invoices" USING btree ("request_id");--> statement-breakpoint
CREATE UNIQUE INDEX "payment_events_provider_event_idx" ON "payment_events" USING btree ("provider","event_id");--> statement-breakpoint
CREATE INDEX "payment_requests_creator_idx" ON "payment_requests" USING btree ("created_by","created_at");--> statement-breakpoint
CREATE INDEX "payment_requests_buyer_agent_idx" ON "payment_requests" USING btree ("buyer_agent_id");--> statement-breakpoint
CREATE UNIQUE INDEX "payment_splits_kind_idx" ON "payment_splits" USING btree ("request_id","kind");--> statement-breakpoint
CREATE INDEX "payment_splits_user_idx" ON "payment_splits" USING btree ("user_id");