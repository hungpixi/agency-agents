import fs from "node:fs/promises";
import path from "node:path";
import { openclawCatalogDir } from "./catalog.js";

export function catalogDir() {
  return openclawCatalogDir();
}

export async function listAgents() {
  const root = catalogDir();
  let entries;
  try {
    entries = await fs.readdir(root, { withFileTypes: true });
  } catch {
    return [];
  }

  const agents = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const dir = path.join(root, entry.name);
    const identity = await readOptional(path.join(dir, "IDENTITY.md"));
    const title = identity.split(/\r?\n/).find((line) => line.startsWith("# "));
    agents.push({
      id: entry.name,
      name: title ? title.replace(/^#\s*/, "").trim() : entry.name,
    });
  }
  return agents.sort((a, b) => a.id.localeCompare(b.id));
}

export async function loadAgentPrompt(agentId) {
  if (!/^[a-z0-9-]+$/.test(agentId)) {
    throw new Error("Invalid agent id");
  }
  const dir = path.join(catalogDir(), agentId);
  const [identity, soul, instructions] = await Promise.all([
    readOptional(path.join(dir, "IDENTITY.md")),
    readOptional(path.join(dir, "SOUL.md")),
    readOptional(path.join(dir, "AGENTS.md")),
  ]);
  if (!identity && !soul && !instructions) {
    throw new Error(`Agent not found: ${agentId}`);
  }
  return [identity, soul, instructions].filter(Boolean).join("\n\n");
}

export async function getAgent(agentId) {
  const agents = await listAgents();
  const agent = agents.find((item) => item.id === agentId);
  if (!agent) return null;
  return {
    ...agent,
    prompt: await loadAgentPrompt(agentId),
  };
}

async function readOptional(file) {
  try {
    return await fs.readFile(file, "utf8");
  } catch {
    return "";
  }
}
