/**
 * LLM Provider Interface - Provider-agnostic abstraction layer
 * 
 * This interface allows the engine to work with any LLM provider
 * (OpenAI, Anthropic, Azure OpenAI, etc.) without code changes.
 */

// ============================================================================
// Types
// ============================================================================

/**
 * Role of a message in the conversation
 */
export type LLMMessageRole = 'system' | 'user' | 'assistant' | 'tool';

/**
 * A single message in an LLM conversation
 */
export interface LLMMessage {
  role: LLMMessageRole;
  content: string;
  name?: string; // For tool messages
}

/**
 * Intent classification result
 */
export interface IntentClassificationResult {
  intent: string;
  confidence: number;
  rationale?: string;
  suggestedModules?: string[];
}

/**
 * Response generation result
 */
export interface ResponseGenerationResult {
  text: string;
  inputTokens: number;
  outputTokens: number;
  modelUsed: string;
  finishReason?: string;
}

/**
 * Intent definition with optional description and examples
 */
export interface IntentDef {
  name: string;
  description?: string;
  examples?: string[];
}

/**
 * Options for intent classification
 */
export interface ClassifyIntentOptions {
  systemPrompt: string;
  intents: string[];
  intentDefinitions?: Record<string, { description?: string; examples?: string[] }>;
  conversationHistory: LLMMessage[];
  userText: string;
  confidenceThreshold?: number;
}

/**
 * Options for response generation
 */
export interface GenerateResponseOptions {
  systemPrompt: string;
  conversationHistory: LLMMessage[];
  userText: string;
  maxOutputTokens?: number;
  temperature?: number;
}

/**
 * LLM Provider configuration
 */
export interface LLMProviderConfig {
  apiKey: string;
  defaultModel: string;
  lowCostModel?: string;
  maxRetries?: number;
  timeout?: number;
}

// ============================================================================
// Provider Interface
// ============================================================================

/**
 * LLM Provider interface - implement this for each provider
 */
export interface LLMProvider {
  /**
   * Provider name for logging/debugging
   */
  readonly name: string;
  
  /**
   * Classify user intent from their message
   * Uses low-cost model if available
   */
  classifyIntent(options: ClassifyIntentOptions): Promise<IntentClassificationResult>;
  
  /**
   * Generate a response to the user
   * Uses default (higher quality) model
   */
  generateResponse(options: GenerateResponseOptions): Promise<ResponseGenerationResult>;
  
  /**
   * Check if the provider is configured and ready
   */
  isConfigured(): boolean;
}

// ============================================================================
// Factory
// ============================================================================

/**
 * LLM Provider factory function type
 */
export type LLMProviderFactory = (config: LLMProviderConfig) => LLMProvider;

/**
 * Registry of LLM providers
 */
const providerRegistry: Record<string, LLMProviderFactory> = {};

/**
 * Register an LLM provider
 */
export function registerLLMProvider(name: string, factory: LLMProviderFactory): void {
  providerRegistry[name] = factory;
}

/**
 * Get an LLM provider by name
 */
export function getLLMProvider(name: string, config: LLMProviderConfig): LLMProvider {
  const factory = providerRegistry[name];
  if (!factory) {
    throw new Error(`LLM provider '${name}' not registered. Available: ${Object.keys(providerRegistry).join(', ')}`);
  }
  return factory(config);
}

/**
 * List available LLM providers
 */
export function listLLMProviders(): string[] {
  return Object.keys(providerRegistry);
}
