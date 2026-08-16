import type { Metadata } from "next";
import { JyinxStudio } from "@/components/jyinx/JyinxStudio";
import { JyinxMobileDashboard } from "@/components/jyinx/mobile/JyinxMobileDashboard";

export const metadata: Metadata = {
  title: "Jyinx IDE | Kus-lords AI",
  description: "Jyinx developer workspace for models, code, and offline-safe operations.",
};

export default function JyinxPage() {
  return (
    <>
      <div className="lg:hidden">
        <JyinxMobileDashboard />
      </div>
      <div className="hidden lg:block">
        <JyinxStudio />
      </div>
    </>
  );
}
