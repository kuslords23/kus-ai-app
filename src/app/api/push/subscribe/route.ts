import webpush from "web-push";
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

const TABLE = "push_subscriptions";

function configureVapid() {
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  if (!publicKey || !privateKey) return false;
  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT || "mailto:royal@kus-lords.app",
    publicKey,
    privateKey
  );
  return true;
}

export async function POST(request: NextRequest) {
  if (!configureVapid()) {
    return NextResponse.json(
      { ok: false, error: "Push not configured" },
      { status: 503 }
    );
  }

  const body = await request.json().catch(() => null);
  if (!body?.userId || !body?.subscription?.endpoint) {
    return NextResponse.json({ ok: false, error: "Invalid body" }, { status: 400 });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user || user.id !== body.userId) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const sub = body.subscription;
  const { error } = await supabase.from(TABLE).upsert(
    {
      user_id: user.id,
      endpoint: sub.endpoint,
      p256dh: sub.keys?.p256dh,
      auth: sub.keys?.auth,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id,endpoint" }
  );

  if (error) {
    return NextResponse.json(
      { ok: false, error: error.message },
      { status: 500 }
    );
  }

  return NextResponse.json({ ok: true });
}

export async function DELETE(request: NextRequest) {
  const body = await request.json().catch(() => null);
  if (!body?.userId || !body?.endpoint) {
    return NextResponse.json({ ok: false, error: "Invalid body" }, { status: 400 });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user || user.id !== body.userId) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  await supabase
    .from(TABLE)
    .delete()
    .eq("user_id", user.id)
    .eq("endpoint", body.endpoint);

  return NextResponse.json({ ok: true });
}
