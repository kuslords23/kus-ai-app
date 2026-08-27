/**
 * Standalone entry for local/cron runs outside Next.js.
 * Usage:
 *   export NEXT_PUBLIC_SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=...
 *   npx tsx training-worker/run.ts
 */
async function main() {
  const { runTrainingTick } = await import("../src/lib/training-plane/orchestrator");
  const result = await runTrainingTick();
  console.log(JSON.stringify(result, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
