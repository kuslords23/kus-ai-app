/**
 * Shared Nexus chat constants.
 *
 * Lives OUTSIDE any server-only module so both the client chat mirror and the
 * server bridge can import it without dragging `next/headers` / Supabase SSR
 * into the client bundle (which would fail the Vercel production build).
 */

/** The table both Nexus and Jyinx read/write for community chat. */
export const NEXUS_CHAT_TABLE = "nexus_chat_messages";
/** Realtime channel name reused across sub-apps. */
export const NEXUS_CHAT_CHANNEL = "nexus-chat";