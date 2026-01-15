'use client';

import { useState, useTransition } from 'react';
import { Button } from '@repo/ui';
import { updateOrgTwilioConfig } from '@/actions/admin';

interface TwilioConfigFormProps {
  orgId: string;
  initialData: {
    twilioPhoneNumber?: string;
    voiceEnabled: boolean;
    smsEnabled: boolean;
    whatsappEnabled: boolean;
    callWelcomeText?: string;
    handoffPhone?: string;
  };
}

export function TwilioConfigForm({ orgId, initialData }: TwilioConfigFormProps) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const [formData, setFormData] = useState({
    twilioPhoneNumber: initialData.twilioPhoneNumber || '',
    voiceEnabled: initialData.voiceEnabled,
    smsEnabled: initialData.smsEnabled,
    whatsappEnabled: initialData.whatsappEnabled,
    callWelcomeText: initialData.callWelcomeText || '',
    handoffPhone: initialData.handoffPhone || '',
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(false);

    startTransition(async () => {
      const result = await updateOrgTwilioConfig(orgId, {
        twilioPhoneNumber: formData.twilioPhoneNumber || undefined,
        voiceEnabled: formData.voiceEnabled,
        smsEnabled: formData.smsEnabled,
        whatsappEnabled: formData.whatsappEnabled,
        callWelcomeText: formData.callWelcomeText || undefined,
        handoffPhone: formData.handoffPhone || undefined,
      });

      if (result.error) {
        setError(result.error);
        return;
      }

      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
    });
  };

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
  ) => {
    const { name, value, type } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: type === 'checkbox' ? (e.target as HTMLInputElement).checked : value,
    }));
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {error && (
        <div className="p-3 bg-red-50 border border-red-200 text-red-700 rounded-lg text-sm">
          {error}
        </div>
      )}

      {success && (
        <div className="p-3 bg-green-50 border border-green-200 text-green-700 rounded-lg text-sm">
          ✅ Configuration saved successfully!
        </div>
      )}

      {/* Twilio Phone Number */}
      <div>
        <label htmlFor="twilioPhoneNumber" className="block text-sm font-medium text-gray-700 mb-1">
          Twilio Phone Number
        </label>
        <input
          type="tel"
          id="twilioPhoneNumber"
          name="twilioPhoneNumber"
          value={formData.twilioPhoneNumber}
          onChange={handleChange}
          placeholder="+61485000807"
          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm"
        />
        <p className="mt-1 text-xs text-gray-500">E.164 format (e.g., +61485000807)</p>
      </div>

      {/* Toggles */}
      <div className="space-y-3">
        <label className="flex items-center gap-3">
          <input
            type="checkbox"
            name="voiceEnabled"
            checked={formData.voiceEnabled}
            onChange={handleChange}
            className="w-4 h-4 text-blue-600 rounded focus:ring-blue-500"
          />
          <span className="text-sm font-medium text-gray-700">📞 Voice Enabled</span>
        </label>

        <label className="flex items-center gap-3">
          <input
            type="checkbox"
            name="smsEnabled"
            checked={formData.smsEnabled}
            onChange={handleChange}
            className="w-4 h-4 text-blue-600 rounded focus:ring-blue-500"
          />
          <span className="text-sm font-medium text-gray-700">💬 SMS Enabled</span>
        </label>

        <label className="flex items-center gap-3">
          <input
            type="checkbox"
            name="whatsappEnabled"
            checked={formData.whatsappEnabled}
            onChange={handleChange}
            className="w-4 h-4 text-blue-600 rounded focus:ring-blue-500"
          />
          <span className="text-sm font-medium text-gray-700">📱 WhatsApp Enabled</span>
        </label>
      </div>

      {/* Call Welcome Text */}
      <div>
        <label htmlFor="callWelcomeText" className="block text-sm font-medium text-gray-700 mb-1">
          Call Welcome Message
        </label>
        <textarea
          id="callWelcomeText"
          name="callWelcomeText"
          value={formData.callWelcomeText}
          onChange={handleChange}
          rows={2}
          placeholder="Welcome to our service. How can I help you today?"
          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm"
        />
      </div>

      {/* Handoff Phone */}
      <div>
        <label htmlFor="handoffPhone" className="block text-sm font-medium text-gray-700 mb-1">
          Handoff Phone Number
        </label>
        <input
          type="tel"
          id="handoffPhone"
          name="handoffPhone"
          value={formData.handoffPhone}
          onChange={handleChange}
          placeholder="+61400000000"
          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm"
        />
        <p className="mt-1 text-xs text-gray-500">Number to transfer calls to when AI cannot help</p>
      </div>

      {/* Submit */}
      <div className="pt-2">
        <Button variant="primary" type="submit" disabled={isPending} size="sm">
          {isPending ? 'Saving...' : 'Save Twilio Config'}
        </Button>
      </div>
    </form>
  );
}
