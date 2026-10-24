"use client";

import { Upload, X } from "lucide-react";
import { useRef, useState } from "react";
import { useMe } from "@/components/app-shell";
import { AVATAR_PRESET_IDS, Avatar } from "@/components/data-ui";
import { Alert, Button, Card } from "@/components/ui";
import { api } from "@/lib/api";

/** Profil resmi: fotoğraf yükle veya hazır avatar seç */
export function AvatarCard() {
  const { me, reload } = useMe();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const ref = useRef<HTMLInputElement>(null);

  async function run(fn: () => Promise<unknown>) {
    setBusy(true);
    setError(null);
    try {
      await fn();
      await reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="mt-6">
      <div className="flex flex-wrap items-center gap-5">
        <Avatar avatar={me.avatar} name={me.fullName} size={72} />
        <div className="min-w-0 flex-1">
          <h2 className="text-lg font-bold">Profil resmi</h2>
          <p className="text-sm text-ink-soft">Fotoğrafın profilinde, ilanlarında ve mesajlarda görünür.</p>
        </div>
        <div className="flex gap-2">
          <input
            ref={ref}
            type="file"
            accept="image/jpeg,image/png,image/bmp,image/webp"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              e.target.value = "";
              if (!f) return;
              const form = new FormData();
              form.append("file", f);
              void run(() => api("/me/avatar", { form }));
            }}
          />
          <Button variant="secondary" loading={busy} onClick={() => ref.current?.click()} className="!h-10">
            <Upload className="h-4 w-4" /> Fotoğraf yükle
          </Button>
          {me.avatar && (
            <button onClick={() => void run(() => api("/me/avatar", { method: "DELETE" }))} className="grid h-10 w-10 place-items-center rounded-full border border-line text-ink-soft hover:text-brand" aria-label="Kaldır">
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>
      <div className="mt-5 flex flex-wrap gap-2 border-t border-line pt-4">
        <span className="mr-2 self-center text-xs font-semibold text-ink-soft">Hazır avatar:</span>
        {AVATAR_PRESET_IDS.map((id) => {
          const on = me.avatar?.kind === "preset" && me.avatar.preset === id;
          return (
            <button
              key={id}
              onClick={() => void run(() => api("/me/avatar", { method: "PUT", json: { preset: id } }))}
              aria-pressed={on}
              aria-label={`Avatar ${id}`}
              className={`rounded-full p-0.5 transition ${on ? "ring-2 ring-brand ring-offset-2" : "hover:ring-2 hover:ring-line"}`}
            >
              <Avatar avatar={{ kind: "preset", preset: id }} size={36} />
            </button>
          );
        })}
      </div>
      {error && (
        <div className="mt-3">
          <Alert tone="error">{error}</Alert>
        </div>
      )}
    </Card>
  );
}
