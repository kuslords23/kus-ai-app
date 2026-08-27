import type { Metadata } from "next";
import { BillingModalPage } from "@/components/settings/BillingModalPage";

export const metadata: Metadata = {
  title: "Jyinx Billing & Credits",
  description: "Credit balance, transaction history, and credit top-up bundles.",
};

export default function JyinxBillingRoute() {
  return <BillingModalPage />;
}