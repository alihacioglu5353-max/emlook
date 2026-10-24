import type { Metadata } from "next";
import { Suspense } from "react";
import { Logo } from "@/components/ui";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Giriş" };

export default function LoginPage() {
  return (
    <main className="grid min-h-screen lg:grid-cols-[1.1fr_1fr]">
      <aside className="relative hidden overflow-hidden bg-ink p-12 text-surface lg:flex lg:flex-col lg:justify-between">
        <div
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              "radial-gradient(60% 60% at 20% 90%, rgba(200,40,63,.45), transparent 70%)",
          }}
        />
        <Logo light className="relative" />
        <div className="relative max-w-md">
          <p className="mb-4 text-xs font-bold uppercase tracking-[0.18em] text-[#f08a99]">
            Emlakçılar için profesyonel ağ
          </p>
          <h1 className="text-5xl font-extrabold leading-[1.05] tracking-tight">
            Paylaş. Eşleş.
            <br />
            Tahsil et.
          </h1>
          <p className="mt-6 text-lg text-white/70">
            Portföy paylaşımı, akıllı eşleşme ve faturalı komisyon tahsilatı tek bir
            uygulamada.
          </p>
        </div>
        <p className="relative text-sm text-white/40">© {new Date().getFullYear()} Emlook</p>
      </aside>

      <section className="flex items-center justify-center px-5 py-12">
        <div className="w-full max-w-sm">
          <Logo className="mb-10 lg:hidden" />
          <Suspense>
            <LoginForm />
          </Suspense>
        </div>
      </section>
    </main>
  );
}
