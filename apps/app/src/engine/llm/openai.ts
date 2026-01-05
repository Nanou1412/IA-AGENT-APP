/**
 * OpenAI LLM Provider Implementation
 * 
 * Implements the LLM provider interface for OpenAI API.
 * Supports intent classification and response generation.
 */

import type {
  LLMProvider,
  LLMProviderConfig,
  ClassifyIntentOptions,
  GenerateResponseOptions,
  IntentClassificationResult,
  ResponseGenerationResult,
  LLMMessage,
} from '@repo/core';

// ============================================================================
// Configuration
// ============================================================================

const OPENAI_API_URL = 'https://api.openai.com/v1/chat/completions';

/**
 * Default engine configuration from environment
 */
export const ENGINE_CONFIG = {
  apiKey: process.env.OPENAI_API_KEY || '',
  defaultModel: process.env.OPENAI_DEFAULT_MODEL || 'gpt-4o',
  lowCostModel: process.env.OPENAI_LOW_COST_MODEL || 'gpt-4o-mini',
  maxOutputTokens: parseInt(process.env.ENGINE_MAX_OUTPUT_TOKENS || '400', 10),
  maxInputTokens: parseInt(process.env.ENGINE_MAX_INPUT_TOKENS || '3000', 10),
  maxTurns: parseInt(process.env.ENGINE_MAX_TURNS || '20', 10),
  rateLimitPerMinute: parseInt(process.env.ENGINE_RATE_LIMIT_PER_MINUTE || '60', 10),
} as const;

// ============================================================================
// Types
// ============================================================================

interface OpenAIMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

interface OpenAIResponse {
  id: string;
  choices: Array<{
    message: {
      content: string;
    };
    finish_reason: string;
  }>;
  usage: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
  model: string;
}

interface IntentClassificationSchema {
  intent: string;
  confidence: number;
  rationale: string;
  suggestedModules?: string[];
}

// ============================================================================
// OpenAI Provider
// ============================================================================

export class OpenAIProvider implements LLMProvider {
  readonly name = 'openai';
  
  private apiKey: string;
  private defaultModel: string;
  private lowCostModel: string;
  private maxRetries: number;
  private timeout: number;
  
  constructor(config: LLMProviderConfig) {
    this.apiKey = config.apiKey;
    this.defaultModel = config.defaultModel;
    this.lowCostModel = config.lowCostModel || config.defaultModel;
    this.maxRetries = config.maxRetries ?? 1;
    this.timeout = config.timeout ?? 30000;
  }
  
  isConfigured(): boolean {
    return !!this.apiKey && this.apiKey.startsWith('sk-');
  }
  
  /**
   * Classify user intent using low-cost model
   */
  async classifyIntent(options: ClassifyIntentOptions): Promise<IntentClassificationResult> {
    const { systemPrompt, intents, conversationHistory, userText, confidenceThreshold = 0.65 } = options;
    
    const classificationPrompt = this.buildClassificationPrompt(systemPrompt, intents, confidenceThreshold);
    
    const messages: OpenAIMessage[] = [
      { role: 'system', content: classificationPrompt },
      ...this.convertMessages(conversationHistory.slice(-5)), // Last 5 messages for context
      { role: 'user', content: userText },
    ];
    
    const response = await this.callOpenAI(messages, this.lowCostModel, {
      temperature: 0.1, // Low temperature for deterministic classification
      maxTokens: 200,
      responseFormat: { type: 'json_object' },
    });
    
    // Parse JSON response
    try {
      const parsed = JSON.parse(response.choices[0]?.message?.content || '{}') as IntentClassificationSchema;
      
      return {
        intent: parsed.intent || 'unknown',
        confidence: typeof parsed.confidence === 'number' ? parsed.confidence : 0,
        rationale: parsed.rationale,
        suggestedModules: parsed.suggestedModules,
      };
    } catch {
      console.error('[openai] Failed to parse intent classification response');
      return {
        intent: 'unknown',
        confidence: 0,
        rationale: 'Failed to parse classification response',
      };
    }
  }
  
