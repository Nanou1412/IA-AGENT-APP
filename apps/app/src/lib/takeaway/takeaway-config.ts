/**
 * Takeaway Order Configuration Types and Validation
 * 
 * Defines the structure of takeawayConfig stored in OrgSettings.
 * Used by the takeaway_order engine module.
 * 
 * This is industry-agnostic - all business-specific copy should be
 * configured via templates, not hardcoded.
 */

// ============================================================================
// Types
// ============================================================================

export interface ConfirmationConfig {
  /** Method for confirmation: explicit_yes requires customer to reply YES */
  method: 'explicit_yes' | 'implicit';
  /** Words that count as YES */
  yesWords: string[];
  /** Words that count as NO (triggers cancel/handoff) */
  noWords: string[];
  /** Minutes until pending confirmation expires */
  expiresMinutes: number;
}

export interface NotificationsConfig {
  /** Send SMS notification to business */
  notifyBySms: boolean;
  /** Send WhatsApp notification to business */
  notifyByWhatsApp: boolean;
  /** Business phone number for notifications (can be same as handoffSmsTo) */
  notifyTo: string | null;
}

export interface DraftConfig {
  /** Minutes until draft order expires if not confirmed */
  expireMinutes: number;
}

export interface TemplatesConfig {
  /** Message sent after order confirmed */
  customerConfirmationText: string;
  /** Message asking for confirmation with summary */
  customerNeedConfirmationText: string;
  /** Message when order expires */
  customerExpiredText: string;
  /** Message when items are unclear */
  customerClarificationText: string;
  /** Message when order is canceled */
  customerCanceledText: string;
  /** Template for business notification */
  businessNotificationText: string;
}

export interface TakeawayConfig {
  /** Whether takeaway ordering is enabled for this org */
  enabled: boolean;
  /** Default pickup mode: 'asap' or 'time' (ask for specific time) */
  defaultPickupMode: 'asap' | 'time';
  /** Minimum notice in minutes for pickup */
  minNoticeMinutes: number;
  /** Maximum items per order */
  maxItems: number;
  /** Maximum clarification questions before handoff */
  maxClarificationQuestions: number;
  /** Require customer name */
  requireName: boolean;
  /** Require customer phone (usually already have it from SMS/WhatsApp) */
  requirePhone: boolean;
  /** Default quantity when not specified */
  defaultQuantity: number;
  /** Confirmation settings */
  confirmation: ConfirmationConfig;
  /** Business notification settings */
  notifications: NotificationsConfig;
  /** Draft expiry settings */
  draft: DraftConfig;
  /** Message templates */
  templates: TemplatesConfig;
}

// ============================================================================
// Default Values (English - can be overridden per org)
// ============================================================================

export const DEFAULT_CONFIRMATION_CONFIG: ConfirmationConfig = {
  method: 'explicit_yes',
  yesWords: ['YES', 'Y', 'CONFIRM', 'OK', 'YEP', 'YEAH'],
  noWords: ['NO', 'N', 'CANCEL', 'NEVERMIND', 'STOP'],
  expiresMinutes: 10,
};

export const DEFAULT_NOTIFICATIONS_CONFIG: NotificationsConfig = {
  notifyBySms: true,
  notifyByWhatsApp: false,
  notifyTo: null, // Must be configured per org
};

export const DEFAULT_DRAFT_CONFIG: DraftConfig = {
  expireMinutes: 30,
};

