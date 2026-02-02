import { Button } from '@repo/ui';
import Link from 'next/link';

export default function HomePage() {
  return (
    <div className="min-h-screen">
      {/* Hero Section */}
      <section className="bg-gradient-to-br from-blue-600 via-indigo-700 to-purple-800 text-white py-24 relative overflow-hidden">
        {/* Background decoration */}
        <div className="absolute inset-0 opacity-10">
          <div className="absolute top-20 left-10 w-72 h-72 bg-white rounded-full blur-3xl" />
          <div className="absolute bottom-20 right-10 w-96 h-96 bg-white rounded-full blur-3xl" />
        </div>
        
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center relative z-10">
          <span className="inline-block px-4 py-2 bg-white/10 rounded-full text-sm font-medium mb-6 backdrop-blur-sm">
            🚀 AI-Powered Customer Service for Australian Businesses
          </span>
          <h1 className="text-4xl md:text-6xl font-bold mb-6 leading-tight">
            Stop Missing Calls.<br />
            <span className="text-blue-200">Let AI Handle It.</span>
          </h1>
          <p className="text-xl md:text-2xl mb-8 text-blue-100 max-w-3xl mx-auto">
            Intelligent AI agents that answer SMS, WhatsApp, and voice calls 24/7. 
            Perfect for restaurants, hotels, and service businesses.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link href="/pricing">
              <Button variant="secondary" size="lg" className="w-full sm:w-auto">
                Start Free Trial
              </Button>
            </Link>
            <Link href="/contact">
              <Button variant="outline" size="lg" className="!text-white !border-white hover:!bg-white/10 w-full sm:w-auto">
                Book a Demo
              </Button>
            </Link>
          </div>
          <p className="mt-6 text-sm text-blue-200">
            No credit card required • Setup in 5 minutes • Cancel anytime
          </p>
        </div>
      </section>

      {/* Stats Banner */}
      <section className="bg-gray-50 py-8 border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8 text-center">
            <div>
              <p className="text-3xl font-bold text-blue-600">500+</p>
              <p className="text-sm text-gray-600">Businesses Served</p>
            </div>
            <div>
              <p className="text-3xl font-bold text-blue-600">1M+</p>
              <p className="text-sm text-gray-600">Messages Handled</p>
            </div>
            <div>
              <p className="text-3xl font-bold text-blue-600">24/7</p>
              <p className="text-sm text-gray-600">Availability</p>
            </div>
            <div>
              <p className="text-3xl font-bold text-blue-600">95%</p>
              <p className="text-sm text-gray-600">Response Rate</p>
            </div>
          </div>
        </div>
      </section>

      {/* How It Works */}
      <section className="py-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <h2 className="text-3xl md:text-4xl font-bold text-center mb-4">
            How It Works
          </h2>
          <p className="text-gray-600 text-center mb-12 max-w-2xl mx-auto">
            Get your AI agent running in just three simple steps
          </p>
          <div className="grid md:grid-cols-3 gap-8">
            <div className="text-center">
              <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <span className="text-2xl font-bold text-blue-600">1</span>
              </div>
              <h3 className="text-xl font-semibold mb-3">Choose Your Template</h3>
              <p className="text-gray-600">
                Select from restaurant, hotel, tradie, or custom templates designed for your industry.
              </p>
            </div>
            <div className="text-center">
              <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <span className="text-2xl font-bold text-blue-600">2</span>
              </div>
              <h3 className="text-xl font-semibold mb-3">Customize Your Agent</h3>
              <p className="text-gray-600">
                Add your business info, menu, services, hours, and customize the AI&apos;s tone and responses.
              </p>
            </div>
            <div className="text-center">
              <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <span className="text-2xl font-bold text-blue-600">3</span>
              </div>
              <h3 className="text-xl font-semibold mb-3">Connect & Go Live</h3>
              <p className="text-gray-600">
                Link your phone number via Twilio and your AI agent starts handling calls immediately.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section className="py-20 bg-gray-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <h2 className="text-3xl md:text-4xl font-bold text-center mb-4">
            Everything You Need
          </h2>
          <p className="text-gray-600 text-center mb-12 max-w-2xl mx-auto">
            Powerful features built for Australian small businesses
          </p>
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
            <div className="bg-white p-6 rounded-xl shadow-sm border hover:shadow-md transition-shadow">
              <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center mb-4">
                <span className="text-2xl">💬</span>
              </div>
              <h3 className="text-xl font-semibold mb-3">Multi-Channel Support</h3>
              <p className="text-gray-600">
                SMS, WhatsApp, and Voice — all from one dashboard. Meet customers where they are.
              </p>
            </div>
            <div className="bg-white p-6 rounded-xl shadow-sm border hover:shadow-md transition-shadow">
              <div className="w-12 h-12 bg-green-100 rounded-lg flex items-center justify-center mb-4">
                <span className="text-2xl">🧠</span>
              </div>
              <h3 className="text-xl font-semibold mb-3">Smart AI Engine</h3>
              <p className="text-gray-600">
                Powered by GPT-4o. Understands context, handles complex requests, and learns from interactions.
              </p>
            </div>
            <div className="bg-white p-6 rounded-xl shadow-sm border hover:shadow-md transition-shadow">
              <div className="w-12 h-12 bg-purple-100 rounded-lg flex items-center justify-center mb-4">
                <span className="text-2xl">🍽️</span>
              </div>
              <h3 className="text-xl font-semibold mb-3">Industry Templates</h3>
              <p className="text-gray-600">
                Pre-built for restaurants (takeaway orders), hotels (bookings), and tradies (quotes).
              </p>
            </div>
            <div className="bg-white p-6 rounded-xl shadow-sm border hover:shadow-md transition-shadow">
              <div className="w-12 h-12 bg-orange-100 rounded-lg flex items-center justify-center mb-4">
                <span className="text-2xl">📊</span>
              </div>
              <h3 className="text-xl font-semibold mb-3">Real-Time Analytics</h3>
              <p className="text-gray-600">
                Track conversations, costs, response rates, and customer satisfaction in real-time.
              </p>
            </div>
            <div className="bg-white p-6 rounded-xl shadow-sm border hover:shadow-md transition-shadow">
              <div className="w-12 h-12 bg-red-100 rounded-lg flex items-center justify-center mb-4">
                <span className="text-2xl">💳</span>
              </div>
              <h3 className="text-xl font-semibold mb-3">Stripe Payments</h3>
              <p className="text-gray-600">
                Accept payments directly through conversations. Secure, PCI-compliant checkout.
              </p>
            </div>
            <div className="bg-white p-6 rounded-xl shadow-sm border hover:shadow-md transition-shadow">
              <div className="w-12 h-12 bg-cyan-100 rounded-lg flex items-center justify-center mb-4">
                <span className="text-2xl">🔒</span>
              </div>
              <h3 className="text-xl font-semibold mb-3">Enterprise Security</h3>
              <p className="text-gray-600">
                End-to-end encryption, GDPR compliant, with full conversation audit trails.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Industries Section */}
      <section className="py-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <h2 className="text-3xl md:text-4xl font-bold text-center mb-4">
            Built for Your Industry
          </h2>
          <p className="text-gray-600 text-center mb-12 max-w-2xl mx-auto">
            Specialized AI agents that understand your business
          </p>
          <div className="grid md:grid-cols-3 gap-8">
            <Link href="/restaurant" className="group">
              <div className="bg-white rounded-xl border overflow-hidden hover:shadow-lg transition-shadow">
                <div className="h-48 bg-gradient-to-br from-orange-400 to-red-500 flex items-center justify-center">
                  <span className="text-6xl">🍕</span>
                </div>
                <div className="p-6">
                  <h3 className="text-xl font-semibold mb-2 group-hover:text-blue-600 transition-colors">
                    Restaurants & Cafes
                  </h3>
                  <p className="text-gray-600 text-sm">
                    Handle takeaway orders, table bookings, menu inquiries, and dietary questions automatically.
                  </p>
                </div>
              </div>
            </Link>
            <Link href="/hotel" className="group">
              <div className="bg-white rounded-xl border overflow-hidden hover:shadow-lg transition-shadow">
                <div className="h-48 bg-gradient-to-br from-blue-400 to-indigo-500 flex items-center justify-center">
                  <span className="text-6xl">🏨</span>
                </div>
                <div className="p-6">
                  <h3 className="text-xl font-semibold mb-2 group-hover:text-blue-600 transition-colors">
                    Hotels & Accommodations
                  </h3>
                  <p className="text-gray-600 text-sm">
                    Manage room bookings, availability checks, amenity info, and guest requests 24/7.
                  </p>
                </div>
              </div>
            </Link>
            <Link href="/tradie" className="group">
              <div className="bg-white rounded-xl border overflow-hidden hover:shadow-lg transition-shadow">
                <div className="h-48 bg-gradient-to-br from-yellow-400 to-orange-500 flex items-center justify-center">
                  <span className="text-6xl">🔧</span>
                </div>
                <div className="p-6">
                  <h3 className="text-xl font-semibold mb-2 group-hover:text-blue-600 transition-colors">
                    Tradies & Services
                  </h3>
                  <p className="text-gray-600 text-sm">
                    Capture quote requests, schedule appointments, and handle service inquiries while on the job.
                  </p>
                </div>
              </div>
            </Link>
          </div>
        </div>
      </section>

      {/* Testimonials */}
      <section className="py-20 bg-gray-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <h2 className="text-3xl md:text-4xl font-bold text-center mb-12">
            What Our Customers Say
          </h2>
          <div className="grid md:grid-cols-3 gap-8">
            <div className="bg-white p-6 rounded-xl shadow-sm border">
              <div className="flex items-center mb-4">
                {[1,2,3,4,5].map(i => (
                  <span key={i} className="text-yellow-400">★</span>
                ))}
              </div>
              <p className="text-gray-600 mb-4">
                &ldquo;We used to miss half our after-hours calls. Now our AI handles takeaway orders 24/7. 
                Revenue is up 30% since we started.&rdquo;
              </p>
              <div className="flex items-center">
                <div className="w-10 h-10 bg-orange-100 rounded-full flex items-center justify-center mr-3">
                  <span>🍜</span>
                </div>
                <div>
                  <p className="font-semibold">Maria Chen</p>
                  <p className="text-sm text-gray-500">Golden Dragon, Sydney</p>
                </div>
              </div>
            </div>
            <div className="bg-white p-6 rounded-xl shadow-sm border">
              <div className="flex items-center mb-4">
                {[1,2,3,4,5].map(i => (
                  <span key={i} className="text-yellow-400">★</span>
                ))}
              </div>
              <p className="text-gray-600 mb-4">
                &ldquo;Guests love being able to message us on WhatsApp. The AI handles 80% of inquiries 
                perfectly, and escalates the rest to our team.&rdquo;
              </p>
              <div className="flex items-center">
                <div className="w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center mr-3">
                  <span>🏖️</span>
                </div>
                <div>
                  <p className="font-semibold">James Mitchell</p>
                  <p className="text-sm text-gray-500">Coastal Retreat, Gold Coast</p>
                </div>
              </div>
            </div>
            <div className="bg-white p-6 rounded-xl shadow-sm border">
              <div className="flex items-center mb-4">
                {[1,2,3,4,5].map(i => (
                  <span key={i} className="text-yellow-400">★</span>
                ))}
              </div>
              <p className="text-gray-600 mb-4">
                &ldquo;As a one-man plumbing business, I can&apos;t answer calls while under a sink. 
                The AI captures every lead and books them straight into my calendar.&rdquo;
              </p>
              <div className="flex items-center">
                <div className="w-10 h-10 bg-yellow-100 rounded-full flex items-center justify-center mr-3">
                  <span>🔧</span>
                </div>
                <div>
                  <p className="font-semibold">Dave Thompson</p>
                  <p className="text-sm text-gray-500">Thompson Plumbing, Melbourne</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-20 bg-gradient-to-r from-blue-600 to-indigo-700 text-white">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h2 className="text-3xl md:text-4xl font-bold mb-4">
            Ready to Transform Your Customer Service?
          </h2>
          <p className="text-xl text-blue-100 mb-8">
            Join 500+ Australian businesses using AI to handle customer inquiries. 
            Start your free trial today — no credit card required.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link href="/pricing">
              <Button variant="secondary" size="lg" className="w-full sm:w-auto">
                Get Started — $69.90/week
              </Button>
            </Link>
            <Link href="/contact">
              <Button variant="outline" size="lg" className="!text-white !border-white hover:!bg-white/10 w-full sm:w-auto">
                Talk to Sales
              </Button>
            </Link>
          </div>
          <p className="mt-6 text-sm text-blue-200">
            $390 one-time setup fee • Weekly billing • Cancel anytime
          </p>
        </div>
      </section>
    </div>
  );
}
