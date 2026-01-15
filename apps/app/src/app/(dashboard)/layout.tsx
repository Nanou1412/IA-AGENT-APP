import Link from 'next/link';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import Image from 'next/image';

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getServerSession(authOptions);
  const user = session?.user;
  // Cast to include image property from NextAuth
  const userImage = (user as { image?: string | null })?.image;

  return (
    <div className="min-h-screen">
      <header className="bg-white shadow-sm border-b">
        <nav className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <Link href="/" className="text-xl font-bold text-blue-600">
            IA Agent App
          </Link>
          <div className="flex gap-6 items-center">
            <Link href="/app" className="text-gray-600 hover:text-gray-900">
              Dashboard
            </Link>
            <Link href="/app/settings" className="text-gray-600 hover:text-gray-900">
              Settings
            </Link>
            <Link href="/admin" className="text-gray-600 hover:text-gray-900">
              Admin
            </Link>
            {userImage ? (
              <Image 
                src={userImage} 
                alt={user?.name || 'User'} 
                width={32} 
                height={32} 
                className="rounded-full"
              />
            ) : (
              <div className="w-8 h-8 bg-gray-300 rounded-full flex items-center justify-center text-gray-600 text-sm font-medium">
                {user?.name?.[0] || user?.email?.[0] || '?'}
              </div>
            )}
          </div>
        </nav>
      </header>
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {children}
      </main>
    </div>
  );
}
