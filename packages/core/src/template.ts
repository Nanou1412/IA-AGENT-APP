/**
 * Template interfaces - placeholder for versioned templates
 */

export interface TemplateConfig {
  id: string;
  name: string;
  version: string;
  industry: string;
  description: string;
  tools: string[];
  prompts: Record<string, string>;
  createdAt: Date;
  updatedAt: Date;
}

export interface Template {
  config: TemplateConfig;
  validate: () => boolean;
  apply: (context: unknown) => unknown;
}
