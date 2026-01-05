import industriesData from '@/data/industries.json';

export interface Industry {
  slug: string;
  title: string;
  subtitle: string;
  description: string;
  bullets: string[];
  primaryCTA: string;
  secondaryCTA?: string;
  recommendedModules: string[];
  icon: string;
}

export function getIndustries(): Industry[] {
  return industriesData.industries;
}

export function getIndustryBySlug(slug: string): Industry | undefined {
  return industriesData.industries.find((industry) => industry.slug === slug);
}

export function getIndustrySlugs(): string[] {
  return industriesData.industries.map((industry) => industry.slug);
}

export function isValidIndustrySlug(slug: string): boolean {
  return getIndustrySlugs().includes(slug);
}
