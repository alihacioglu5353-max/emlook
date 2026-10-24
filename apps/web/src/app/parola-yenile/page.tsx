import type { Metadata } from "next";
import { Suspense } from "react";
import { AuthLayout } from "@/components/auth-layout";
import { ResetForm } from "./reset-form";

export const metadata: Metadata = { title: "Yeni parola belirle" };

export default function ResetPage() {
  return (
    <AuthLayout>
      <Suspense>
        <ResetForm />
      </Suspense>
    </AuthLayout>
  );
}
