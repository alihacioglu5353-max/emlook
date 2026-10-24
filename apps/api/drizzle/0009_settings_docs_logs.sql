CREATE TABLE "app_settings" (
	"key" text PRIMARY KEY NOT NULL,
	"value" jsonb NOT NULL,
	"updated_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "document_types" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"key" text NOT NULL,
	"label" text NOT NULL,
	"description" text,
	"required" boolean DEFAULT false NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "document_types_key_unique" UNIQUE("key")
);
--> statement-breakpoint
ALTER TABLE "verification_documents" ALTER COLUMN "type" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "agent_profiles" ADD COLUMN "score" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "agent_profiles" ADD COLUMN "badge" text;--> statement-breakpoint
ALTER TABLE "agent_profiles" ADD COLUMN "scored_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "audit_logs" ADD COLUMN "ip" text;--> statement-breakpoint
ALTER TABLE "audit_logs" ADD COLUMN "user_agent" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "avatar_key" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "avatar_preset" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "avatar_updated_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "last_seen_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "app_settings" ADD CONSTRAINT "app_settings_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "audit_logs_created_idx" ON "audit_logs" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "audit_logs_actor_idx" ON "audit_logs" USING btree ("actor_id","created_at");--> statement-breakpoint
DROP TYPE "public"."document_type";--> statement-breakpoint
INSERT INTO "document_types" ("key", "label", "description", "required", "sort_order") VALUES
  ('authority_certificate', 'Taşınmaz Ticareti Yetki Belgesi', 'Ticaret Bakanlığı tarafından verilen yetki belgesi (ön ve arka yüz).', true, 1),
  ('identity', 'Kimlik kartı', 'T.C. kimlik kartının ön yüzü.', false, 2),
  ('tax_plate', 'Vergi levhası', 'İşletmeye ait güncel vergi levhası.', false, 3),
  ('signature_circular', 'İmza sirküleri', 'Şirket yetkilisi iseniz imza sirküleri.', false, 4),
  ('other', 'Diğer belge', 'Başvurunuzu destekleyen diğer belgeler.', false, 9)
ON CONFLICT ("key") DO NOTHING;
