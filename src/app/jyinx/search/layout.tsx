import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Online Code Search | Jyinx",
  description: "Search public codebases, documentation, and code snippets.",
};

export default function JyinxSearchLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
