'use client';

import { useState } from 'react';
import { signIn } from 'next-auth/react';
import { useSearchParams } from 'next/navigation';
import { Button } from '@repo/ui';

interface LoginFormProps {
  isDevMode: boolean;
  isSmtpConfigured: boolean;
}

export function LoginForm({ isDevMode, isSmtpConfigured }: LoginFormProps) {
  const searchParams = useSearchParams();
  const callbackUrl = searchParams.get('callbackUrl') || '/app';
  const error = searchParams.get('error');

  const [email, setEmail] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [emailSent, setEmailSent] = useState(false);

  // Dev credentials state
  const [devEmail, setDevEmail] = useState('dev@local');
  const [devPassword, setDevPassword] = useState('dev');

  const handleEmailSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    await signIn('email', {
      email,
      callbackUrl,
      redirect: false,
    });

    setEmailSent(true);
    setIsLoading(false);
  };

  const handleDevLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    await signIn('dev-credentials', {
      email: devEmail,
      password: devPassword,
      callbackUrl,
    });
  };

  return (
    <div className="space-y-6">
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-800 text-sm">
          {error === 'CredentialsSignin'
            ? 'Invalid credentials. Please try again.'
            : 'An error occurred. Please try again.'}
        </div>
      )}

      {/* Dev Mode Login */}
      {isDevMode && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
          <h3 className="font-medium text-yellow-800 mb-3">🔧 Dev Mode Login</h3>
          <form onSubmit={handleDevLogin} className="space-y-3">
            <div>
              <label className="block text-sm text-yellow-700 mb-1">Email</label>
              <input
                type="text"
                value={devEmail}
                onChange={(e) => setDevEmail(e.target.value)}
                className="w-full px-3 py-2 border rounded-md text-sm"
              />
            </div>
            <div>
              <label className="block text-sm text-yellow-700 mb-1">Password</label>
              <input
                type="password"
                value={devPassword}
                onChange={(e) => setDevPassword(e.target.value)}
                className="w-full px-3 py-2 border rounded-md text-sm"
              />
            </div>
            <Button type="submit" variant="primary" className="w-full" disabled={isLoading}>
              {isLoading ? 'Signing in...' : 'Dev Sign In'}
            </Button>
          </form>
          <p className="text-xs text-yellow-600 mt-2">
            Use dev@local / dev for quick testing
          </p>
        </div>
      )}

      {/* Email Magic Link */}
      {isSmtpConfigured && (
        <>
          {isDevMode && (
            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-gray-300" />
              </div>
              <div className="relative flex justify-center text-sm">
                <span className="px-2 bg-white text-gray-500">or</span>
              </div>
            </div>
          )}

          {emailSent ? (
            <div className="bg-green-50 border border-green-200 rounded-lg p-4 text-center">
              <p className="text-green-800 font-medium">Check your email!</p>
              <p className="text-green-600 text-sm mt-1">
                We sent a magic link to {email}
              </p>
            </div>
          ) : (
            <form onSubmit={handleEmailSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Email address
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  required
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>
              <Button type="submit" variant="primary" className="w-full" disabled={isLoading}>
                {isLoading ? 'Sending...' : 'Sign in with Email'}
              </Button>
            </form>
          )}
        </>
      )}

      {!isDevMode && !isSmtpConfigured && (
        <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 text-center">
          <p className="text-gray-600">
            No authentication providers configured.
          </p>
          <p className="text-sm text-gray-500 mt-1">
            Set AUTH_DEV_CREDENTIALS=true for dev mode or configure SMTP.
          </p>
        </div>
      )}
    </div>
  );
}
