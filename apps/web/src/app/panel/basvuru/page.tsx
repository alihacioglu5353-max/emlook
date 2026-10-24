"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { Spinner } from "@/components/ui";

/** Başvuru artık adım adım sihirbazda: /basvuru */
export default function LegacyApplicationPage() {
  const router = useRouter();
  useEffect(() => router.replace("/basvuru"), [router]);
  return <Spinner />;
}
