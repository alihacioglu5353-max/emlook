CREATE TYPE "public"."membership_status" AS ENUM('requested', 'invited', 'active', 'declined', 'cancelled', 'left', 'removed');--> statement-breakpoint
CREATE TYPE "public"."office_role" AS ENUM('owner', 'manager', 'agent');--> statement-breakpoint
CREATE TYPE "public"."office_status" AS ENUM('pending', 'active', 'rejected', 'suspended');--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"type" text NOT NULL,
	"title" text NOT NULL,
	"body" text NOT NULL,
	"data" jsonb,
	"read_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "office_memberships" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"office_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"role" "office_role" DEFAULT 'agent' NOT NULL,
	"status" "membership_status" NOT NULL,
	"invited_by" uuid,
	"decided_by" uuid,
	"decided_at" timestamp with time zone,
	"ended_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "offices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"legal_name" text NOT NULL,
	"license_number" text NOT NULL,
	"city" text NOT NULL,
	"district" text NOT NULL,
	"address" text,
	"phone" text,
	"email" text,
	"owner_id" uuid NOT NULL,
	"status" "office_status" DEFAULT 'pending' NOT NULL,
	"reviewed_at" timestamp with time zone,
	"reviewed_by" uuid,
	"rejection_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "office_memberships" ADD CONSTRAINT "office_memberships_office_id_offices_id_fk" FOREIGN KEY ("office_id") REFERENCES "public"."offices"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "office_memberships" ADD CONSTRAINT "office_memberships_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "office_memberships" ADD CONSTRAINT "office_memberships_invited_by_users_id_fk" FOREIGN KEY ("invited_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "office_memberships" ADD CONSTRAINT "office_memberships_decided_by_users_id_fk" FOREIGN KEY ("decided_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "offices" ADD CONSTRAINT "offices_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "offices" ADD CONSTRAINT "offices_reviewed_by_users_id_fk" FOREIGN KEY ("reviewed_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "notifications_user_created_idx" ON "notifications" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "office_memberships_office_status_idx" ON "office_memberships" USING btree ("office_id","status");--> statement-breakpoint
CREATE INDEX "office_memberships_user_status_idx" ON "office_memberships" USING btree ("user_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "office_memberships_one_active_idx" ON "office_memberships" USING btree ("user_id") WHERE status = 'active';--> statement-breakpoint
CREATE UNIQUE INDEX "office_memberships_one_open_idx" ON "office_memberships" USING btree ("office_id","user_id") WHERE status in ('requested', 'invited', 'active');--> statement-breakpoint
CREATE INDEX "offices_status_idx" ON "offices" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "offices_owner_open_idx" ON "offices" USING btree ("owner_id") WHERE status <> 'rejected';