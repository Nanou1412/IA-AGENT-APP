/**
 * Engine Module - Main exports
 */

// Main engine
export { 
  handleInboundMessage, 
  handleInboundCallGreeting,
  type EngineInput,
  type EngineOutput,
  type EngineContext,
} from './engine';

// LLM
export { 
  getOpenAIProvider, 
  createOpenAIProvider, 
  isOpenAIConfigured,
  ENGINE_CONFIG,
  OpenAIProvider,
} from './llm';

// Intent Router
export { 
  IntentRouter, 
  createIntentRouter, 
  DEFAULT_INTENTS,
  type IntentRouterConfig,
  type RouteResult,
} from './intent-router';

// Module Runner
export { 
  runModules, 
  registerModule, 
  getModule,
  type ModuleContext,
  type ModuleResult,
  type ModuleHandler,
} from './module-runner';

// Policies
export {
  enforceNeverSayAI,
  checkForAbuse,
  checkForHighRisk,
  checkConfidenceThreshold,
  checkTurnLimit,
  applyInputPolicies,
  applyOutputPolicies,
  checkConfidencePolicy,
  parseTemplateRules,
  getDefaultRules,
  type PolicyResult,
  type TemplateRules,
  type PolicyContext,
} from './policies';

// Adapters
export {
  adaptForChannel,
  adaptForSMS,
  adaptForWhatsApp,
  adaptForVoice,
  type ChannelAdapterResult,
} from './adapters';

// Rate Limiter
export {
  checkRateLimit,
  getRateLimitStatus,
  resetRateLimit,
  clearAllRateLimits,
} from './rate-limiter';
