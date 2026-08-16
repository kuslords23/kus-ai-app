import type { Metadata } from "next";
import { JyinxMobileDashboard } from "@/components/jyinx/mobile/JyinxMobileDashboard";

export const metadata: Metadata = {
  title: "Jyinx Mobile Workspace",
  description: "Mobile-first Jyinx agent workspace dashboard.",
};

export default function JyinxMobilePage() {
  return <JyinxMobileDashboard />;
}
