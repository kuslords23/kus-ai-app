/**
 * ConnectorStore — secure credential storage + connector factory.
 *
 * Stores each connector's credential per user/project, AES-256-GCM encrypted
 * (same scheme as BYOK). Provides the `registers`/`getConnector` helpers used by
 * the registry and the action dispatcher, and health/status refresh for the
 * Connectors Hub UI.
 */

import { createClient as createSupabaseClient } from "@/lib/supabase/server";
import { BaseConnector, type ConnectorCredential } from "@/server/connectors/base";
import { connectorById } from "@/server/connectors/types";
import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from "node:crypto";

export const CONNECTOR_STORE_TABLE = "jyinx_connector_credentials";

function secretKey(): Buffer {
  const secret = process.env.CONNECTOR_ENCRYPTION_KEY || "kus-lords-connector-dev-secret-0001";
  return createHash("sha256").update(secret).digest();
}

export function encryptConnValue(plain: string): { cipher: string; iv: string } {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", secretKey(), iv);
  const encrypted = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return { cipher: `${tag.toString("base64")}.${encrypted.toString("base64")}`, iv: iv.toString("base64") };
}

export function decryptConn(entry: { cipher: string; iv: string }): string | null {
  try {
    const iv = Buffer.from(entry.iv, "base64");
    const [tagStr, dataStr] = entry.cipher.split(".");
    if (!tagStr || !dataStr) return null;
    const decipher = createDecipheriv("aes-256-gcm", secretKey(), iv);
    decipher.setAuthTag(Buffer.from(tagStr, "base64"));
    const decrypted = Buffer.concat([decipher.update(Buffer.from(dataStr, "base64")), decipher.final()]);
    return decrypted.toString("utf8");
  } catch {
    return null;
  }
}

export async function saveConnectorCredential(
  userId: string,
  connectorId: string,
  credential: ConnectorCredential
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!connectorById(connectorId)) return { ok: false, error: `Unknown connector: ${connectorId}` };
  if (!credential.value) return { ok: false, error: "A credential value is required." };
  try {
    const encrypted = encryptConnValue(credential.value);
    const client = await createSupabaseClient();
    await client.from(CONNECTOR_STORE_TABLE).upsert(
      {
        user_id: userId,
        connector_id: connectorId,
        cipher: encrypted.cipher,
        iv: encrypted.iv,
        type: credential.type,
        bound_app: credential.boundApp ?? null,
        endpoint: credential.endpoint ?? null,
        scopes: credential.scopes ?? null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id,connector_id" }
    );
    return { ok: true };
  } catch (cause) {
    return { ok: false, error: cause instanceof Error ? cause.message : "Could not store connector." };
  }
}

export async function deleteConnectorCredential(userId: string, connectorId: string): Promise<void> {
  try {
    const client = await createSupabaseClient();
    await client.from(CONNECTOR_STORE_TABLE).delete().eq("user_id", userId).eq("connector_id", connectorId);
  } catch {
    // best-effort
  }
}

export async function getConnectorCredential(userId: string, connectorId: string): Promise<{ connector: ConnectorCredential | null }> {
  try {
    const client = await createSupabaseClient();
    const { data } = await client
      .from(CONNECTOR_STORE_TABLE)
      .select("cipher, iv, type, bound_app, endpoint, scopes")
      .eq("user_id", userId)
      .eq("connector_id", connectorId)
      .maybeSingle();
    if (!data) return { connector: null };
    const value = decryptConn({ cipher: data.cipher as string, iv: data.iv as string });
    if (!value) return { connector: null };
    return {
      connector: {
        type: (data.type as ConnectorCredential["type"]) ?? "token",
        value,
        boundApp: (data.bound_app as string) ?? undefined,
        endpoint: (data.endpoint as string) ?? undefined,
        scopes: (data.scopes as string[] | undefined) ?? undefined,
      } as ConnectorCredential,
    };
  } catch {
    return { connector: null };
  }
}

/**
 * Instantiates a connector bound to a user's stored credential, ready for
 * health checks and actions. Returns null when the connector is unknown or the
 * credential is missing.
 */
export async function getConnector(userId: string, connectorId: string): Promise<BaseConnector | null> {
  const spec = connectorById(connectorId);
  if (!spec) return null;
  const { connector } = await getConnectorCredential(userId, connectorId);
  if (!connector) return new BaseConnector(spec).setCredential(null);
  return new BaseConnector(spec).setCredential(connector);
}

export async function listConnectorStates(userId: string, connectorIds: string[]): Promise<Record<string, { status: string; message?: string }>> {
  const out: Record<string, { status: string; message?: string }> = {};
  for (const id of connectorIds) {
    const c = await getConnector(userId, id);
    out[id] = c ? await c.health() : { status: "disconnected" as string, message: "Unknown connector" };
  }
  return out;
}