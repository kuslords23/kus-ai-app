import type { Metadata } from "next";
import { WebBuilderEngine } from "@/components/jyinx/WebBuilderEngine";

export const metadata: Metadata = {
  title: "Jyinx Web Builder Engine",
  description: "Agentic scaffold, design, and live DOM injection feedback loop for full-stack web apps and blogs.",
};

export default function JyinxBuilderPage() {
  return <WebBuilderEngine />;
}