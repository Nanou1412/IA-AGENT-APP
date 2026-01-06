import { Suspense } from 'react';
import { redirect } from 'next/navigation';
import { getSession } from '@/lib/session';
import { LoginForm } from '@/components/login-form';

export default async function LoginPage() {
  const session = await getSession();

  if (session?.user) {
    redirect('/app');
  }

  const isDevMode = process.env.AUTH_DEV_CREDENTIALS === 'true';

  const isSmtpConfigured = !!(
    process.env.SMTP_HOST &&
    process.env.SMTP_PORT &&
    process.env.SMTP_USER &&
    process.env.SMTP_PASS &&
    process.env.EMAIL_FROM
  );

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="max-w-md w-full mx-4">
        <div className="bg-white rounded-xl shadow-sm border p-8">
          <div className="text-center mb-8">
            <h1 className="text-2xl font-bold text-gray-900">Welcome back</h1>
            <p className="text-gray-600 mt-2">Sign in to IA Agent App</p>
          </div>

          <Suspense fallback={<div>Loading...</div>}>
            <LoginForm isDevMode={isDevMode} isSmtpConfigured={isSmtpConfigured} />
          </Suspense>
        </div>

        <p className="text-center text-sm text-gray-500 mt-4">
          Don&apos;t have an account? Sign in to get started.
        </p>
      </div>
    </div>
  );
}
