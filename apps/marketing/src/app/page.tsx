import { Button } from '@repo/ui';

export default function HomePage() {
  return (
    <div className="min-h-screen">
      {/* Hero Section */}
      <section className="bg-gradient-to-r from-blue-600 to-indigo-700 text-white py-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h1 className="text-4xl md:text-6xl font-bold mb-6">
            AI Agents for Your Business
          </h1>
          <p className="text-xl md:text-2xl mb-8 text-blue-100">
            Automate customer interactions with intelligent AI agents tailored to your industry.
          </p>
          <div className="flex gap-4 justify-center">
            <Button variant="secondary" size="lg">
              Get Started
            </Button>
            <Button variant="outline" size="lg" className="!text-white !border-white hover:!bg-white/10">
              Learn More
            </Button>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section className="py-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <h2 className="text-3xl font-bold text-center mb-12">
            Why Choose IA Agent App?
          </h2>
          <div className="grid md:grid-cols-3 gap-8">
            <div className="p-6 border rounded-lg">
              <h3 className="text-xl font-semibold mb-3">Industry-Specific</h3>
              <p className="text-gray-600">
                Pre-built templates for restaurants, hotels, tradies, and more.
              </p>
            </div>
            <div className="p-6 border rounded-lg">
              <h3 className="text-xl font-semibold mb-3">Easy Setup</h3>
              <p className="text-gray-600">
                Get your AI agent running in minutes, not weeks.
              </p>
            </div>
            <div className="p-6 border rounded-lg">
              <h3 className="text-xl font-semibold mb-3">Fully Customizable</h3>
              <p className="text-gray-600">
                Tailor your agent&apos;s responses to match your brand voice.
              </p>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
