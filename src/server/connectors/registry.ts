/**
 * ConnectorRegistry — factory that maps connector ids to concrete adapters.
 *
 * Uses the shared `getConnector` (which loads the user's encrypted credential)
 * to produce a typed connector ready for health checks and the action
 * dispatcher. Unknown connectors degrade to the base connector.
 */

import { BaseConnector } from "@/server/connectors/base";
import { GitHubConnector, VercelConnector, SupabaseConnector, AWSConnector } from "@/server/connectors/adapters";
import { connectorById } from "@/server/connectors/types";
import { getConnectorCredential } from "@/server/connectors/store";

export async function resolveConnector(userId: string, connectorId: string): Promise<BaseConnector | null> {
  const spec = connectorById(connectorId);
  if (!spec) return null;
  const { connector } = await getConnectorCredential(userId, connectorId);

  switch (connectorId) {
    case "github":
      return new GitHubConnector(spec, connector);
    case "vercel":
      return new VercelConnector(spec, connector);
    case "supabase":
      return new SupabaseConnector(spec, connector);
    case "aws":
      return new AWSConnector(spec, connector);
    default:
      return new BaseConnector(spec).setCredential(connector);
  }
}