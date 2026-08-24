/**
 * Universal AI Router — public surface.
 *
 *   import { aiGateway } from "@/server/ai-gateway";
 *   const res = await aiGateway.chat.completions.create({ model, messages });
 *
 *   import { createVirtualKey } from "@/server/ai-gateway";
 */
export { createAiGateway, type AiGateway, type GatewayCallOptions } from "./client";
export { resolveGatewayConfig, GATEWAY_PROVIDERS, type GatewayConfig } from "./config";
export { withRetry, isRetryableStatus, isRateLimit } from "./retry";
export { estimateUsd } from "./pricing";
export { createTelemetry, type TelemetryWriter } from "./telemetry";
export {
  createVirtualKey,
  listVirtualKeys,
  getVirtualKeyForCall,
  recordVirtualKeyUsage,
  revokeVirtualKey,
  type VirtualKey,
  type CreateVirtualKeyInput,
} from "./virtual-keys";
export type * from "./types";

// Default singleton using the current environment.
import { resolveGatewayConfig } from "./config";
import { createAiGateway } from "./client";
export const aiGateway = createAiGateway(resolveGatewayConfig());