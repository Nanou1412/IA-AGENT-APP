/**
 * SMS Module
 * 
 * System-initiated SMS functionality for customer notifications.
 */

export {
  sendSystemSms,
  sendPaymentLinkSms,
  sendOrderConfirmationSms,
  sendBookingConfirmationSms,
  type SystemSmsResult,
  type SystemSmsInput,
} from './customer-notifications';
