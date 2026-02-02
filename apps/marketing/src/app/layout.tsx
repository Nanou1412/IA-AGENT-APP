import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import Link from 'next/link';
import './globals.css';

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'IA Agent App - AI-Powered Customer Service',
  description: 'Automate customer interactions with intelligent AI agents tailored to your industry. SMS, WhatsApp, and Voice support.',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className={inter.className}>
        <header className="bg-white shadow-sm border-b sticky top-0 z-50">
          <nav className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
            <Link href="/" className="text-xl font-bold text-blue-600">
              IA Agent App
            </Link>
            <div className="hidden md:flex items-center gap-6">
              <Link href="/industries" className="text-gray-600 hover:text-gray-900 transition-colors">
                Industries
              </Link>
              <Link href="/pricing" className="text-gray-600 hover:text-gray-900 transition-colors">
                Pricing
              </Link>
              <Link href="/contact" className="text-gray-600 hover:text-gray-900 transition-colors">
                Contact
              </Link>
              <Link 
                href="http://localhost:3001/login" 
                className="px-4 py-2 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 transition-colors"
              >
                Get Started
              </Link>
            </div>
            {/* Mobile menu button */}
            <button className="md:hidden p-2 text-gray-600">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            </button>
          </nav>
        </header>
        <main>{children}</main>
        <footer className="bg-gray-900 text-gray-300">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
              {/* Brand */}
              <div className="col-span-2 md:col-span-1">
                <Link href="/" className="text-xl font-bold text-white">
                  IA Agent App
                </Link>
                <p className="mt-3 text-sm text-gray-400">
                  AI-powered customer service for Australian businesses.
                </p>
              </div>

              {/* Industries */}
              <div>
                <h3 className="text-sm font-semibold text-white uppercase tracking-wider mb-4">
                  Industries
                </h3>
                <ul className="space-y-2">
                  <li>
                    <Link href="/restaurant" className="text-sm hover:text-white transition-colors">
                      Restaurant
                    </Link>
                  </li>
                  <li>
                    <Link href="/hotel" className="text-sm hover:text-white transition-colors">
                      Hotel
                    </Link>
                  </li>
                  <li>
                    <Link href="/tradie" className="text-sm hover:text-white transition-colors">
                      Trades & Services
                    </Link>
                  </li>
                  <li>
                    <Link href="/industries" className="text-sm hover:text-white transition-colors">
                      View All →
                    </Link>
                  </li>
                </ul>
              </div>

              {/* Company */}
              <div>
                <h3 className="text-sm font-semibold text-white uppercase tracking-wider mb-4">
                  Company
                </h3>
                <ul className="space-y-2">
                  <li>
                    <Link href="/pricing" className="text-sm hover:text-white transition-colors">
                      Pricing
                    </Link>
                  </li>
                  <li>
                    <Link href="/contact" className="text-sm hover:text-white transition-colors">
                      Contact
                    </Link>
                  </li>
                  <li>
                    <Link href="/about" className="text-sm hover:text-white transition-colors">
                      About Us
                    </Link>
                  </li>
                </ul>
              </div>

              {/* Support */}
              <div>
                <h3 className="text-sm font-semibold text-white uppercase tracking-wider mb-4">
                  Support
                </h3>
                <ul className="space-y-2">
                  <li>
                    <a href="mailto:support@iaagent.app" className="text-sm hover:text-white transition-colors">
                      support@iaagent.app
                    </a>
                  </li>
                  <li>
                    <Link href="http://localhost:3001/login" className="text-sm hover:text-white transition-colors">
                      Login
                    </Link>
                  </li>
                  <li>
                    <Link href="/pricing#faq" className="text-sm hover:text-white transition-colors">
                      FAQ
                    </Link>
                  </li>
                </ul>
              </div>
            </div>

            {/* Bottom Bar */}
            <div className="mt-12 pt-8 border-t border-gray-800 flex flex-col md:flex-row justify-between items-center gap-4">
              <p className="text-sm text-gray-400">
                © {new Date().getFullYear()} IA Agent App. All rights reserved.
              </p>
              <div className="flex items-center gap-6 text-sm">
                <Link href="/privacy" className="text-gray-400 hover:text-white transition-colors">
                  Privacy Policy
                </Link>
                <Link href="/terms" className="text-gray-400 hover:text-white transition-colors">
                  Terms of Service
                </Link>
                <span className="text-gray-500">🇦🇺 Made in Australia</span>
              </div>
            </div>
          </div>
        </footer>
      </body>
    </html>
  );
}
