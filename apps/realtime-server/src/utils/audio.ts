/**
 * Audio conversion utilities for Twilio <-> OpenAI
 * 
 * Twilio uses: mulaw 8kHz mono
 * OpenAI Realtime uses: PCM16 24kHz mono
 */

import { createLogger } from './logger.js';

const log = createLogger('audio');

/**
 * Convert mulaw 8kHz to PCM16 24kHz
 * This is needed because Twilio sends mulaw and OpenAI expects PCM16
 */
export function mulawToPcm16(mulawData: Buffer): Buffer {
  // Mulaw to linear conversion table
  const MULAW_DECODE: number[] = [];
  
  for (let i = 0; i < 256; i++) {
    const mu = ~i & 0xff;
    const sign = mu & 0x80;
    const exponent = (mu >> 4) & 0x07;
    const mantissa = mu & 0x0f;
    
    let sample = ((mantissa << 3) + 132) << exponent;
    sample -= 132;
    
    if (sign) {
      sample = -sample;
    }
    
    MULAW_DECODE.push(sample);
  }
  
  // Convert mulaw to PCM16 at 8kHz
  const pcm8k = Buffer.alloc(mulawData.length * 2);
  for (let i = 0; i < mulawData.length; i++) {
    const sample = MULAW_DECODE[mulawData[i]];
    pcm8k.writeInt16LE(sample, i * 2);
  }
  
  // Upsample from 8kHz to 24kHz (3x)
  // Simple linear interpolation
  const pcm24k = Buffer.alloc(pcm8k.length * 3);
  for (let i = 0; i < pcm8k.length / 2 - 1; i++) {
    const sample1 = pcm8k.readInt16LE(i * 2);
    const sample2 = pcm8k.readInt16LE((i + 1) * 2);
    
    pcm24k.writeInt16LE(sample1, i * 6);
    pcm24k.writeInt16LE(Math.round(sample1 + (sample2 - sample1) / 3), i * 6 + 2);
    pcm24k.writeInt16LE(Math.round(sample1 + (sample2 - sample1) * 2 / 3), i * 6 + 4);
  }
  
  return pcm24k;
}

/**
 * Convert PCM16 24kHz to mulaw 8kHz
 * This is needed because OpenAI sends PCM16 and Twilio expects mulaw
 */
export function pcm16ToMulaw(pcmData: Buffer): Buffer {
  // Downsample from 24kHz to 8kHz (take every 3rd sample)
  const samples24k = pcmData.length / 2;
  const samples8k = Math.floor(samples24k / 3);
  
  const mulaw = Buffer.alloc(samples8k);
  
  for (let i = 0; i < samples8k; i++) {
    const sample = pcmData.readInt16LE(i * 6); // Every 3rd sample (6 bytes)
    mulaw[i] = linearToMulaw(sample);
  }
  
  return mulaw;
}

/**
 * Convert a single linear sample to mulaw
 */
function linearToMulaw(sample: number): number {
  const MULAW_MAX = 32635;
  const MULAW_BIAS = 132;
  
  const sign = sample < 0 ? 0x80 : 0x00;
  if (sample < 0) {
    sample = -sample;
  }
  
  if (sample > MULAW_MAX) {
    sample = MULAW_MAX;
  }
  
  sample += MULAW_BIAS;
  
  let exponent = 7;
  for (let expMask = 0x4000; (sample & expMask) === 0 && exponent > 0; exponent--, expMask >>= 1);
  
  const mantissa = (sample >> (exponent + 3)) & 0x0f;
  const mulawByte = ~(sign | (exponent << 4) | mantissa) & 0xff;
  
  return mulawByte;
}

/**
 * Convert base64 mulaw to base64 PCM16
 */
export function convertTwilioToOpenAI(twilioAudioBase64: string): string {
  const mulawBuffer = Buffer.from(twilioAudioBase64, 'base64');
  const pcm16Buffer = mulawToPcm16(mulawBuffer);
  return pcm16Buffer.toString('base64');
}

/**
 * Convert base64 PCM16 to base64 mulaw
 */
export function convertOpenAIToTwilio(openaiAudioBase64: string): string {
  const pcm16Buffer = Buffer.from(openaiAudioBase64, 'base64');
  const mulawBuffer = pcm16ToMulaw(pcm16Buffer);
  return mulawBuffer.toString('base64');
}
