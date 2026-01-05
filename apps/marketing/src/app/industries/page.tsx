import type { Metadata } from 'next';
import Link from 'next/link';
import { Button } from '@repo/ui';
import { getIndustries } from '@/lib/industries';

export const metadata: Metadata = {
  title: 'Industries We Serve | IA Agent App',
  description: 'Specialised AI agents for restaurants, hotels, tradies and more. Find the perfect solution for your industry.',
};

export default function IndustriesPage() {
  const industries = getIndustries();

  return (
    <div className="min-h-screen py-20">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-16">
          <h1 className="text-4xl md:text-5xl font-bold mb-4">Industries We Serve</h1>
          <p className="text-xl text-gray-600 max-w-2xl mx-auto">
            Specialised AI agents designed for your industry. Choose your business type to see how we can help.
          </p>
        </div>

        <div className="grid md:grid-cols-3 gap-8">
          {industries.map((industry) => (
            <div
              key={industry.slug}
              className="bg-white border rounded-xl p-8 hover:shadow-lg transition-all hover:-translate-y-1"
            >
              <div className="text-4xl mb-4">{industry.icon}</div>
              <h2 className="text-2xl font-semibold mb-2">{industry.title}</h2>
              <p className="text-gray-600 mb-6">{industry.subtitle}</p>
              <ul className="text-sm text-gray-500 mb-6 space-y-2">
                {industry.bullets.slice(0, 3).map((bullet, index) => (
                  <li key={index} className="flex items-start">
                    <span className="text-green-500 mr-2">✓</span>
                    {bullet}
                  </li>
                ))}
              </ul>
              <Link href={`/${industry.slug}`}>
                <Button variant="primary" className="w-full">
                  Learn More
                </Button>
              </Link>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
