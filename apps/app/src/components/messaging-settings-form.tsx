'use client';

import { useState, useTransition } from 'react';
import { updateMessagingSettings } from '@/actions/settings';

const LOCALES = [
  { value: 'en-AU', label: 'English (Australia)' },
  { value: 'en-US', label: 'English (US)' },
  { value: 'en-GB', label: 'English (UK)' },
  { value: 'fr-FR', label: 'French (France)' },
  { value: 'es-ES', label: 'Spanish (Spain)' },
  { value: 'de-DE', label: 'German (Germany)' },
  { value: 'ja-JP', label: 'Japanese (Japan)' },
  { value: 'zh-CN', label: 'Chinese (Simplified)' },
];

interface MessagingSettingsFormProps {
  orgId: string;
  initialData: {
    messagingLocale: string;
    defaultInboundReplyText: string;
    deniedReplyText: string;
    faqText: string;
  };
}

export function MessagingSettingsForm({ orgId, initialData }: MessagingSettingsFormProps) {
  const [isPending, startTransition] = useTransition();
  const [messagingLocale, setMessagingLocale] = useState(initialData.messagingLocale);
  const [defaultInboundReplyText, setDefaultInboundReplyText] = useState(initialData.defaultInboundReplyText);
  const [deniedReplyText, setDeniedReplyText] = useState(initialData.deniedReplyText);
  const [faqText, setFaqText] = useState(initialData.faqText);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setMessage(null);

    startTransition(async () => {
      const result = await updateMessagingSettings({
        orgId,
        messagingLocale,
        defaultInboundReplyText,
        deniedReplyText,
        faqText,
      });

      if (result.error) {
        setMessage({ type: 'error', text: result.error });
      } else {
        setMessage({ type: 'success', text: 'Messaging settings updated successfully' });
      }
    });
  };

  const hasChanges =
    messagingLocale !== initialData.messagingLocale ||
    defaultInboundReplyText !== initialData.defaultInboundReplyText ||
    deniedReplyText !== initialData.deniedReplyText ||
    faqText !== initialData.faqText;

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label htmlFor="messagingLocale" className="block text-sm font-medium text-gray-700 mb-1">
          Messaging Language
        </label>
        <select
          id="messagingLocale"
          value={messagingLocale}
          onChange={(e) => setMessagingLocale(e.target.value)}
          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
        >
          {LOCALES.map((locale) => (
            <option key={locale.value} value={locale.value}>
              {locale.label}
            </option>
          ))}
        </select>
        <p className="mt-1 text-xs text-gray-500">
          Primary language for AI responses
        </p>
      </div>

      <div>
        <label htmlFor="defaultInboundReplyText" className="block text-sm font-medium text-gray-700 mb-1">
          Default Reply Text
        </label>
        <textarea
          id="defaultInboundReplyText"
          value={defaultInboundReplyText}
          onChange={(e) => setDefaultInboundReplyText(e.target.value)}
          rows={2}
          placeholder="Hi! How can I help you today?"
          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
        />
        <p className="mt-1 text-xs text-gray-500">
          Default greeting when AI cannot generate a specific response
        </p>
      </div>

      <div>
        <label htmlFor="deniedReplyText" className="block text-sm font-medium text-gray-700 mb-1">
          Denied Request Message
        </label>
        <textarea
          id="deniedReplyText"
          value={deniedReplyText}
          onChange={(e) => setDeniedReplyText(e.target.value)}
          rows={2}
          placeholder="I'm sorry, I can't help with that request."
          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
        />
        <p className="mt-1 text-xs text-gray-500">
          Message sent when a request is blocked by guardrails
        </p>
      </div>

      <div>
        <label htmlFor="faqText" className="block text-sm font-medium text-gray-700 mb-1">
          FAQ / Knowledge Base
        </label>
        <textarea
          id="faqText"
          value={faqText}
          onChange={(e) => setFaqText(e.target.value)}
          rows={6}
          placeholder="Q: What are your opening hours?&#10;A: We're open Monday to Friday, 9am to 5pm.&#10;&#10;Q: Where are you located?&#10;A: We're at 123 Main Street..."
          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent font-mono text-sm"
        />
        <p className="mt-1 text-xs text-gray-500">
          Custom Q&A pairs to help the AI answer common questions
        </p>
      </div>

      {message && (
        <div
          className={`p-3 rounded-lg text-sm ${
            message.type === 'success'
              ? 'bg-green-50 text-green-800'
              : 'bg-red-50 text-red-800'
          }`}
        >
          {message.text}
        </div>
      )}

      <div className="flex justify-end">
        <button
          type="submit"
          disabled={isPending || !hasChanges}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {isPending ? 'Saving...' : 'Save Changes'}
        </button>
      </div>
    </form>
  );
}
