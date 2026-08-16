import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const siteOrigin = process.env.NEXT_PUBLIC_SITE_URL || "https://kus-ai-app.vercel.app";
  const code = searchParams.get("code");
  const oauthError = searchParams.get("error_description") || searchParams.get("error");
  const requestedNext = searchParams.get("next");
  const next = requestedNext?.startsWith("/") && !requestedNext.startsWith("//")
    ? requestedNext
    : "/jyinx";

  if (oauthError) {
    return NextResponse.redirect(`${siteOrigin}${next}?github_error=${encodeURIComponent(oauthError)}`);
  }

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      return NextResponse.redirect(`${siteOrigin}${next}`);
    }
    return NextResponse.redirect(`${siteOrigin}${next}?github_error=${encodeURIComponent(error.message)}`);
  }

  return NextResponse.redirect(`${siteOrigin}${next}?github_error=missing_authorization_code`);
}
