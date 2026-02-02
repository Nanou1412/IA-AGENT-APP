import Link from 'next/link';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import Image from 'next/image';
import { SidebarNav } from '@/components/sidebar-nav';

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
    <div className="min-h-screen bg-gray-50">
      {/* Top Header */}
      <header className="bg-white shadow-sm border-b fixed top-0 left-0 right-0 z-30">
        <nav className="px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-8">
            <Link href="/" className="text-xl font-bold text-blue-600 flex items-center gap-2">
              <span className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center text-white text-sm">🤖</span>
              IA Agent
            </Link>
          </div>
          <div className="flex gap-4 items-center">
            {/* Notifications */}
            <button className="p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors relative">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
              </svg>
            </button>
            {/* User Menu */}
            <div className="flex items-center gap-3 pl-4 border-l">
              {userImage ? (
                <Image 
                  src={userImage} 
                  alt={user?.name || 'User'} 
                  width={36} 
                  height={36} 
                  className="rounded-full ring-2 ring-gray-100"
                />
              ) : (
                <div className="w-9 h-9 bg-gradient-to-br from-blue-500 to-purple-600 rounded-full flex items-center justify-center text-white text-sm font-medium">
                  {user?.name?.[0] || user?.email?.[0] || '?'}
                </div>
              )}
              <div className="hidden sm:block">
                <div className="text-sm font-medium text-gray-900">{user?.name || 'User'}</div>
                <div className="text-xs text-gray-500">{user?.email}</div>
              </div>
            </div>
          </div>
        </nav>
      </header>

      <div className="flex pt-16">
        {/* Sidebar */}
        <SidebarNav />
        
        {/* Main Content */}
        <main className="flex-1 ml-64 p-8 min-h-[calc(100vh-4rem)]">
          <div className="max-w-6xl mx-auto">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