export const DEFAULT_TEMPLATES_CONFIG: TemplatesConfig = {
  customerConfirmationText: 
    "Thanks! Your order has been received and we're preparing it now. " +
    "Order #{orderId}\n" +
    "Pickup: {pickupTime}\n" +
    "We'll have it ready for you!",
  customerNeedConfirmationText:
    "Here's your order summary:\n\n" +
    "{orderSummary}\n\n" +
    "Pickup: {pickupTime}\n\n" +
    "Reply YES to confirm or NO to cancel.",
  customerExpiredText:
    "Your order has expired. Please start a new order when you're ready.",
  customerClarificationText:
    "I'm not sure I understood that. Could you please clarify: {question}",
  customerCanceledText:
    "Your order has been canceled. Let us know if you'd like to start a new order.",
  businessNotificationText:
    "📦 NEW ORDER #{orderId}\n" +
    "Customer: {customerName} ({customerPhone})\n" +
    "Pickup: {pickupTime}\n" +
    "Items:\n{itemsList}\n" +
    "{notes}",
};

export const DEFAULT_TAKEAWAY_CONFIG: TakeawayConfig = {
  enabled: false,
  defaultPickupMode: 'asap',
  minNoticeMinutes: 20,
  maxItems: 30,
  maxClarificationQuestions: 3,
  requireName: true,
  requirePhone: true,
  defaultQuantity: 1,
  confirmation: DEFAULT_CONFIRMATION_CONFIG,
  notifications: DEFAULT_NOTIFICATIONS_CONFIG,
  draft: DEFAULT_DRAFT_CONFIG,
  templates: DEFAULT_TEMPLATES_CONFIG,
};

// ============================================================================
// Parsing / Validation
// ============================================================================

/**
 * Parse and validate takeawayConfig from JSON
 * Returns default config if invalid
 */
export function parseTakeawayConfig(configJson: unknown): TakeawayConfig {
  if (!configJson || typeof configJson !== 'object') {
    return DEFAULT_TAKEAWAY_CONFIG;
  }

  const config = configJson as Record<string, unknown>;

  return {
    enabled: typeof config.enabled === 'boolean' ? config.enabled : false,
    defaultPickupMode: parsePickupMode(config.defaultPickupMode),
    minNoticeMinutes: parsePositiveInt(config.minNoticeMinutes, 20),
    maxItems: parsePositiveInt(config.maxItems, 30),
    maxClarificationQuestions: parsePositiveInt(config.maxClarificationQuestions, 3),
    requireName: typeof config.requireName === 'boolean' ? config.requireName : true,
    requirePhone: typeof config.requirePhone === 'boolean' ? config.requirePhone : true,
    defaultQuantity: parsePositiveInt(config.defaultQuantity, 1),
    confirmation: parseConfirmationConfig(config.confirmation),
    notifications: parseNotificationsConfig(config.notifications),
    draft: parseDraftConfig(config.draft),
    templates: parseTemplatesConfig(config.templates),
  };
}

function parsePickupMode(value: unknown): 'asap' | 'time' {
  if (value === 'time') return 'time';
  return 'asap';
}

function parsePositiveInt(value: unknown, defaultValue: number): number {
  if (typeof value === 'number' && value > 0 && Number.isInteger(value)) {
    return value;
  }
  return defaultValue;
}

function parseConfirmationConfig(config: unknown): ConfirmationConfig {
  if (!config || typeof config !== 'object') {
    return DEFAULT_CONFIRMATION_CONFIG;
  }

  const c = config as Record<string, unknown>;

  return {
    method: c.method === 'implicit' ? 'implicit' : 'explicit_yes',
    yesWords: parseStringArray(c.yesWords, DEFAULT_CONFIRMATION_CONFIG.yesWords),
    noWords: parseStringArray(c.noWords, DEFAULT_CONFIRMATION_CONFIG.noWords),
    expiresMinutes: parsePositiveInt(c.expiresMinutes, 10),
  };
}

function parseNotificationsConfig(config: unknown): NotificationsConfig {
  if (!config || typeof config !== 'object') {
    return DEFAULT_NOTIFICATIONS_CONFIG;
  }

  const c = config as Record<string, unknown>;

  return {
    notifyBySms: typeof c.notifyBySms === 'boolean' ? c.notifyBySms : true,
    notifyByWhatsApp: typeof c.notifyByWhatsApp === 'boolean' ? c.notifyByWhatsApp : false,
    notifyTo: typeof c.notifyTo === 'string' ? c.notifyTo : null,
  };
}