  /**
   * Generate a response using default model
   */
  async generateResponse(options: GenerateResponseOptions): Promise<ResponseGenerationResult> {
    const { systemPrompt, conversationHistory, userText, maxOutputTokens = ENGINE_CONFIG.maxOutputTokens, temperature = 0.7 } = options;
    
    const messages: OpenAIMessage[] = [
      { role: 'system', content: systemPrompt },
      ...this.convertMessages(conversationHistory),
      { role: 'user', content: userText },
    ];
    
    const response = await this.callOpenAI(messages, this.defaultModel, {
      temperature,
      maxTokens: maxOutputTokens,
    });
    
    return {
      text: response.choices[0]?.message?.content || '',
      inputTokens: response.usage?.prompt_tokens || 0,
      outputTokens: response.usage?.completion_tokens || 0,
      modelUsed: response.model || this.defaultModel,
      finishReason: response.choices[0]?.finish_reason,
    };
  }
  
  // ============================================================================
  // Private Methods
  // ============================================================================
  
  private buildClassificationPrompt(systemPrompt: string, intents: string[], confidenceThreshold: number): string {
    return `You are an intent classification system. Your task is to classify the user's message into one of the allowed intents.

${systemPrompt}

ALLOWED INTENTS:
${intents.map(i => `- ${i}`).join('\n')}
- unknown (use when no intent matches or confidence is below ${confidenceThreshold})

RULES:
1. Return ONLY valid JSON with this exact structure: {"intent": "...", "confidence": 0.0-1.0, "rationale": "...", "suggestedModules": [...]}
2. confidence must be a number between 0 and 1
3. If unsure, use intent "unknown" with low confidence
4. suggestedModules is optional - include if the intent suggests specific modules to use

Classify the user's message:`;
  }
  
  private convertMessages(messages: LLMMessage[]): OpenAIMessage[] {
    return messages
      .filter(m => m.role !== 'tool') // Skip tool messages for now
      .map(m => ({
        role: m.role === 'system' ? 'system' : m.role === 'assistant' ? 'assistant' : 'user',
        content: m.content,
      }));
  }
  
  private async callOpenAI(
    messages: OpenAIMessage[],
    model: string,
    options: {
      temperature?: number;
      maxTokens?: number;
      responseFormat?: { type: 'json_object' | 'text' };
    }
  ): Promise<OpenAIResponse> {
    const { temperature = 0.7, maxTokens = ENGINE_CONFIG.maxOutputTokens, responseFormat } = options;
    
    const body: Record<string, unknown> = {
      model,
      messages,
      temperature,
      max_tokens: maxTokens,
    };
    
    if (responseFormat) {
      body.response_format = responseFormat;
    }
    
    let lastError: Error | null = null;
    
    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), this.timeout);
        
        const response = await fetch(OPENAI_API_URL, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${this.apiKey}`,
          },
          body: JSON.stringify(body),
          signal: controller.signal,
        });
        
        clearTimeout(timeoutId);
        
        if (!response.ok) {
          const errorBody = await response.text();
          throw new Error(`OpenAI API error ${response.status}: ${errorBody}`);
        }
        
        return await response.json() as OpenAIResponse;
        
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        console.error(`[openai] Attempt ${attempt + 1} failed:`, lastError.message);
        
        if (attempt < this.maxRetries) {
          await new Promise(resolve => setTimeout(resolve, 1000 * (attempt + 1)));
        }
      }
    }
    
    throw lastError || new Error('OpenAI API call failed');
  }
}

// ============================================================================
// Factory & Singleton
// ============================================================================

let defaultProvider: OpenAIProvider | null = null;

/**
 * Get the default OpenAI provider instance
 */
export function getOpenAIProvider(): OpenAIProvider {
  if (!defaultProvider) {
    defaultProvider = new OpenAIProvider({
      apiKey: ENGINE_CONFIG.apiKey,
      defaultModel: ENGINE_CONFIG.defaultModel,
      lowCostModel: ENGINE_CONFIG.lowCostModel,
    });
  }
  return defaultProvider;
}

/**
 * Create a custom OpenAI provider with specific config
 */
export function createOpenAIProvider(config: Partial<LLMProviderConfig>): OpenAIProvider {
  return new OpenAIProvider({
    apiKey: config.apiKey || ENGINE_CONFIG.apiKey,
    defaultModel: config.defaultModel || ENGINE_CONFIG.defaultModel,
    lowCostModel: config.lowCostModel || ENGINE_CONFIG.lowCostModel,
    maxRetries: config.maxRetries,
    timeout: config.timeout,
  });
}

/**
 * Check if OpenAI is configured
 */
export function isOpenAIConfigured(): boolean {
  return getOpenAIProvider().isConfigured();
}
