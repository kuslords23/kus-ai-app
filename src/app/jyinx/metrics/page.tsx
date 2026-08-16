import type { Metadata } from "next";
import { JyinxMetricsPage } from "@/components/jyinx/JyinxMetricsPage";

export const metadata: Metadata = { title: "Jyinx Metrics", description: "Live Jyinx agent and queue metrics." };

export default function JyinxMetricsRoute() {
  return <JyinxMetricsPage />;
}
