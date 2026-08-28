import type { Metadata } from "next";
import { PreviewPage } from "@/components/jyinx/PreviewPage";

export const metadata: Metadata = {
  title: "Jyinx Preview",
  description: "Live preview of your Jyinx-built app, blog, or game.",
};

export default function PreviewRoute() {
  return <PreviewPage />;
}