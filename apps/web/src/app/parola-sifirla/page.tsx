import type { Metadata } from "next";
import { Suspense } from "react";
import { AuthLayout } from "@/components/auth-layout";
import { ForgotForm } from "./forgot-form";

export const metadata: Metadata = { title: "Parolamı unuttum" };

export default function ForgotPage() {
  return (
    <AuthLayout>
      <Suspense>
        <ForgotForm />
      </Suspense>
    </AuthLayout>
  );
}
