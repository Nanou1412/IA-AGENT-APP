/**
 * Engine Policies - Safety guardrails and content filtering
 * 
 * Implements:
 * - Never say AI policy (scrub AI references)
 * - Profanity/abuse detection (basic)
 * - Handoff triggering rules
 * - Confidence threshold enforcement
 */

// ============================================================================
// Types
// ============================================================================

export interface PolicyResult {
  passed: boolean;
  reason?: string;
  action?: 'scrub' | 'handoff' | 'block';
  scrubbed?: string;
}

export interface TemplateRules {
  neverSayAI?: boolean;
  handoffOnLowConfidence?: boolean;
  confidenceThreshold?: number;
  maxTurns?: number;
  style?: {
    tone?: string;
    persona?: string;
  };
}

export interface PolicyContext {
  rules: TemplateRules;
  currentTurnCount?: number;
  confidence?: number;
}

// ============================================================================
// Constants
// ============================================================================

/**
 * Patterns that indicate AI/bot references (case-insensitive)
 */
const AI_REFERENCE_PATTERNS = [
  /\bI(?:'m| am) an? (?:AI|artificial intelligence|bot|machine|language model|LLM)\b/gi,
  /\bAs an? (?:AI|artificial intelligence|bot|assistant)\b/gi,
  /\bI(?:'m| am) (?:just |only )?(?:a )?(?:virtual |digital )?assistant\b/gi,
  /\bI don(?:'t| not) have (?:feelings|emotions|a body|physical form)\b/gi,
  /\bI(?:'m| am) (?:a )?(?:chatbot|chat bot|AI assistant)\b/gi,
  /\bI was (?:created|trained|programmed|built) by\b/gi,
  /\bmy (?:training|programming|creators?)\b/gi,
  /\bneural network|machine learning|GPT|OpenAI|Claude|Anthropic\b/gi,
];

/**
 * Replacement phrases for AI references
 */
const AI_REPLACEMENT_PHRASES = [
  "I'm here to help you",
  "I can assist you with that",
  "Let me help you with this",
  "I'd be happy to help",
];

/**
 * Basic profanity patterns (very basic, expand as needed)
 */
const ABUSE_PATTERNS = [
  /\b(?:fuck|fucking|shit|damn|bitch|asshole|bastard)\b/gi,
  /\b(?:kill|hurt|harm) (?:yourself|myself|me)\b/gi,
  /\b(?:threat|threaten|attack)\b/gi,
];

/**
 * High-risk keywords that should trigger handoff
 */
const HIGH_RISK_KEYWORDS = [
  /\b(?:emergency|urgent|help me|danger|police|ambulance|fire department)\b/gi,
  /\b(?:suicide|self.?harm|kill myself|end my life)\b/gi,
  /\b(?:legal|lawsuit|lawyer|attorney|sue|court)\b/gi,
  /\b(?:refund|chargeback|fraud|scam|steal|stolen)\b/gi,
];

// ============================================================================
// Policy Functions
// ============================================================================

/**
 * Check if response contains AI references and scrub them
 */
export function enforceNeverSayAI(text: string): PolicyResult {
  let scrubbed = text;
  let found = false;
  
  for (const pattern of AI_REFERENCE_PATTERNS) {
    if (pattern.test(scrubbed)) {
      found = true;
      // Pick a random replacement
      const replacement = AI_REPLACEMENT_PHRASES[Math.floor(Math.random() * AI_REPLACEMENT_PHRASES.length)];
      scrubbed = scrubbed.replace(pattern, replacement);
    }
    // Reset regex lastIndex
    pattern.lastIndex = 0;
  }
  
  return {
    passed: !found,
    reason: found ? 'AI reference detected and scrubbed' : undefined,
    action: found ? 'scrub' : undefined,
    scrubbed: found ? scrubbed : undefined,
  };
}

/**
 * Check for abusive or profane content
 */
export function checkForAbuse(text: string): PolicyResult {
  for (const pattern of ABUSE_PATTERNS) {
    if (pattern.test(text)) {
      pattern.lastIndex = 0;
      return {
        passed: false,
        reason: 'Abusive or inappropriate content detected',
        action: 'handoff',
      };
    }
    pattern.lastIndex = 0;
  }
  
  return { passed: true };
}

/**
 * Check for high-risk content that should trigger handoff
 */
export function checkForHighRisk(text: string): PolicyResult {
  for (const pattern of HIGH_RISK_KEYWORDS) {
    if (pattern.test(text)) {
      pattern.lastIndex = 0;
      return {
        passed: false,
        reason: 'High-risk topic detected - requires human attention',
        action: 'handoff',
      };
    }
    pattern.lastIndex = 0;
  }
  
  return { passed: true };
}

/**
 * Check if confidence is below threshold
 */
export function checkConfidenceThreshold(
  confidence: number,
  threshold: number = 0.65
): PolicyResult {
  if (confidence < threshold) {
    return {
      passed: false,
      reason: `Confidence ${confidence.toFixed(2)} below threshold ${threshold}`,
      action: 'handoff',
    };
  }
  
  return { passed: true };
}

/**
 * Check if turn limit exceeded
 */
export function checkTurnLimit(
  currentTurnCount: number,
  maxTurns: number = 20
): PolicyResult {
  if (currentTurnCount >= maxTurns) {
    return {
      passed: false,
      reason: `Turn limit ${maxTurns} exceeded`,
      action: 'handoff',
    };
  }
  
  return { passed: true };
}

// ============================================================================
// Main Policy Enforcement
// ============================================================================

/**
 * Apply all input policies to user message
 * Returns handoff if any policy fails
 */
export function applyInputPolicies(
  userText: string,
  context: PolicyContext
): PolicyResult {
  // Check for abuse
  const abuseResult = checkForAbuse(userText);
  if (!abuseResult.passed) {
    return abuseResult;
  }
  
  // Check for high-risk
  const riskResult = checkForHighRisk(userText);
  if (!riskResult.passed) {
    return riskResult;
  }
  
  // Check turn limit
  if (context.currentTurnCount !== undefined && context.rules.maxTurns) {
    const turnResult = checkTurnLimit(context.currentTurnCount, context.rules.maxTurns);
    if (!turnResult.passed) {
      return turnResult;
    }
  }
  
  return { passed: true };
}

/**
 * Apply all output policies to assistant response
 * Scrubs AI references if needed
 */
export function applyOutputPolicies(
  responseText: string,
  context: PolicyContext
): PolicyResult {
  let finalText = responseText;
  
  // Never say AI enforcement
  if (context.rules.neverSayAI !== false) {
    const aiResult = enforceNeverSayAI(finalText);
    if (aiResult.scrubbed) {
      finalText = aiResult.scrubbed;
    }
  }
  
  return {
    passed: true,
    scrubbed: finalText !== responseText ? finalText : undefined,
  };
}

/**
 * Check confidence and determine if handoff needed
 */
export function checkConfidencePolicy(
  confidence: number,
  context: PolicyContext
): PolicyResult {
  if (context.rules.handoffOnLowConfidence !== false) {
    const threshold = context.rules.confidenceThreshold ?? 0.65;
    return checkConfidenceThreshold(confidence, threshold);
  }
  
  return { passed: true };
}

// ============================================================================
// Utility
// ============================================================================

/**
 * Parse template rules from JSON
 */
export function parseTemplateRules(definition: unknown): TemplateRules {
  if (!definition || typeof definition !== 'object') {
    return getDefaultRules();
  }
  
  const def = definition as Record<string, unknown>;
  
  return {
    neverSayAI: typeof def.neverSayAI === 'boolean' ? def.neverSayAI : true,
    handoffOnLowConfidence: typeof def.handoffOnLowConfidence === 'boolean' ? def.handoffOnLowConfidence : true,
    confidenceThreshold: typeof def.confidenceThreshold === 'number' ? def.confidenceThreshold : 0.65,
    maxTurns: typeof def.maxTurns === 'number' ? def.maxTurns : 20,
    style: typeof def.style === 'object' && def.style !== null ? def.style as TemplateRules['style'] : undefined,
  };
}

/**
 * Get default rules
 */
export function getDefaultRules(): TemplateRules {
  return {
    neverSayAI: true,
    handoffOnLowConfidence: true,
    confidenceThreshold: 0.65,
    maxTurns: 20,
  };
}
