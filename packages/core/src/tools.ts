/**
 * Tool interfaces - placeholder for future tool implementations
 */

export interface ToolConfig {
  id: string;
  name: string;
  description: string;
  version: string;
  enabled: boolean;
}

export interface ToolResult {
  success: boolean;
  data?: unknown;
  error?: string;
  timestamp: Date;
}

export interface Tool {
  config: ToolConfig;
  execute: (input: unknown) => Promise<ToolResult>;
  validate: (input: unknown) => boolean;
}
