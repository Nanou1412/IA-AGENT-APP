import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'IA Agent App - Marketing',
  description: 'AI-powered agents for your business',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className={inter.className}>
        <header className="bg-white shadow-sm border-b">
          <nav className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
            <a href="/" className="text-xl font-bold text-blue-600">
              IA Agent App
            </a>
            <div className="flex gap-6">
              <a href="/industries" className="text-gray-600 hover:text-gray-900">
                Industries
              </a>
              <a href="/restaurant" className="text-gray-600 hover:text-gray-900">
                Restaurant
              </a>
              <a href="/hotel" className="text-gray-600 hover:text-gray-900">
                Hotel
              </a>
              <a href="/tradie" className="text-gray-600 hover:text-gray-900">
                Tradie
              </a>
            </div>
          </nav>
        </header>
        <main>{children}</main>
        <footer className="bg-gray-50 border-t mt-auto">
          <div className="max-w-7xl mx-auto px-4 py-8 text-center text-gray-500">
            © 2026 IA Agent App. All rights reserved.
          </div>
        </footer>
      </body>
    </html>
  );
}