function parseDraftConfig(config: unknown): DraftConfig {
  if (!config || typeof config !== 'object') {
    return DEFAULT_DRAFT_CONFIG;
  }

  const c = config as Record<string, unknown>;

  return {
    expireMinutes: parsePositiveInt(c.expireMinutes, 30),
  };
}

function parseTemplatesConfig(config: unknown): TemplatesConfig {
  if (!config || typeof config !== 'object') {
    return DEFAULT_TEMPLATES_CONFIG;
  }

  const c = config as Record<string, unknown>;

  return {
    customerConfirmationText: typeof c.customerConfirmationText === 'string' 
      ? c.customerConfirmationText 
      : DEFAULT_TEMPLATES_CONFIG.customerConfirmationText,
    customerNeedConfirmationText: typeof c.customerNeedConfirmationText === 'string'
      ? c.customerNeedConfirmationText
      : DEFAULT_TEMPLATES_CONFIG.customerNeedConfirmationText,
    customerExpiredText: typeof c.customerExpiredText === 'string'
      ? c.customerExpiredText
      : DEFAULT_TEMPLATES_CONFIG.customerExpiredText,
    customerClarificationText: typeof c.customerClarificationText === 'string'
      ? c.customerClarificationText
      : DEFAULT_TEMPLATES_CONFIG.customerClarificationText,
    customerCanceledText: typeof c.customerCanceledText === 'string'
      ? c.customerCanceledText
      : DEFAULT_TEMPLATES_CONFIG.customerCanceledText,
    businessNotificationText: typeof c.businessNotificationText === 'string'
      ? c.businessNotificationText
      : DEFAULT_TEMPLATES_CONFIG.businessNotificationText,
  };
}

function parseStringArray(value: unknown, defaultValue: string[]): string[] {
  if (!Array.isArray(value)) {
    return defaultValue;
  }
  const filtered = value.filter((v): v is string => typeof v === 'string');
  return filtered.length > 0 ? filtered : defaultValue;
}

// ============================================================================
// Template Rendering
// ============================================================================

/**
 * Replace placeholders in a template string
 * Placeholders: {orderId}, {orderSummary}, {pickupTime}, {customerName}, {customerPhone}, {itemsList}, {notes}
 */
export function renderTemplate(
  template: string,
  variables: Record<string, string | undefined>
): string {
  let result = template;
  
  for (const [key, value] of Object.entries(variables)) {
    const placeholder = `{${key}}`;
    result = result.replaceAll(placeholder, value || '');
  }
  
  return result.trim();
}

// ============================================================================
// Validation Helpers
// ============================================================================

/**
 * Check if a message is a confirmation YES
 */
export function isConfirmationYes(message: string, config: ConfirmationConfig): boolean {
  const normalized = message.trim().toUpperCase();
  return config.yesWords.some(word => normalized === word.toUpperCase());
}

/**
 * Check if a message is a confirmation NO
 */
export function isConfirmationNo(message: string, config: ConfirmationConfig): boolean {
  const normalized = message.trim().toUpperCase();
  return config.noWords.some(word => normalized === word.toUpperCase());
}

/**
 * Validate pickup time against minimum notice
 */
export function validatePickupTime(
  pickupTime: Date | null,
  minNoticeMinutes: number,
  now: Date = new Date()
): { valid: boolean; error?: string } {
  if (!pickupTime) {
    // ASAP is always valid
    return { valid: true };
  }

  const minPickupTime = new Date(now.getTime() + minNoticeMinutes * 60 * 1000);
  
  if (pickupTime < minPickupTime) {
    return {
      valid: false,
      error: `Pickup time must be at least ${minNoticeMinutes} minutes from now`,
    };
  }

  return { valid: true };
}
