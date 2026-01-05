import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { Button } from '@repo/ui';
import { getIndustryBySlug, getIndustrySlugs } from '@/lib/industries';
import { GetStartedButton } from '@/components/get-started-button';

interface IndustryPageProps {
  params: { industry: string };
}

export async function generateStaticParams() {
  return getIndustrySlugs().map((slug) => ({
    industry: slug,
  }));
}

export async function generateMetadata({ params }: IndustryPageProps): Promise<Metadata> {
  const industry = getIndustryBySlug(params.industry);
  
  if (!industry) {
    return {
      title: 'Not Found | IA Agent App',
    };
  }

  return {
    title: `${industry.title} AI Agent | IA Agent App`,
    description: industry.description,
  };
}

export default function IndustryPage({ params }: IndustryPageProps) {
  const industry = getIndustryBySlug(params.industry);

  if (!industry) {
    notFound();
  }

  return (
    <div className="min-h-screen">
      {/* Hero Section */}
      <section className="bg-gradient-to-r from-blue-600 to-indigo-700 text-white py-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center">
            <span className="text-6xl mb-6 block">{industry.icon}</span>
            <h1 className="text-4xl md:text-5xl font-bold mb-4">{industry.title} AI Agent</h1>
            <p className="text-xl md:text-2xl text-blue-100 max-w-3xl mx-auto mb-8">
              {industry.subtitle}
            </p>
            <div className="flex gap-4 justify-center flex-wrap">
              <GetStartedButton industry={industry.slug} variant="secondary" size="lg">
                {industry.primaryCTA}
              </GetStartedButton>
              {industry.secondaryCTA && (
                <Button variant="outline" size="lg" className="!text-white !border-white hover:!bg-white/10">
                  {industry.secondaryCTA}
                </Button>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* Description Section */}
      <section className="py-16 bg-gray-50">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <p className="text-lg text-gray-700 leading-relaxed">
            {industry.description}
          </p>
        </div>
      </section>

      {/* Features Section */}
      <section className="py-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid md:grid-cols-2 gap-12 items-start">
            <div>
              <h2 className="text-3xl font-bold mb-6">What You Get</h2>
              <ul className="space-y-4">
                {industry.bullets.map((bullet, index) => (
                  <li key={index} className="flex items-start">
                    <span className="text-green-500 mr-3 text-xl">✓</span>
                    <span className="text-gray-700">{bullet}</span>
                  </li>
                ))}
              </ul>
              <div className="mt-8">
                <GetStartedButton industry={industry.slug} size="lg">
                  {industry.primaryCTA}
                </GetStartedButton>
              </div>
            </div>

            <div className="bg-white rounded-xl border p-8">
              <h3 className="text-xl font-semibold mb-4">Recommended Modules</h3>
              <div className="flex flex-wrap gap-2">
                {industry.recommendedModules.map((module) => (
                  <span
                    key={module}
                    className="px-3 py-1 bg-blue-100 text-blue-800 rounded-full text-sm font-medium"
                  >
                    {module}
                  </span>
                ))}
              </div>
              <p className="text-sm text-gray-500 mt-4">
                These modules are pre-configured and optimised for {industry.title.toLowerCase()} businesses.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-20 bg-blue-600 text-white">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h2 className="text-3xl font-bold mb-4">Ready to Transform Your Business?</h2>
          <p className="text-blue-100 mb-8 text-lg">
            Get started with your {industry.title.toLowerCase()} AI agent today. No credit card required.
          </p>
          <GetStartedButton industry={industry.slug} variant="secondary" size="lg">
            {industry.primaryCTA}
          </GetStartedButton>
        </div>
      </section>

      {/* Back Link */}
      <section className="py-8 border-t">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <Link href="/industries" className="text-blue-600 hover:underline">
            ← View all industries
          </Link>
        </div>
      </section>
    </div>
  );
}
