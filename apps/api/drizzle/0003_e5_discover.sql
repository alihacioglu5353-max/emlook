CREATE TYPE "public"."interest_status" AS ENUM('pending', 'accepted', 'declined', 'withdrawn');--> statement-breakpoint
CREATE TYPE "public"."swipe_decision" AS ENUM('like', 'pass');--> statement-breakpoint
CREATE TABLE "interests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"listing_id" uuid NOT NULL,
	"requester_id" uuid NOT NULL,
	"owner_id" uuid NOT NULL,
	"status" "interest_status" DEFAULT 'pending' NOT NULL,
	"note" text,
	"swipe_id" uuid,
	"decided_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "listing_swipes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"listing_id" uuid NOT NULL,
	"decision" "swipe_decision" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "interests" ADD CONSTRAINT "interests_listing_id_listings_id_fk" FOREIGN KEY ("listing_id") REFERENCES "public"."listings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "interests" ADD CONSTRAINT "interests_requester_id_users_id_fk" FOREIGN KEY ("requester_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "interests" ADD CONSTRAINT "interests_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "interests" ADD CONSTRAINT "interests_swipe_id_listing_swipes_id_fk" FOREIGN KEY ("swipe_id") REFERENCES "public"."listing_swipes"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "listing_swipes" ADD CONSTRAINT "listing_swipes_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "listing_swipes" ADD CONSTRAINT "listing_swipes_listing_id_listings_id_fk" FOREIGN KEY ("listing_id") REFERENCES "public"."listings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "interests_open_idx" ON "interests" USING btree ("listing_id","requester_id") WHERE status in ('pending', 'accepted');--> statement-breakpoint
CREATE INDEX "interests_owner_idx" ON "interests" USING btree ("owner_id","status");--> statement-breakpoint
CREATE INDEX "interests_requester_idx" ON "interests" USING btree ("requester_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "listing_swipes_pair_idx" ON "listing_swipes" USING btree ("user_id","listing_id");--> statement-breakpoint
CREATE INDEX "listing_swipes_user_time_idx" ON "listing_swipes" USING btree ("user_id","created_at");