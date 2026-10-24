"use client";

import { useParams } from "next/navigation";
import { Thread } from "@/components/chat";

export default function ThreadPage() {
  const { id } = useParams<{ id: string }>();
  return <Thread key={id} id={id} />;
}
