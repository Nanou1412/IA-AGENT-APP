/**
 * Input Validation Utilities
 * 
 * Simple validation functions for API endpoints.
 * These provide basic validation without requiring Zod dependency.
 */

export interface ValidationResult<T> {
  success: boolean;
  data?: T;
  error?: string;
}

/**
 * Validate that a value is a non-empty string
 */
export function validateRequiredString(
  value: unknown,
  fieldName: string
): ValidationResult<string> {
  if (typeof value !== 'string') {
    return { success: false, error: `${fieldName} must be a string` };
  }
  if (value.trim().length === 0) {
    return { success: false, error: `${fieldName} is required` };
  }
  return { success: true, data: value.trim() };
}

/**
 * Validate that a value is a valid URL
 */
export function validateUrl(
  value: unknown,
  fieldName: string,
  options?: { requireHttps?: boolean }
): ValidationResult<string> {
  const strResult = validateRequiredString(value, fieldName);
  if (!strResult.success) return strResult;
  
  try {
    const url = new URL(strResult.data!);
    
    if (options?.requireHttps && url.protocol !== 'https:') {
      return { success: false, error: `${fieldName} must use HTTPS` };
    }
    
    if (!['http:', 'https:'].includes(url.protocol)) {
      return { success: false, error: `${fieldName} must be an HTTP(S) URL` };
    }
    
    return { success: true, data: strResult.data };
  } catch {
    return { success: false, error: `${fieldName} is not a valid URL` };
  }
}

/**
 * Validate that a value is a positive integer
 */
export function validatePositiveInt(
  value: unknown,
  fieldName: string
): ValidationResult<number> {
  const num = typeof value === 'string' ? parseInt(value, 10) : value;
  
  if (typeof num !== 'number' || isNaN(num)) {
    return { success: false, error: `${fieldName} must be a number` };
  }
  
  if (!Number.isInteger(num) || num <= 0) {
    return { success: false, error: `${fieldName} must be a positive integer` };
  }
  
  return { success: true, data: num };
}

/**
 * Validate that a value is one of allowed values
 */
export function validateEnum<T extends string>(
  value: unknown,
  fieldName: string,
  allowedValues: readonly T[]
): ValidationResult<T> {
  if (typeof value !== 'string') {
    return { success: false, error: `${fieldName} must be a string` };
  }
  
  if (!allowedValues.includes(value as T)) {
    return { 
      success: false, 
      error: `${fieldName} must be one of: ${allowedValues.join(', ')}` 
    };
  }
  
  return { success: true, data: value as T };
}

/**
 * Validate a CUID or UUID format (basic check)
 */
export function validateId(
  value: unknown,
  fieldName: string
): ValidationResult<string> {
  const strResult = validateRequiredString(value, fieldName);
  if (!strResult.success) return strResult;
  
  const id = strResult.data!;
  
  // CUID: starts with 'c', 25 chars, alphanumeric
  const isCuid = /^c[a-z0-9]{24}$/i.test(id);
  // UUID: standard format
  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
  
  if (!isCuid && !isUuid) {
    return { success: false, error: `${fieldName} is not a valid ID format` };
  }
  
  return { success: true, data: id };
}

/**
 * Validate an array of items
 */
export function validateArray<T>(
  value: unknown,
  fieldName: string,
  itemValidator: (item: unknown, index: number) => ValidationResult<T>,
  options?: { minLength?: number; maxLength?: number }
): ValidationResult<T[]> {
  if (!Array.isArray(value)) {
    return { success: false, error: `${fieldName} must be an array` };
  }
  
  if (options?.minLength !== undefined && value.length < options.minLength) {
    return { success: false, error: `${fieldName} must have at least ${options.minLength} items` };
  }
  
  if (options?.maxLength !== undefined && value.length > options.maxLength) {
    return { success: false, error: `${fieldName} must have at most ${options.maxLength} items` };
  }
  
  const result: T[] = [];
  for (let i = 0; i < value.length; i++) {
    const itemResult = itemValidator(value[i], i);
    if (!itemResult.success) {
      return { success: false, error: `${fieldName}[${i}]: ${itemResult.error}` };
    }
    result.push(itemResult.data!);
  }
  
  return { success: true, data: result };
}

/**
 * Combine multiple validation errors
 */
export function combineValidations(
  results: Array<{ field: string; result: ValidationResult<unknown> }>
): ValidationResult<void> {
  const errors = results
    .filter(r => !r.result.success)
    .map(r => r.result.error);
  
  if (errors.length > 0) {
    return { success: false, error: errors.join('; ') };
  }
  
  return { success: true };
}
