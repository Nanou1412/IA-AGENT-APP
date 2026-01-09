// Core interfaces for IA Agent App
// These will be expanded as tools are implemented

export type { Tool, ToolConfig, ToolResult } from './tools';
export type { Agent, AgentConfig } from './agent';
export type { Template, TemplateConfig } from './template';

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
