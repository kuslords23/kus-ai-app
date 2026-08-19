import type { Metadata } from "next";
import { ConnectorsWorkspace } from "@/components/workspace/ConnectorsWorkspace";

export const metadata: Metadata = {
  title: "Jyinx Connectors Workspace",
  description: "Manage every connected service — Version Control, Hosting, Databases, Cache and Monitoring.",
};

export default function JyinxConnectorsWorkspaceRoute() {
  return <ConnectorsWorkspace />;
}