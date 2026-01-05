// Templates package - placeholder for versioned industry templates
// JSON templates will be added here

export const TEMPLATE_VERSION = '0.0.0';

// Placeholder function to get templates
export function getTemplate(industry: string, version: string): unknown {
  // TODO: Implement template loading from JSON files
  console.log(`Loading template: ${industry}@${version}`);
  return null;
}

// List available industries
export function getAvailableIndustries(): string[] {
  return ['restaurant', 'hotel', 'tradie'];
}
