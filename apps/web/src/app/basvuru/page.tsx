import type { Metadata } from "next";
import { ApplyWizard } from "./wizard";

export const metadata: Metadata = { title: "Danışman başvurusu" };

export default function ApplyPage() {
  return <ApplyWizard />;
}
