"use client";

import { useParams } from "next/navigation";
import { ConversationList } from "@/components/chat";

/** İki bölmeli mesaj ekranı: solda konuşmalar, sağda seçili konuşma */
export default function MessagesLayout({ children }: { children: React.ReactNode }) {
  const params = useParams<{ id?: string }>();
  const open = !!params.id;
  return (
    <div className="grid h-[calc(100dvh-10rem)] min-h-[460px] overflow-hidden rounded-2xl border border-line bg-surface md:grid-cols-[320px_1fr]">
      <aside className={`min-h-0 overflow-y-auto border-line md:block md:border-r ${open ? "hidden" : "block"}`}>
        <h1 className="border-b border-line px-4 py-3.5 text-lg font-extrabold tracking-tight">Mesajlar</h1>
        <ConversationList activeId={params.id} />
      </aside>
      <section className={`min-h-0 ${open ? "block" : "hidden md:block"}`}>{children}</section>
    </div>
  );
}
