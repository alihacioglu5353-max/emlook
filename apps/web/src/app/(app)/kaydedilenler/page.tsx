"use client";

import { ListingGrid } from "@/components/listing-grid";
import { Eyebrow } from "@/components/ui";

export default function SavedPage() {
  return (
    <div className="space-y-6">
      <div>
        <Eyebrow>Koleksiyon</Eyebrow>
        <h1 className="text-3xl font-extrabold tracking-tight">Kaydettiğim ilanlar</h1>
        <p className="mt-1 text-ink-soft">Yayından kalkan ilanlar burada görünmez.</p>
      </div>
      <ListingGrid wide queryKey={["saved"]} path="/me/saved?limit=18" empty="Henüz ilan kaydetmedin." />
    </div>
  );
}
