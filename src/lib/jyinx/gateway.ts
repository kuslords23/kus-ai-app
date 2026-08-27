import { HybridStorageContext } from './hybrid-storage';
import { HybridStorageAdapter } from './hybrid-storage-adapter';

export type TokenUsageRecord = {
  modelName: string;
  inputTokens: number;
  outputTokens: number;
  costAmount: number;
  timestamp: string;
  totalTokens: number;
  status: string;
};

export class ModelGateway {
  private storageAdapter: HybridStorageContext;
  private readonly MODEL_CONFIGURATIONS: Record<string, any> = {
    'llama3-ddof': {
      name: 'Llama 3 DD-Off',
      type: 'local',
      endpoint: 'http://localhost:11434/api/generate',
      auth: 'ollamaJustin',
      maxInputTokens: 4096,
      maxOutputTokens: 8192,
    },
    'deepseek-v2': {
      name: 'DeepSeek v2',
      type: 'cloud',
      endpoint: 'https://api.deepseek.com/v1/generate',
      auth: null,
      maxInputTokens: 8192,
      maxOutputTokens: 6144,
    },
    'mistral-large': {
      name: 'Mixtral Large',
      type: 'cloud',
      endpoint: 'https://api.mistral.ai/v1/generate',
      auth: null,
      maxInputTokens: 8192,
      maxOutputTokens: 6144,
    },
  };

  constructor() {
    this.storageAdapter = new HybridStorageAdapter();
  }

  /**
   * Route incoming model requests to the appropriate backend
   * @param modelName - Name of the model to use
   * @param content - Raw model input
   * @returns Generated response with token metrics
   */
  async routeRequest(modelName: string, content: string): Promise<TokenUsageResponse> {
    const config = this.MODEL_CONFIGURATIONS[modelName];
    if (!config) {
      throw new Error(`Unknown model: ${modelName}`);
    }

    try {
      // 1. Validate input
      if (content.length > config.maxInputTokens) {
        throw new Error(`Input too long (${content.length} > ${config.maxInputTokens})`);
      }

      // 2. Prepare request payload
      const payload = {
        modelName,
        content,
        timestamp: new Date().toISOString(),
        requestId: this.generateRequestId(),
      };

      // 3. Send to backend (local or cloud)
      const response = await this.sendToBackend(config, payload);

      // 4. Calculate token usage
      const usage = this.calculateTokenUsage(payload, response);

      // 5. Persist to ledger
      await this.storageAdapter.writeData(
        `model:${modelName}`,
        usage
      );

      return {
        success: true,
        modelName,
        response,
        usage,
        timestamp: response.timestamp,
      };
    } catch (error) {
      // Log error but don't fail the request
      console.error(`Gateway error for model ${modelName}:`, error);
      throw new Error(
        `Failed to process model request: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /**
   * Calculate token usage from response
   */
  private calculateTokenUsage(payload: any, response: any): TokenUsageRecord {
    // Simplified token calculation - in reality this would parse the response
    // and extract actual token counts
    const inputTokens = payload.content.length;
    const outputTokens = response.outputTokens || 0;
    const totalTokens = inputTokens + outputTokens;

    return {
      modelName: payload.modelName,
      inputTokens,
      outputTokens,
      costAmount: totalTokens * 0.001, // Simplified cost calculation
      timestamp: response.timestamp,
      totalTokens,
      status: 'completed',
    };
  }

  /**
   * Send request to backend (local or cloud)
   */
  private async sendToBackend(config: any, payload: any): Promise<any> {
    if (config.type === 'local') {
      // Local endpoint (e.g., Ollama)
      const endpoint = config.endpoint;
      const auth = config.auth || '';
      
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': auth ? `Bearer ${auth}` : '',
        },
        body: JSON.stringify(payload),
      });
      
      if (!response.ok) {
        throw new Error(`Backend error: ${response.status}`);
      }
      
      return await response.json();
    } else {
      // Cloud endpoint (e.g., OpenAI, DeepSeek)
      const endpoint = config.endpoint;
      const auth = config.auth || '';
      
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': auth ? `Bearer ${auth}` : '',
        },
        body: JSON.stringify(payload),
      });
      
      if (!response.ok) {
        throw new Error(`Cloud backend error: ${response.status}`);
      }
      
      return await response.json();
    }
  }

  /**
   * Generate unique request IDs
   */
  private generateRequestId(): string {
    return 'req_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
  }

  /**
   * Get model configuration
   */
  getModelConfig(modelName: string): any {
    return this.MODEL_CONFIGURATIONS[modelName] || {}
  }

  /**
   * Health check - verify database connectivity
   */
  async healthCheck(): Promise<boolean> {
    try {
      await this.storageAdapter.readData('test_key');
      return true;
    } catch (error) {
      console.error('Health check failed:', error);
      return false;
    }
  }
}

export class TokenUsageResponse {
  success: boolean = false;
  modelName: string = '';
  response: any = null;
  usage: TokenUsageRecord = {
    modelName: '',
    inputTokens: 0,
    outputTokens: 0,
    costAmount: 0,
    timestamp: '',
    totalTokens: 0,
    status: '',
  };
  timestamp: string = '';
  error?: string;
}