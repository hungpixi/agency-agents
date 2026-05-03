import http from "node:http";
import { getAgent, listAgents } from "./agents.js";
import { requireAuth } from "./auth.js";
import { readiness, syncCatalog } from "./catalog.js";
import { createJob, getJob, getJobResult, listJobs } from "./jobs.js";

const port = Number(process.env.PORT || "3000");

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url || "/", "http://localhost");

    if (req.method === "GET" && url.pathname === "/healthz") {
      return json(res, 200, { ok: true });
    }

    if (req.method === "GET" && url.pathname === "/readyz") {
      const state = await readiness();
      return json(res, state.ok ? 200 : 503, state);
    }

    requireAuth(req);

    if (req.method === "GET" && url.pathname === "/agents") {
      return json(res, 200, { agents: await listAgents() });
    }

    const agentMatch = url.pathname.match(/^\/agents\/([a-z0-9-]+)$/);
    if (req.method === "GET" && agentMatch) {
      const agent = await getAgent(agentMatch[1]);
      return agent ? json(res, 200, agent) : json(res, 404, { error: "not found" });
    }

    if (req.method === "POST" && url.pathname === "/jobs") {
      const body = await readJson(req);
      const job = await createJob(body);
      return json(res, 202, job);
    }

    if (req.method === "GET" && url.pathname === "/jobs") {
      return json(res, 200, { jobs: listJobs() });
    }

    const jobMatch = url.pathname.match(/^\/jobs\/([a-f0-9-]+)$/);
    if (req.method === "GET" && jobMatch) {
      const job = getJob(jobMatch[1]);
      return job ? json(res, 200, job) : json(res, 404, { error: "not found" });
    }

    const resultMatch = url.pathname.match(/^\/jobs\/([a-f0-9-]+)\/result$/);
    if (req.method === "GET" && resultMatch) {
      const result = await getJobResult(resultMatch[1]);
      return result ? text(res, 200, result) : json(res, 404, { error: "not found" });
    }

    if (req.method === "POST" && url.pathname === "/sync") {
      const result = await syncCatalog();
      return json(res, 200, result);
    }

    return json(res, 404, { error: "not found" });
  } catch (error) {
    const status = error.statusCode || 500;
    return json(res, status, { error: error.message || "internal error" });
  }
});

server.listen(port, "0.0.0.0", () => {
  console.log(`agency control plane listening on ${port}`);
});

function json(res, status, body) {
  res.writeHead(status, { "content-type": "application/json" });
  res.end(`${JSON.stringify(body)}\n`);
}

function text(res, status, body) {
  res.writeHead(status, { "content-type": "text/markdown; charset=utf-8" });
  res.end(body);
}

async function readJson(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const text = Buffer.concat(chunks).toString("utf8");
  return text ? JSON.parse(text) : {};
}
