// ============================================================
// Agent Registry - Defines 5 AI agents with roles & permissions
// ============================================================

export interface AgentInfo {
  id: string;
  name: string;
  role: AgentRole;
  description: string;
  capabilities: string[];
  permissions: string[];
  status: 'idle' | 'busy' | 'error' | 'offline';
  endpoint?: string;
  createdAt: number;
  lastHeartbeat?: number;
}

export type AgentRole = 'brainstorm' | 'rd' | 'design' | 'production' | 'marketing';

export const AGENT_DEFINITIONS: AgentInfo[] = [
  {
    id: 'agent-brainstorm',
    name: 'Brainstorm Agent',
    role: 'brainstorm',
    description: 'Generates creative ideas, strategies, and innovative solutions for business problems',
    capabilities: [
      'idea_generation',
      'strategy_planning',
      'creative_briefing',
      'market_opportunity_analysis',
      'concept_development',
    ],
    permissions: ['read:projects', 'write:tasks', 'read:knowledge_base'],
    status: 'idle',
    createdAt: Date.now(),
  },
  {
    id: 'agent-rd',
    name: 'R&D Agent',
    role: 'rd',
    description: 'Researches and validates technical feasibility, explores new technologies and approaches',
    capabilities: [
      'technical_research',
      'feasibility_analysis',
      'technology_evaluation',
      'prototype_planning',
      'technical_specification',
    ],
    permissions: ['read:projects', 'write:tasks', 'read:knowledge_base', 'read:products'],
    status: 'idle',
    createdAt: Date.now(),
  },
  {
    id: 'agent-design',
    name: 'Design Agent',
    role: 'design',
    description: 'Creates visual designs, UI/UX mockups, branding assets, and design specifications',
    capabilities: [
      'ui_ux_design',
      'branding',
      'visual_design',
      'design_specification',
      'prototype_creation',
    ],
    permissions: ['read:projects', 'write:tasks', 'read:products', 'write:assets'],
    status: 'idle',
    createdAt: Date.now(),
  },
  {
    id: 'agent-production',
    name: 'Production Agent',
    role: 'production',
    description: 'Implements and builds solutions, writes code, configures systems, and deploys',
    capabilities: [
      'implementation',
      'coding',
      'system_configuration',
      'deployment',
      'testing',
      'integration',
    ],
    permissions: ['read:projects', 'write:tasks', 'read:products', 'write:products', 'read:orders', 'write:production'],
    status: 'idle',
    createdAt: Date.now(),
  },
  {
    id: 'agent-marketing',
    name: 'Marketing Agent',
    role: 'marketing',
    description: 'Creates go-to-market strategies, content plans, and promotional campaigns',
    capabilities: [
      'marketing_strategy',
      'content_creation',
      'campaign_planning',
      'seo_analysis',
      'social_media_planning',
      'channel_optimization',
    ],
    permissions: ['read:projects', 'write:tasks', 'read:products', 'read:channels', 'write:campaigns'],
    status: 'idle',
    createdAt: Date.now(),
  },
];

export class AgentRegistry {
  private agents: Map<string, AgentInfo>;

  constructor() {
    this.agents = new Map();
    for (const agent of AGENT_DEFINITIONS) {
      this.agents.set(agent.id, { ...agent });
    }
  }

  getAll(): AgentInfo[] {
    return Array.from(this.agents.values());
  }

  getById(id: string): AgentInfo | undefined {
    return this.agents.get(id);
  }

  getByRole(role: AgentRole): AgentInfo | undefined {
    return Array.from(this.agents.values()).find(a => a.role === role);
  }

  updateStatus(id: string, status: AgentInfo['status']): void {
    const agent = this.agents.get(id);
    if (agent) {
      agent.status = status;
      if (status === 'idle' || status === 'busy') {
        agent.lastHeartbeat = Date.now();
      }
    }
  }

  heartbeat(id: string): void {
    const agent = this.agents.get(id);
    if (agent) {
      agent.lastHeartbeat = Date.now();
      if (agent.status === 'offline') {
        agent.status = 'idle';
      }
    }
  }

  toJSON(): Record<string, AgentInfo> {
    const obj: Record<string, AgentInfo> = {};
    for (const [key, val] of this.agents) {
      obj[key] = val;
    }
    return obj;
  }
}
