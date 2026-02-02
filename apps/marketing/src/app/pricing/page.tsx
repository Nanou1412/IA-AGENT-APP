import type { Metadata } from 'next';
import Link from 'next/link';
import { Button } from '@repo/ui';

export const metadata: Metadata = {
  title: 'Pricing | IA Agent App',
  description: 'Simple, transparent pricing for AI-powered customer service. Setup fee + weekly subscription.',
};

const PRICING = {
  setupFee: 390,
  weeklySubscription: 69.90,
  currency: 'AUD',
};

const FEATURES = [
  {
    category: 'AI Agent',
    items: [
      '24/7 AI-powered responses',
      'Multi-channel support (SMS, WhatsApp, Voice)',
      'Industry-specific templates',
      'Custom conversation flows',
      'Intelligent handoff to humans',
    ],
  },
  {
    category: 'Business Tools',
    items: [
      'Real-time dashboard',
      'Conversation analytics',
      'Order management',
      'Booking integration',
      'Cost tracking & budgets',
    ],
  },
  {
    category: 'Support & Security',
    items: [
      'Email support',
      'Secure data handling',
      'Australian data residency',
      'Regular updates',
      'API access',
    ],
  },
];

const FAQ = [
  {
    question: 'What is included in the setup fee?',
    answer: 'The one-time setup fee covers your account configuration, industry-specific AI template setup, phone number provisioning, and initial training of your AI agent to understand your business.',
  },
  {
    question: 'Can I cancel anytime?',
    answer: 'Yes! There are no lock-in contracts. You can cancel your weekly subscription at any time. Your AI agent will remain active until the end of your paid period.',
  },
  {
    question: 'Are there any usage limits?',
    answer: 'Your plan includes generous monthly budgets for AI processing ($50/month) and messaging ($30/month). Most businesses stay well within these limits. You can monitor usage in real-time on your dashboard.',
  },
  {
    question: 'What happens if I exceed my budget?',
    answer: 'You can configure hard limits to automatically pause services, or allow overage with transparent per-unit pricing. We\'ll always notify you before any additional charges.',
  },
  {
    question: 'Do I need a Twilio account?',
    answer: 'No! We handle all the technical setup. Your phone number and messaging infrastructure are included in your subscription.',
  },
  {
    question: 'Can I try before I buy?',
    answer: 'Yes! Start with our sandbox mode to test your AI agent before going live. You can complete the full setup and test conversations before paying.',
  },
];

export default function PricingPage() {
  return (
    <div className="min-h-screen">
      {/* Hero */}
      <section className="bg-gradient-to-b from-blue-600 to-indigo-700 text-white py-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h1 className="text-4xl md:text-5xl font-bold mb-4">
            Simple, Transparent Pricing
          </h1>
          <p className="text-xl text-blue-100 max-w-2xl mx-auto">
            One plan. Everything included. No hidden fees.
          </p>
        </div>
      </section>

      {/* Pricing Card */}
      <section className="py-16 -mt-10">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="bg-white rounded-2xl shadow-xl border overflow-hidden">
            <div className="p-8 md:p-12">
              {/* Price Header */}
              <div className="text-center mb-8">
                <div className="inline-block px-4 py-1 bg-blue-100 text-blue-800 rounded-full text-sm font-medium mb-4">
                  All-Inclusive Plan
                </div>
                <div className="flex items-center justify-center gap-2">
                  <span className="text-5xl font-bold">${PRICING.weeklySubscription}</span>
                  <span className="text-gray-500">/week</span>
                </div>
                <p className="text-gray-600 mt-2">
                  + ${PRICING.setupFee} one-time setup fee
                </p>
              </div>

              {/* CTA */}
              <div className="text-center mb-8">
                <Link href="http://localhost:3001/login">
                  <Button variant="primary" size="lg" className="px-8">
                    Get Started
                  </Button>
                </Link>
                <p className="text-sm text-gray-500 mt-3">
                  Start with free sandbox testing • No credit card required
                </p>
              </div>

              {/* Features Grid */}
              <div className="border-t pt-8">
                <div className="grid md:grid-cols-3 gap-8">
                  {FEATURES.map((section) => (
                    <div key={section.category}>
                      <h3 className="font-semibold text-gray-900 mb-4">{section.category}</h3>
                      <ul className="space-y-3">
                        {section.items.map((item) => (
                          <li key={item} className="flex items-start gap-2 text-sm text-gray-600">
                            <span className="text-green-500 mt-0.5">✓</span>
                            {item}
                          </li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Bottom Banner */}
            <div className="bg-gray-50 px-8 py-6 border-t">
              <div className="flex flex-col md:flex-row items-center justify-between gap-4">
                <div className="text-center md:text-left">
                  <div className="font-medium text-gray-900">Need a custom solution?</div>
                  <div className="text-sm text-gray-600">Contact us for enterprise pricing and features.</div>
                </div>
                <Link href="/contact">
                  <Button variant="outline">Contact Sales</Button>
                </Link>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Cost Breakdown */}
      <section className="py-16 bg-gray-50">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          <h2 className="text-2xl font-bold text-center mb-8">What&apos;s Included</h2>
          <div className="grid md:grid-cols-2 gap-6">
            <div className="bg-white rounded-lg p-6 border">
              <div className="flex items-center gap-3 mb-4">
                <span className="text-3xl">🤖</span>
                <div>
                  <div className="font-semibold">AI Processing</div>
                  <div className="text-sm text-gray-500">$50/month budget included</div>
                </div>
              </div>
              <p className="text-gray-600 text-sm">
                Powered by GPT-4o-mini for fast, intelligent responses. Typically handles 1,000+ conversations per month.
              </p>
            </div>
            <div className="bg-white rounded-lg p-6 border">
              <div className="flex items-center gap-3 mb-4">
                <span className="text-3xl">📱</span>
                <div>
                  <div className="font-semibold">Messaging & Voice</div>
                  <div className="text-sm text-gray-500">$30/month budget included</div>
                </div>
              </div>
              <p className="text-gray-600 text-sm">
                SMS, WhatsApp, and voice calls via Twilio. Australian phone number included with your subscription.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section className="py-16">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
          <h2 className="text-2xl font-bold text-center mb-8">Frequently Asked Questions</h2>
          <div className="space-y-6">
            {FAQ.map((item) => (
              <div key={item.question} className="bg-white rounded-lg border p-6">
                <h3 className="font-semibold text-gray-900 mb-2">{item.question}</h3>
                <p className="text-gray-600">{item.answer}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-16 bg-blue-600 text-white">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h2 className="text-3xl font-bold mb-4">Ready to Get Started?</h2>
          <p className="text-xl text-blue-100 mb-8">
            Set up your AI agent in minutes. No technical skills required.
          </p>
          <Link href="http://localhost:3001/login">
            <Button variant="secondary" size="lg">
              Start Free Trial
            </Button>
          </Link>
        </div>
      </section>
    </div>
  );
}
