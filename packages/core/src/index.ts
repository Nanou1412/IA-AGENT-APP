// Core interfaces for IA Agent App
// These will be expanded as tools are implemented

export type { Tool, ToolConfig, ToolResult } from './tools';
export type { Agent, AgentConfig } from './agent';
export type { Template, TemplateConfig } from './template';

// Internal Token utilities (SECURITY: HMAC signed tokens for server-to-server communication)
export {
  signInternalToken,
  verifyInternalToken,
  extractTokenFromRequest,
  extractTokenFromQuery,
  extractTokenFromUrl,
} from './internal-token';
export type {
  InternalTokenPayload,
  TokenVerificationResult,
  SignTokenOptions,
} from './internal-token';

// LLM Provider abstraction (Phase 6)
export type {
  LLMMessageRole,
  LLMMessage,
  IntentClassificationResult,
  ResponseGenerationResult,
  ClassifyIntentOptions,
  GenerateResponseOptions,
  LLMProviderConfig,
  LLMProvider,
  LLMProviderFactory,
  LLMFunctionDef,
  LLMFunctionCall,
  ChatCompletionWithFunctionsResult,
} from './llm';
export { registerLLMProvider, getLLMProvider, listLLMProviders } from './llm';
