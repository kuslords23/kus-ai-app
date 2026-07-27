import webpush from "web-push";
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

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

/** Send a push notification to the current user (e.g. daily briefing). */
export async function POST(request: NextRequest) {
  if (!configureVapid()) {
    return NextResponse.json({ ok: false, error: "Push not configured" }, { status: 503 });
  }

  const body = await request.json().catch(() => ({}));
  const title = String(body.title || "Royal");
  const message = String(body.body || "");
  if (!message.trim()) {
    return NextResponse.json({ ok: false, error: "Missing body" }, { status: 400 });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const { data: subs, error } = await supabase
    .from("push_subscriptions")
    .select("endpoint, p256dh, auth")
    .eq("user_id", user.id);

  if (error || !subs?.length) {
    return NextResponse.json({ ok: false, sent: 0 });
  }

  const payload = JSON.stringify({
    title,
    body: message.slice(0, 240),
    url: "/",
  });

  let sent = 0;
  for (const row of subs) {
    try {
      await webpush.sendNotification(
        {
          endpoint: row.endpoint,
          keys: { p256dh: row.p256dh, auth: row.auth },
        },
        payload
      );
      sent++;
    } catch {
      // stale subscription — ignore
    }
  }

  return NextResponse.json({ ok: true, sent });
}
