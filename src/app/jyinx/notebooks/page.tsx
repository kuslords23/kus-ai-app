import type { Metadata } from "next";
import { NotebookWorkspace } from "@/components/jyinx/NotebookWorkspace";

export const metadata: Metadata = {
  title: "Notebooks | Kus-lords AI",
  description: "NotebookLM-style notebooks: notes, code snippets, files, and saved chats that hand off to Jyinx.",
};

export default function NotebooksPage() {
  return <NotebookWorkspace />;
}