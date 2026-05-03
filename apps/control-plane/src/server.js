import http from "node:http";
import { listAgents } from "./agents.js";
import { createJob, getJob } from "./jobs.js";

const port = Number(process.env.PORT || "3000");

const server = http.createServer(async (req, res) => {
  try {
    if (req.method === "GET" && req.url === "/healthz") {
      return json(res, 200, { ok: true });
    }

    if (req.method === "GET" && req.url === "/agents") {
      return json(res, 200, { agents: await listAgents() });
    }

    if (req.method === "POST" && req.url === "/jobs") {
      requireAuth(req);
      const body = await readJson(req);
      const job = await createJob(body);
      return json(res, 202, job);
    }

    const jobMatch = req.url?.match(/^\/jobs\/([a-f0-9-]+)$/);
    if (req.method === "GET" && jobMatch) {
      requireAuth(req);
      const job = getJob(jobMatch[1]);
      return job ? json(res, 200, job) : json(res, 404, { error: "not found" });
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

function requireAuth(req) {
  const token = process.env.CONTROL_PLANE_TOKEN;
  if (!token || token.includes("<")) return;
  const auth = req.headers.authorization || "";
  if (auth !== `Bearer ${token}`) {
    const error = new Error("unauthorized");
    error.statusCode = 401;
    throw error;
  }
}

function json(res, status, body) {
  res.writeHead(status, { "content-type": "application/json" });
  res.end(`${JSON.stringify(body)}\n`);
}

async function readJson(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const text = Buffer.concat(chunks).toString("utf8");
  return text ? JSON.parse(text) : {};
}
