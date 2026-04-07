import config from "./agents-config.json" with { type: "json" };
import type { AgentConfig } from "./types.js";

const agents = config.agents as AgentConfig[];

export function getEnabledAgents(): AgentConfig[] {
  return agents.filter((a) => a.enabled);
}

export function getAllAgents(): AgentConfig[] {
  return [...agents];
}

export function getAgentById(id: string): AgentConfig | undefined {
  return agents.find((a) => a.id === id);
}

export function getEnabledXAccounts(): Array<{ account: string; agentId: string }> {
  return getEnabledAgents().flatMap((agent) =>
    agent.xAccounts.map((account) => ({ account, agentId: agent.id })),
  );
}
