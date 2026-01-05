import { Button } from '@repo/ui';
import Link from 'next/link';

export default function HomePage() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center">
      <div className="max-w-md mx-auto text-center p-8">
        <h1 className="text-4xl font-bold mb-4">IA Agent App</h1>
        <p className="text-gray-600 mb-8">
          Welcome to the IA Agent App. Manage your AI agents and templates.
        </p>
        <div className="flex flex-col gap-4">
          <Link href="/app">
            <Button variant="primary" size="lg" className="w-full">
              Go to Dashboard
            </Button>
          </Link>
          <Link href="/admin">
            <Button variant="outline" size="lg" className="w-full">
              Admin Panel
            </Button>
          </Link>
        </div>
      </div>
    </div>
  );
}
