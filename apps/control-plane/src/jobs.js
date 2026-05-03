import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { loadAgentPrompt } from "./agents.js";
import { jobsDir } from "./catalog.js";

const jobs = new Map();
let runningJobs = 0;

export async function createJob({ agent, prompt }) {
  assertPrompt(prompt);
  const maxParallel = Number(process.env.AGENCY_MAX_PARALLEL_JOBS || "1");
  if (runningJobs >= maxParallel) {
    const error = new Error("Job concurrency limit reached");
    error.statusCode = 429;
    throw error;
  }

  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  const job = { id, agent, status: "queued", createdAt: now, updatedAt: now };
  jobs.set(id, job);

  const dir = path.join(jobsDir(), id);
  await fs.mkdir(dir, { recursive: true });
  await writeJson(path.join(dir, "request.json"), { agent, prompt, createdAt: now });

  void runJob(job, prompt, dir);
  return job;
}

export function getJob(id) {
  return jobs.get(id) || null;
}

export function listJobs() {
  return [...jobs.values()].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function getJobResult(id) {
  if (!/^[a-f0-9-]+$/.test(id)) return null;
  try {
    return await fs.readFile(path.join(jobsDir(), id, "result.md"), "utf8");
  } catch {
    return null;
  }
}

async function runJob(job, userPrompt, dir) {
  runningJobs += 1;
  updateJob(job, { status: "running" });
  try {
    const system = await loadAgentPrompt(job.agent);
    const result = await callProvider(system, userPrompt);
    await fs.writeFile(path.join(dir, "result.md"), result, "utf8");
    updateJob(job, { status: "succeeded", resultPath: path.join(dir, "result.md") });
  } catch (error) {
    await fs.writeFile(path.join(dir, "stderr.log"), String(error.stack || error.message || error), "utf8");
    updateJob(job, { status: "failed", error: String(error.message || error) });
  } finally {
    runningJobs -= 1;
    await writeJson(path.join(dir, "job.json"), job);
  }
}

function updateJob(job, patch) {
  Object.assign(job, patch, { updatedAt: new Date().toISOString() });
}

function assertPrompt(prompt) {
  if (typeof prompt !== "string" || !prompt.trim()) {
    const error = new Error("prompt is required");
    error.statusCode = 400;
    throw error;
  }
  if (prompt.length > Number(process.env.AGENCY_MAX_PROMPT_CHARS || "20000")) {
    const error = new Error("prompt exceeds max length");
    error.statusCode = 413;
    throw error;
  }
}

async function callProvider(system, prompt) {
  if (process.env.OPENAI_API_KEY && !process.env.OPENAI_API_KEY.includes("<")) {
    return callOpenAI(system, prompt);
  }
  return [
    "# Dry Run Result",
    "",
    "No LLM provider key is configured. The job pipeline, agent loading, and artifact writing path are working.",
    "",
    "Prompt received:",
    prompt,
  ].join("\n");
}

async function callOpenAI(system, prompt) {
  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model: process.env.OPENAI_MODEL || "gpt-4.1-mini",
      messages: [
        { role: "system", content: system },
        { role: "user", content: prompt },
      ],
      temperature: 0.2,
    }),
  });
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`OpenAI request failed ${response.status}: ${text}`);
  }
  const data = JSON.parse(text);
  return data.choices?.[0]?.message?.content || "";
}

async function writeJson(file, value) {
  await fs.writeFile(file, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}
