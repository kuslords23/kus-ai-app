import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { CONNECTOR_CATALOG, connectorById, type ConnectorAuthType } from "@/server/connectors/types";
import { saveConnectorCredential, deleteConnectorCredential, listConnectorStates } from "@/server/connectors/store";
import { dispatchAction, type ConnectorAction } from "@/server/connectors/actions/dispatcher";

export const runtime = "nodejs";

async function requireUserId(): Promise<string | null> {
  try {
    const client = await createClient();
    const { data } = await client.auth.getUser();
    return data?.user?.id ?? null;
  } catch {
    return null;
  }
}

/** GET: catalog + per-user status for every connector. */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const userId = await requireUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

  const all = allSpecs();
  const ids = all.map((c) => c.id);
  const states = await listConnectorStates(userId, ids);

  const catalog = structuredClone(CONNECTOR_CATALOG);
  const statusById: Record<string, { status: string; message?: string }> = {};
  for (const id of ids) statusById[id] = states[id] ?? { status: "disconnected" as string };

  return NextResponse.json({ catalog, statuses: statusById });
}

/** POST: save a credential or dispatch an action. */
export async function POST(request: NextRequest): Promise<NextResponse> {
  const userId = await requireUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

  const body = (await request.json().catch(() => null)) as {
    op?: "connect" | "disconnect" | "dispatch";
    connectorId?: string;
    authType?: ConnectorAuthType;
    value?: string;
    boundApp?: string;
    endpoint?: string;
    action?: ConnectorAction;
    confirmed?: boolean;
    payload?: Record<string, unknown>;
  } | null;
  if (!body?.connectorId) return NextResponse.json({ error: "connectorId is required." }, { status: 400 });

  if (body.op === "disconnect") {
    await deleteConnectorCredential(userId, body.connectorId);
    return NextResponse.json({ ok: true, connector: body.connectorId, connected: false });
  }

  if (body.op === "connect") {
    const spec = connectorById(body.connectorId);
    if (!spec) return NextResponse.json({ error: "Unknown connector." }, { status: 400 });
    if (!body.value) return NextResponse.json({ error: "A credential value is required." }, { status: 400 });

    const type = body.authType ?? spec.authType;
    const saved = await saveConnectorCredential(userId, spec.id, {
      type,
      value: body.value,
      boundApp: body.boundApp,
      endpoint: body.endpoint,
    });
    if (!saved.ok) return NextResponse.json({ error: "error" in saved ? saved.error : "Could not store credential." }, { status: 400 });
    return NextResponse.json({ ok: true, connector: spec.id, connected: true });
  }

  if (body.op === "dispatch") {
    const action = body.action;
    if (!action) return NextResponse.json({ error: "action is required for dispatch." }, { status: 400 });
    const result = await dispatchAction({
      userId,
      connectorId: body.connectorId,
      action,
      confirmed: body.confirmed,
      payload: body.payload ?? {},
    });
    return NextResponse.json(result, { status: result.ok ? 200 : result.requiresConfirmation ? 428 : 400 });
  }

  return NextResponse.json({ error: "Unsupported operation." }, { status: 400 });
}

function allSpecs() {
  return Object.values(CONNECTOR_CATALOG).flat();
}