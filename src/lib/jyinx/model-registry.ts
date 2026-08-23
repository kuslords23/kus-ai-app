export type JyinxModel = {
  id: string;
  label: string;
  tier: "Auto" | "Free" | "Fast" | "Balanced" | "Flagship";
  contextWindow: number;
};

export const JYINX_MODELS: JyinxModel[] = [
  { id: "kus-ai/royal", label: "Kus AI", tier: "Auto", contextWindow: 128_000 },
  { id: "kus-ai/kus-code", label: "Kus Code / AI 3", tier: "Auto", contextWindow: 256_000 },
  { id: "openrouter/auto", label: "OpenRouter Auto", tier: "Auto", contextWindow: 128_000 },
  { id: "openrouter/free", label: "OpenRouter Free", tier: "Free", contextWindow: 128_000 },
  { id: "meta-llama/llama-3-8b-instruct:free", label: "Llama 3 8B (free)", tier: "Free", contextWindow: 8_192 },
  { id: "qwen/qwen3-coder:free", label: "Qwen 3 Coder", tier: "Free", contextWindow: 32_768 },
  { id: "google/gemma-4-31b-it:free", label: "Gemma 4 31B", tier: "Free", contextWindow: 32_768 },
  { id: "openai/gpt-oss-20b:free", label: "GPT-OSS 20B", tier: "Free", contextWindow: 131_072 },
  { id: "nvidia/nemotron-3-ultra-550b-a55b:free", label: "Nemotron Ultra", tier: "Free", contextWindow: 32_768 },
  { id: "meta-llama/llama-3.3-70b-instruct:free", label: "Llama 3.3 70B", tier: "Free", contextWindow: 131_072 },
  { id: "deepseek/deepseek-r1:free", label: "DeepSeek R1", tier: "Free", contextWindow: 64_000 },
  { id: "mistralai/mistral-small-3.1-24b-instruct:free", label: "Mistral Small 3.1", tier: "Free", contextWindow: 128_000 },
  { id: "qwen/qwen-2.5-coder-32b-instruct:free", label: "Qwen 2.5 Coder", tier: "Free", contextWindow: 32_768 },
  { id: "microsoft/phi-4-reasoning-plus:free", label: "Phi 4 Reasoning", tier: "Free", contextWindow: 32_768 },
  { id: "google/gemma-3-27b-it:free", label: "Gemma 3 27B", tier: "Free", contextWindow: 128_000 },
  { id: "openai/gpt-4.1-nano", label: "GPT-4.1 Nano", tier: "Fast", contextWindow: 1_000_000 },
  { id: "google/gemini-2.5-flash", label: "Gemini 2.5 Flash", tier: "Fast", contextWindow: 1_000_000 },
  { id: "mistralai/ministral-8b", label: "Ministral 8B", tier: "Fast", contextWindow: 128_000 },
  { id: "qwen/qwen3-30b-a3b", label: "Qwen 3 30B", tier: "Fast", contextWindow: 32_768 },
  { id: "anthropic/claude-3.5-haiku", label: "Claude 3.5 Haiku", tier: "Fast", contextWindow: 200_000 },
  { id: "openai/gpt-4.1-mini", label: "GPT-4.1 Mini", tier: "Balanced", contextWindow: 1_000_000 },
  { id: "anthropic/claude-sonnet-4", label: "Claude Sonnet 4", tier: "Balanced", contextWindow: 200_000 },
  { id: "google/gemini-2.5-pro", label: "Gemini 2.5 Pro", tier: "Balanced", contextWindow: 1_000_000 },
  { id: "deepseek/deepseek-chat-v3-0324", label: "DeepSeek V3", tier: "Balanced", contextWindow: 64_000 },
  { id: "anthropic/claude-opus-4", label: "Claude Opus 4", tier: "Flagship", contextWindow: 200_000 },
  { id: "openai/o3", label: "OpenAI o3", tier: "Flagship", contextWindow: 200_000 },
  { id: "openai/gpt-4.1", label: "GPT-4.1", tier: "Flagship", contextWindow: 1_000_000 },
  { id: "x-ai/grok-4", label: "Grok 4", tier: "Flagship", contextWindow: 256_000 },
];

export const DEFAULT_JYINX_MODEL = JYINX_MODELS[0];

export function getJyinxModel(id: string): JyinxModel | undefined {
  return JYINX_MODELS.find((model) => model.id === id);
}
