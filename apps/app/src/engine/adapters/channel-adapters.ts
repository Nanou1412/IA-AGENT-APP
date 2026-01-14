/**
 * Channel Adapters - Transform engine responses for each channel
 * 
 * Each adapter handles channel-specific formatting and constraints.
 */

import { MessagingChannel } from '@prisma/client';

// ============================================================================
// Types
// ============================================================================

export interface ChannelAdapterResult {
  formattedText: string;
  truncated: boolean;
  originalLength: number;
}

export interface ChannelConfig {
  maxLength: number;
  supportsFormatting: boolean;
  truncationSuffix: string;
}

// ============================================================================
// Channel Configurations
// ============================================================================

const CHANNEL_CONFIGS: Record<MessagingChannel, ChannelConfig> = {
  sms: {
    maxLength: 1600, // Twilio SMS max
    supportsFormatting: false,
    truncationSuffix: '...',
  },
  whatsapp: {
    maxLength: 4096, // WhatsApp max
    supportsFormatting: true, // Supports bold, italic, etc.
    truncationSuffix: '...',
  },
  voice: {
    maxLength: 3000, // TTS reasonable limit
    supportsFormatting: false,
    truncationSuffix: '', // No suffix for voice
  },
};

// ============================================================================
// SMS Adapter
// ============================================================================

/**
 * Adapt response for SMS channel
 */
export function adaptForSMS(text: string): ChannelAdapterResult {
  const config = CHANNEL_CONFIGS.sms;
  
  // Strip any markdown/HTML
  const formatted = stripFormatting(text);
  
  // Truncate if needed
  const { text: finalText, truncated } = truncateText(formatted, config.maxLength, config.truncationSuffix);
  
  return {
    formattedText: finalText,
    truncated,
    originalLength: text.length,
  };
}

// ============================================================================
// WhatsApp Adapter
// ============================================================================

/**
 * Adapt response for WhatsApp channel
 * WhatsApp supports basic formatting: *bold*, _italic_, ~strikethrough~, ```monospace```
 */
export function adaptForWhatsApp(text: string): ChannelAdapterResult {
  const config = CHANNEL_CONFIGS.whatsapp;
  
  // Convert markdown to WhatsApp format
  const formatted = convertMarkdownToWhatsApp(text);
  
  // Truncate if needed
  const { text: finalText, truncated } = truncateText(formatted, config.maxLength, config.truncationSuffix);
  
  return {
    formattedText: finalText,
    truncated,
    originalLength: text.length,
  };
}

// ============================================================================
// Voice Adapter
// ============================================================================

/**
 * Adapt response for Voice channel (TTS)
 * Optimizes text for spoken output
 */
export function adaptForVoice(text: string): ChannelAdapterResult {
  const config = CHANNEL_CONFIGS.voice;
  
  // Strip formatting
  let formatted = stripFormatting(text);
  
  // Optimize for TTS
  formatted = optimizeForTTS(formatted);
  
  // Truncate if needed
  const { text: finalText, truncated } = truncateText(formatted, config.maxLength, config.truncationSuffix);
  
  return {
    formattedText: finalText,
    truncated,
    originalLength: text.length,
  };
}

// ============================================================================
// Main Adapter
// ============================================================================

/**
 * Adapt response for the specified channel
 */
export function adaptForChannel(
  text: string,
  channel: MessagingChannel
): ChannelAdapterResult {
  switch (channel) {
    case 'sms':
      return adaptForSMS(text);
    case 'whatsapp':
      return adaptForWhatsApp(text);
    case 'voice':
      return adaptForVoice(text);
    default:
      // Fallback to SMS format
      return adaptForSMS(text);
  }
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Strip all formatting (markdown, HTML, etc.)
 */
function stripFormatting(text: string): string {
  return text
    // Remove markdown headers
    .replace(/^#{1,6}\s+/gm, '')
    // Remove bold/italic
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/\*([^*]+)\*/g, '$1')
    .replace(/__([^_]+)__/g, '$1')
    .replace(/_([^_]+)_/g, '$1')
    // Remove code blocks
    .replace(/```[\s\S]*?```/g, '')
    .replace(/`([^`]+)`/g, '$1')
    // Remove links but keep text
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    // Remove HTML tags
    .replace(/<[^>]+>/g, '')
    // Normalize whitespace
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/**
 * Convert markdown to WhatsApp format
 */
function convertMarkdownToWhatsApp(text: string): string {
  return text
    // Convert bold: **text** -> *text*
    .replace(/\*\*([^*]+)\*\*/g, '*$1*')
    // Convert italic: _text_ stays the same
    // Remove code blocks (not well supported in WhatsApp)
    .replace(/```[\s\S]*?```/g, '')
    // Convert inline code to monospace: `text` -> ```text```
    .replace(/`([^`]+)`/g, '```$1```')
    // Remove links but keep text
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    // Remove headers
    .replace(/^#{1,6}\s+/gm, '')
    .trim();
}

/**
 * Optimize text for text-to-speech
 */
function optimizeForTTS(text: string): string {
  return text
    // Expand common abbreviations
    .replace(/\bdr\./gi, 'doctor')
    .replace(/\bmr\./gi, 'mister')
    .replace(/\bmrs\./gi, 'missus')
    .replace(/\bms\./gi, 'miss')
    .replace(/\bst\./gi, 'street')
    .replace(/\bave\./gi, 'avenue')
    .replace(/\bblvd\./gi, 'boulevard')
    // Add pauses for punctuation
    .replace(/\.\s+/g, '. ')
    .replace(/,\s*/g, ', ')
    // Remove special characters that don't speak well
    .replace(/[#@&*~`]/g, '')
    // Normalize whitespace
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Truncate text to max length
 */
function truncateText(
  text: string,
  maxLength: number,
  suffix: string
): { text: string; truncated: boolean } {
  if (text.length <= maxLength) {
    return { text, truncated: false };
  }
  
  const truncatedLength = maxLength - suffix.length;
  
  // Try to truncate at a sentence boundary
  const truncated = text.slice(0, truncatedLength);
  const lastSentence = truncated.lastIndexOf('. ');
  
  if (lastSentence > truncatedLength * 0.7) {
    return {
      text: truncated.slice(0, lastSentence + 1) + suffix,
      truncated: true,
    };
  }
  
  // Try to truncate at a word boundary
  const lastSpace = truncated.lastIndexOf(' ');
  
  if (lastSpace > truncatedLength * 0.8) {
    return {
      text: truncated.slice(0, lastSpace) + suffix,
      truncated: true,
    };
  }
  
  return {
    text: truncated + suffix,
    truncated: true,
  };
}
