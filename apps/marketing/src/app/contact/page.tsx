import type { Metadata } from 'next';
import { Button } from '@repo/ui';

export const metadata: Metadata = {
  title: 'Contact Us | IA Agent App',
  description: 'Get in touch with our team. We\'re here to help you get started with AI-powered customer service.',
};

export default function ContactPage() {
  return (
    <div className="min-h-screen py-16">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="text-center mb-12">
          <h1 className="text-4xl font-bold mb-4">Contact Us</h1>
          <p className="text-xl text-gray-600 max-w-2xl mx-auto">
            Have questions? We&apos;re here to help. Reach out and we&apos;ll get back to you as soon as possible.
          </p>
        </div>

        <div className="grid md:grid-cols-2 gap-12">
          {/* Contact Form */}
          <div className="bg-white rounded-xl border p-8">
            <h2 className="text-xl font-semibold mb-6">Send us a Message</h2>
            <form className="space-y-6">
              <div className="grid md:grid-cols-2 gap-4">
                <div>
                  <label htmlFor="firstName" className="block text-sm font-medium text-gray-700 mb-1">
                    First Name *
                  </label>
                  <input
                    type="text"
                    id="firstName"
                    name="firstName"
                    required
                    className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>
                <div>
                  <label htmlFor="lastName" className="block text-sm font-medium text-gray-700 mb-1">
                    Last Name *
                  </label>
                  <input
                    type="text"
                    id="lastName"
                    name="lastName"
                    required
                    className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>
              </div>

              <div>
                <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-1">
                  Email *
                </label>
                <input
                  type="email"
                  id="email"
                  name="email"
                  required
                  className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>

              <div>
                <label htmlFor="businessName" className="block text-sm font-medium text-gray-700 mb-1">
                  Business Name
                </label>
                <input
                  type="text"
                  id="businessName"
                  name="businessName"
                  className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>

              <div>
                <label htmlFor="industry" className="block text-sm font-medium text-gray-700 mb-1">
                  Industry
                </label>
                <select
                  id="industry"
                  name="industry"
                  className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                >
                  <option value="">Select your industry</option>
                  <option value="restaurant">Restaurant / Hospitality</option>
                  <option value="hotel">Hotel / Accommodation</option>
                  <option value="tradie">Trades & Services</option>
                  <option value="retail">Retail</option>
                  <option value="healthcare">Healthcare</option>
                  <option value="other">Other</option>
                </select>
              </div>

              <div>
                <label htmlFor="subject" className="block text-sm font-medium text-gray-700 mb-1">
                  Subject *
                </label>
                <select
                  id="subject"
                  name="subject"
                  required
                  className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                >
                  <option value="">Select a subject</option>
                  <option value="sales">Sales Enquiry</option>
                  <option value="demo">Request a Demo</option>
                  <option value="support">Technical Support</option>
                  <option value="billing">Billing Question</option>
                  <option value="partnership">Partnership Opportunity</option>
                  <option value="other">Other</option>
                </select>
              </div>

              <div>
                <label htmlFor="message" className="block text-sm font-medium text-gray-700 mb-1">
                  Message *
                </label>
                <textarea
                  id="message"
                  name="message"
                  rows={5}
                  required
                  placeholder="How can we help you?"
                  className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>

              <Button variant="primary" type="submit" className="w-full">
                Send Message
              </Button>
            </form>
          </div>

          {/* Contact Info */}
          <div className="space-y-8">
            {/* Info Cards */}
            <div className="bg-gradient-to-br from-blue-50 to-indigo-50 rounded-xl p-8">
              <h2 className="text-xl font-semibold mb-6">Get in Touch</h2>
              <div className="space-y-6">
                <div className="flex items-start gap-4">
                  <span className="text-2xl">📧</span>
                  <div>
                    <div className="font-medium">Email</div>
                    <a href="mailto:hello@iaagent.app" className="text-blue-600 hover:underline">
                      hello@iaagent.app
                    </a>
                  </div>
                </div>
                <div className="flex items-start gap-4">
                  <span className="text-2xl">📍</span>
                  <div>
                    <div className="font-medium">Location</div>
                    <div className="text-gray-600">Sydney, Australia</div>
                  </div>
                </div>
                <div className="flex items-start gap-4">
                  <span className="text-2xl">🕐</span>
                  <div>
                    <div className="font-medium">Response Time</div>
                    <div className="text-gray-600">Within 24 hours</div>
                  </div>
                </div>
              </div>
            </div>

            {/* Quick Links */}
            <div className="bg-white rounded-xl border p-8">
              <h2 className="text-xl font-semibold mb-6">Quick Links</h2>
              <div className="space-y-4">
                <a href="/pricing" className="flex items-center gap-3 text-gray-700 hover:text-blue-600 transition-colors">
                  <span className="text-xl">💰</span>
                  <span>View Pricing</span>
                </a>
                <a href="/industries" className="flex items-center gap-3 text-gray-700 hover:text-blue-600 transition-colors">
                  <span className="text-xl">🏢</span>
                  <span>Industries We Serve</span>
                </a>
                <a href="http://localhost:3001/login" className="flex items-center gap-3 text-gray-700 hover:text-blue-600 transition-colors">
                  <span className="text-xl">🚀</span>
                  <span>Get Started Free</span>
                </a>
              </div>
            </div>

            {/* FAQ Link */}
            <div className="bg-gray-50 rounded-xl p-6 text-center">
              <div className="text-4xl mb-3">❓</div>
              <h3 className="font-semibold mb-2">Have Questions?</h3>
              <p className="text-gray-600 text-sm mb-4">
                Check out our frequently asked questions on the pricing page.
              </p>
              <a href="/pricing#faq" className="text-blue-600 hover:underline text-sm font-medium">
                View FAQ →
              </a>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
