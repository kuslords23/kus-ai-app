export class OpenRouterClient {
  private readonly API_URL = 'https://openrouter.ai/api/v1/chat/completions';
  public static readonly MODEL_MAP: Record<string, { name: string; category: string }> = {
    // Free Tier (10 models)
    'gemma-4-31b-it:free': { name: 'Gemma 4B', category: 'free' },
    // Cheap Tier (5 models)
    'nemotron-3-nano-30b-a3b:free': { name: 'Nemotron Nano', category: 'cheap' },
    // Mid-Tier (4 models)
    'mistral-large': { name: 'Mixtral Large', category: 'mid' },
    // Premium Tier (5 models)
    'nvidia/nemotron-3-ultra-550b-a55b:free': { name: 'Nemotron Ultra', category: 'premium' },
    // Additional free models
    'google/gemma-4-31b-it:free': { name: 'Gemma 4B', category: 'free' },
    'openai/gpt-oss-20b:free': { name: 'GPT-OSS', category: 'free' },
    // High-reliability free endpoints
    'qwen/qwen3-coder:free': { name: 'Qwen 3-Coder', category: 'free' }
  };

  async generate(prompt: string, modelName: string) {
    const model = OpenRouterClient.MODEL_MAP[modelName];
    if (!model) {
      throw new Error(`Model "${modelName}" not found in model map`);
    }

    const body = {
      model: modelName,
      messages: [{ role: 'user', content: prompt }],
      stream: true
    };

    const response = await fetch(this.API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });

    if (!response.ok) {
      throw new Error(`OpenRouter API error: ${response.status}`);
    }

    return response.text();
  }

  async listModels() {
    const response = await fetch(this.API_URL, {
      method: 'GET',
      headers: { 'Accept': 'application/json' }
    });
    return response.json();
  }
}

export const openRouter = new OpenRouterClient();

export const modelRegistry = new Map(Object.entries(OpenRouterClient.MODEL_MAP));

export const getModel = (modelId: string) => {
  return modelRegistry.get(modelId);
};