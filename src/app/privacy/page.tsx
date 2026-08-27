"use client";

import Link from "next/link";

export default function PrivacyPage() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="sticky top-0 z-30 border-b border-border bg-background/85 backdrop-blur px-4 py-3">
        <Link href="/" className="text-xs text-muted hover:text-gold px-2 py-1 rounded-lg border border-border">
          ← Back to Kus AI
        </Link>
      </header>

      <main className="mx-auto max-w-2xl px-4 py-8 text-sm leading-relaxed space-y-6">
        <h1 className="text-2xl font-bold text-gold">Privacy Policy</h1>
        <p className="text-muted text-xs">Last updated: August 19, 2026</p>

        <section>
          <h2 className="text-lg font-semibold mt-6 mb-2">1. Data We Collect</h2>
          <p>Kus AI Companion (&quot;the App&quot;) collects the following data to provide AI chat, code workspace, and social features:</p>
          <ul className="list-disc pl-5 space-y-1 mt-2">
            <li><strong>Account Data:</strong> Email address and authentication tokens when you sign in via Supabase Auth or GitHub OAuth.</li>
            <li><strong>Chat Prompts & Responses:</strong> All prompts you submit and AI-generated responses are retained to power conversation history, semantic caching, and local model fine-tuning (when you opt in).</li>
            <li><strong>Usage Metrics:</strong> Token consumption counts, model selection, and credit balance events for billing and platform analytics.</li>
            <li><strong>Workspace Files:</strong> Code you create, clone, or upload in the Jyinx IDE is stored in your personal Supabase Storage bucket.</li>
            <li><strong>Connector Credentials:</strong> API tokens you provide for GitHub, Vercel, Supabase, and other third-party services are encrypted (AES-256-GCM) and stored per-user in Supabase.</li>
          </ul>
        </section>

        <section>
          <h2 className="text-lg font-semibold mt-6 mb-2">2. How We Use Your Data</h2>
          <ul className="list-disc pl-5 space-y-1">
            <li>To deliver AI chat responses and agent workflows.</li>
            <li>To train and improve Kus AI&apos;s local models (only if you enable &quot;Help improve Kus AI&quot; in Settings).</li>
            <li>To meter token usage, enforce rate limits, and manage credit billing via Stripe and Hubtel.</li>
            <li>To enable real-time chat in the Sports Clan Nexus bridge.</li>
            <li>To synchronize code across your connected repositories.</li>
          </ul>
        </section>

        <section>
          <h2 className="text-lg font-semibold mt-6 mb-2">3. Data Sharing & Third-Party Subprocessors</h2>
          <p>Your prompts are routed to these third-party model providers based on your model selection:</p>
          <ul className="list-disc pl-5 space-y-1 mt-2">
            <li><strong>Google Gemini</strong> (via Google AI Studio or OpenRouter) — subject to Google&apos;s API data usage policy.</li>
            <li><strong>OpenRouter</strong> — intermediary routing to multiple model providers. Free-tier requests include HTTP-Referer and X-Title attribution headers.</li>
            <li><strong>OpenAI</strong>, <strong>Anthropic</strong>, <strong>Groq</strong>, <strong>Together AI</strong>, <strong>DeepSeek</strong>, <strong>Mistral</strong>, <strong>Cohere</strong>, <strong>Perplexity</strong> — when selected via your personal BYOK key.</li>
            <li><strong>Stripe / Hubtel</strong> — payment processing (we never store your full card or mobile money number).</li>
            <li><strong>Supabase</strong> — cloud database and storage infrastructure.</li>
          </ul>
          <p className="mt-2 text-muted text-xs">
            When you use a personal BYOK (Bring Your Own Key), prompts are sent directly to the selected provider under your own account agreement. Kus AI does not log these requests beyond aggregate token counts.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold mt-6 mb-2">4. Local Model Execution</h2>
          <p>
            When you use Ollama or other local inference engines, prompts never leave your device. No data is transmitted to Kus AI servers for locally-executed requests. Local token metering runs exclusively in your browser&apos;s SQLite/IndexedDB ledger and is never uploaded.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold mt-6 mb-2">5. Data Retention</h2>
          <ul className="list-disc pl-5 space-y-1">
            <li><strong>Chat history</strong> — retained until you delete it or your account is deleted.</li>
            <li><strong>Semantic cache entries</strong> — expire after 30 days unless refreshed by a similar query.</li>
            <li><strong>Token ledger</strong> — retained for the life of your account for billing purposes.</li>
            <li><strong>Deleted accounts</strong> — all personal data, chat history, code vault files, and connector credentials are purged within 7 days.</li>
          </ul>
        </section>

        <section>
          <h2 className="text-lg font-semibold mt-6 mb-2">6. Your Rights</h2>
          <ul className="list-disc pl-5 space-y-1">
            <li><strong>Access:</strong> You can export your data via Settings → Export Data.</li>
            <li><strong>Delete:</strong> You can delete your account and all associated data via Settings → Delete Account. This action is irreversible.</li>
            <li><strong>Opt-out:</strong> Disable &quot;Help improve Kus AI&quot; in Settings to stop sending interaction data for training.</li>
          </ul>
        </section>

        <section>
          <h2 className="text-lg font-semibold mt-6 mb-2">7. Children&apos;s Privacy</h2>
          <p>The App is not intended for users under the age of 13. We do not knowingly collect personal information from children.</p>
        </section>

        <section>
          <h2 className="text-lg font-semibold mt-6 mb-2">8. Changes to This Policy</h2>
          <p>We will notify users of material changes via an in-app banner and update the &quot;Last updated&quot; date above.</p>
        </section>

        <section>
          <h2 className="text-lg font-semibold mt-6 mb-2">9. Contact</h2>
          <p>For privacy inquiries, contact <a href="mailto:privacy@kus-ai.app" className="text-gold underline">privacy@kus-ai.app</a>.</p>
        </section>

        <footer className="pt-8 text-center text-xs text-muted">
          <p>Kus AI Companion · Kus-Lords Production Workflow</p>
        </footer>
      </main>
    </div>
  );
}