import type { Metadata } from "next";
import { JyinxStudio } from "@/components/jyinx/JyinxStudio";

export const metadata: Metadata = {
  title: "Jyinx IDE | Kus-lords AI",
  description: "Jyinx developer workspace for models, code, and offline-safe operations.",
};

export default function JyinxPage() {
  return <JyinxStudio />;
}
