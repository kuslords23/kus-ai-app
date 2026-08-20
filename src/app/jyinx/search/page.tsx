import type { Metadata } from "next";
import { OnlineCodeSearch, type OnlineCodeResult } from "@/components/ide/OnlineCodeSearch";

export const metadata: Metadata = {
  title: "Online Code Search | Jyinx",
  description: "Search public codebases, documentation, and code snippets.",
};

export default function JyinxSearchPage() {
  return (
    <div className="flex h-screen bg-background">
      <OnlineCodeSearch
        onSend={(result: OnlineCodeResult) => {
          console.log("Code selected:", result);
        }}
      />
    </div>
  );
}