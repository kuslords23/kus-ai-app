import type { Metadata } from "next";
import { JyinxIde } from "@/components/jyinx/JyinxIde";

export const metadata: Metadata = {
  title: "Jyinx Web Builder",
  description: "Scaffold, edit, and live-preview full-stack web apps in a dual-pane IDE with instant desktop and mobile viewports.",
};

export default function JyinxBuilderPage() {
  return <JyinxIde />;
}