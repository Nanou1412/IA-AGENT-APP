'use client';

/**
 * Google Integration Card Component
 * 
 * Displays connection status and allows connecting/disconnecting Google Calendar.
 */

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { IntegrationStatus } from '@prisma/client';

interface GoogleIntegrationCardProps {
  orgId: string;
  connected: boolean;
  status: IntegrationStatus | null;
  googleEmail?: string;
  calendars: { id: string; summary: string; primary?: boolean }[];
  selectedCalendarId?: string;
  bookingEnabled: boolean;
  timezone: string;
}

export function GoogleIntegrationCard({
  orgId,
  connected,
  status,
  googleEmail,
  calendars,
  selectedCalendarId = 'primary',
  bookingEnabled,
  timezone,
}: GoogleIntegrationCardProps) {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);
  const [selectedCalendar, setSelectedCalendar] = useState(selectedCalendarId);
  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const handleConnect = () => {
    setIsLoading(true);
    // Redirect to OAuth start
    window.location.href = `/api/google/oauth/start?orgId=${orgId}`;
  };

  const handleDisconnect = async () => {
    if (!confirm('Are you sure you want to disconnect Google Calendar?')) {
      return;
    }

    setIsLoading(true);
    try {
      const response = await fetch('/api/google/disconnect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orgId }),
      });

      if (response.ok) {
        router.refresh();
      } else {
        setMessage({ type: 'error', text: 'Failed to disconnect' });
      }
    } catch {
      setMessage({ type: 'error', text: 'Failed to disconnect' });
    } finally {
      setIsLoading(false);
    }
  };

  const handleCalendarChange = async (calendarId: string) => {
    setSelectedCalendar(calendarId);
    setIsSaving(true);
    setMessage(null);

    try {
      const response = await fetch('/api/google/calendar/select', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orgId, calendarId }),
      });

      if (response.ok) {
        setMessage({ type: 'success', text: 'Calendar updated' });
        setTimeout(() => setMessage(null), 3000);
      } else {
        setMessage({ type: 'error', text: 'Failed to update calendar' });
      }
    } catch {
      setMessage({ type: 'error', text: 'Failed to update calendar' });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="border rounded-lg p-6 bg-white shadow-sm">
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          {/* Google Calendar icon */}
          <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center">
            <svg
              className="w-8 h-8"
              viewBox="0 0 24 24"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
            >
              <path
                d="M19 4H5C3.89543 4 3 4.89543 3 6V20C3 21.1046 3.89543 22 5 22H19C20.1046 22 21 21.1046 21 20V6C21 4.89543 20.1046 4 19 4Z"
                stroke="#4285F4"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <path d="M16 2V6" stroke="#4285F4" strokeWidth="2" strokeLinecap="round" />
              <path d="M8 2V6" stroke="#4285F4" strokeWidth="2" strokeLinecap="round" />
              <path d="M3 10H21" stroke="#4285F4" strokeWidth="2" />
            </svg>
          </div>
          <div>
            <h3 className="text-lg font-semibold">Google Calendar</h3>
            <p className="text-sm text-gray-600">
              Connect to enable automated booking management
            </p>
          </div>
        </div>

        {/* Status badge */}
        <StatusBadge status={status} />
      </div>

      {/* Connection details */}
      {connected && (
        <div className="mt-6 space-y-4">
          {/* Connected account */}
          {googleEmail && (
            <div className="flex items-center gap-2 text-sm">
              <span className="text-gray-500">Connected as:</span>
              <span className="font-medium">{googleEmail}</span>
            </div>
          )}

          {/* Calendar selection */}
          <div className="space-y-2">
            <label className="block text-sm font-medium text-gray-700">
              Calendar for bookings
            </label>
            <select
              value={selectedCalendar}
              onChange={(e) => handleCalendarChange(e.target.value)}
              disabled={isSaving}
              className="w-full max-w-md px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            >
              {calendars.map((cal) => (
                <option key={cal.id} value={cal.id}>
                  {cal.summary} {cal.primary && '(Primary)'}
                </option>
              ))}
            </select>
            {isSaving && <p className="text-sm text-gray-500">Saving...</p>}
          </div>

          {/* Timezone info */}
          <div className="flex items-center gap-2 text-sm">
            <span className="text-gray-500">Timezone:</span>
            <span className="font-medium">{timezone}</span>
          </div>

          {/* Booking status */}
          <div className="flex items-center gap-2 text-sm">
            <span className="text-gray-500">Booking module:</span>
            {bookingEnabled ? (
              <span className="text-green-600 font-medium">Enabled</span>
            ) : (
              <span className="text-yellow-600 font-medium">Not enabled</span>
            )}
          </div>

          {message && (
            <p className={`text-sm ${message.type === 'success' ? 'text-green-600' : 'text-red-600'}`}>
              {message.text}
            </p>
          )}
        </div>
      )}

      {/* Status-specific messages */}
      {status === IntegrationStatus.error && (
        <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-lg">
          <p className="text-sm text-red-800">
            There was an issue with your Google connection. Please reconnect.
          </p>
        </div>
      )}

      {/* Action buttons */}
      <div className="mt-6 flex gap-3">
        {!connected ? (
          <button
            onClick={handleConnect}
            disabled={isLoading}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isLoading ? 'Connecting...' : 'Connect Google Calendar'}
          </button>
        ) : (
          <button
            onClick={handleDisconnect}
            disabled={isLoading}
            className="px-4 py-2 border border-red-300 text-red-600 rounded-lg hover:bg-red-50 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isLoading ? 'Disconnecting...' : 'Disconnect'}
          </button>
        )}
      </div>

      {/* Help text */}
      {!connected && (
        <p className="mt-4 text-sm text-gray-500">
          Connect your Google account to enable customers to make, modify, and cancel
          bookings through SMS, WhatsApp, or voice.
        </p>
      )}
    </div>
  );
}

function StatusBadge({ status }: { status: IntegrationStatus | null }) {
  if (!status) {
    return (
      <span className="px-2 py-1 text-xs font-medium bg-gray-100 text-gray-600 rounded-full">
        Not connected
      </span>
    );
  }

  switch (status) {
    case IntegrationStatus.connected:
      return (
        <span className="px-2 py-1 text-xs font-medium bg-green-100 text-green-700 rounded-full">
          Connected
        </span>
      );
    case IntegrationStatus.error:
      return (
        <span className="px-2 py-1 text-xs font-medium bg-red-100 text-red-700 rounded-full">
          Error
        </span>
      );
    case IntegrationStatus.disconnected:
      return (
        <span className="px-2 py-1 text-xs font-medium bg-gray-100 text-gray-600 rounded-full">
          Disconnected
        </span>
      );
    default:
      return null;
  }
}
