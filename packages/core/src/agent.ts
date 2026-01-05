/**
 * Agent interfaces - placeholder for future agent implementations
 */

export interface AgentConfig {
  id: string;
  name: string;
  description: string;
  industry?: string;
  tools: string[];
  createdAt: Date;
  updatedAt: Date;
}

export interface Agent {
  config: AgentConfig;
  start: () => Promise<void>;
  stop: () => Promise<void>;
  process: (message: string) => Promise<string>;
}
