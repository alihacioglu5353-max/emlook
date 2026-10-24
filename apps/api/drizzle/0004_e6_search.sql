-- E6 arama: arama metninde parça eşleşmesi (ILIKE '%…%') için trigram indeksi.
-- Şemada tanımlı değildir (drizzle-kit opclass'lı GIN indeksini izlemez); yalnızca burada yönetilir.
CREATE EXTENSION IF NOT EXISTS pg_trgm;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "listings_search_trgm_idx" ON "listings" USING gin ("search_text" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "listings_price_idx" ON "listings" ("status", "price");
