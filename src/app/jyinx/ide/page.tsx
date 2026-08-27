import type { Metadata } from "next";
import { JyinxStudio } from "@/components/jyinx/JyinxStudio";

export const metadata: Metadata = {
  title: "Jyinx IDE Workspace",
  description: "Full Jyinx editor, agent, repository, and pull-request workspace.",
};

export default function JyinxIdePage() {
  return <JyinxStudio />;
}
