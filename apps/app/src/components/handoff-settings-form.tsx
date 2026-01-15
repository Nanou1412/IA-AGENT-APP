'use client';

import { useState, useTransition } from 'react';
import { updateHandoffSettings } from '@/actions/settings';

interface HandoffSettingsFormProps {
  orgId: string;
  initialData: {
    handoffPhone: string;
    handoffEmail: string;
    handoffSmsTo: string;
    handoffReplyText: string;
  };
}

export function HandoffSettingsForm({ orgId, initialData }: HandoffSettingsFormProps) {
  const [isPending, startTransition] = useTransition();
  const [handoffPhone, setHandoffPhone] = useState(initialData.handoffPhone);
  const [handoffEmail, setHandoffEmail] = useState(initialData.handoffEmail);
  const [handoffSmsTo, setHandoffSmsTo] = useState(initialData.handoffSmsTo);
  const [handoffReplyText, setHandoffReplyText] = useState(initialData.handoffReplyText);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setMessage(null);

    startTransition(async () => {
      const result = await updateHandoffSettings({
        orgId,
        handoffPhone,
        handoffEmail,
        handoffSmsTo,
        handoffReplyText,
      });

      if (result.error) {
        setMessage({ type: 'error', text: result.error });
      } else {
        setMessage({ type: 'success', text: 'Handoff settings updated successfully' });
      }
    });
  };

  const hasChanges =
    handoffPhone !== initialData.handoffPhone ||
    handoffEmail !== initialData.handoffEmail ||
    handoffSmsTo !== initialData.handoffSmsTo ||
    handoffReplyText !== initialData.handoffReplyText;

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid md:grid-cols-2 gap-4">
        <div>
          <label htmlFor="handoffPhone" className="block text-sm font-medium text-gray-700 mb-1">
            Handoff Phone Number
          </label>
          <input
            id="handoffPhone"
            type="tel"
            value={handoffPhone}
            onChange={(e) => setHandoffPhone(e.target.value)}
            placeholder="+61400000000"
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
          <p className="mt-1 text-xs text-gray-500">
            Phone number for call transfers (E.164 format)
          </p>
        </div>

        <div>
          <label htmlFor="handoffEmail" className="block text-sm font-medium text-gray-700 mb-1">
            Handoff Email
          </label>
          <input
            id="handoffEmail"
            type="email"
            value={handoffEmail}
            onChange={(e) => setHandoffEmail(e.target.value)}
            placeholder="manager@example.com"
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
          <p className="mt-1 text-xs text-gray-500">
            Email to receive handoff notifications
          </p>
        </div>
      </div>

      <div>
        <label htmlFor="handoffSmsTo" className="block text-sm font-medium text-gray-700 mb-1">
          SMS Handoff Number
        </label>
        <input
          id="handoffSmsTo"
          type="tel"
          value={handoffSmsTo}
          onChange={(e) => setHandoffSmsTo(e.target.value)}
          placeholder="+61400000000"
          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
        />
        <p className="mt-1 text-xs text-gray-500">
          Phone number to receive SMS alerts when AI hands off
        </p>
      </div>

      <div>
        <label htmlFor="handoffReplyText" className="block text-sm font-medium text-gray-700 mb-1">
          Handoff Message
        </label>
        <textarea
          id="handoffReplyText"
          value={handoffReplyText}
          onChange={(e) => setHandoffReplyText(e.target.value)}
          rows={3}
          placeholder="I'm transferring you to a human agent who will assist you shortly."
          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
        />
        <p className="mt-1 text-xs text-gray-500">
          Message sent to customer when handing off to human
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
