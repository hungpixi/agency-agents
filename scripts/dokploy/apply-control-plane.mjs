import crypto from "node:crypto";
import fs from "node:fs";

const envPath = "deploy/dokploy.env";
const localEnvPath = "deploy/control-plane.env";
const env = loadEnv(envPath);
const baseUrl = required("DOKPLOY_BASE_URL").replace(/\/$/, "");
const apiKey = required("DOKPLOY_API_KEY");

const projectName = "agency-agents";
const environmentName = "production";
const appName = "agency-control-plane";
const gitUrl = "https://github.com/hungpixi/agency-agents.git";
const branch = "main";
const dockerfile = "apps/control-plane/Dockerfile";
const port = 3000;

async function main() {
  const runtimeEnv = ensureRuntimeEnv();
  const project = await ensureProject();
  const environment = project.environments?.find((item) => item.name === environmentName) || project.environments?.[0];
  if (!environment) throw new Error(`No environment found for project ${projectName}`);

  const app = await ensureApplication(environment.environmentId);
  await configureSource(app.applicationId);
  await configureBuild(app.applicationId);
  await configureEnvironment(app.applicationId, runtimeEnv);
  await ensureMounts(app.applicationId);
  await maybeConfigureDomain(app.applicationId, runtimeEnv);
  await post("/api/application.deploy", { applicationId: app.applicationId });

  const finalProject = await findProject();
  const finalEnv = finalProject.environments?.find((item) => item.name === environmentName) || finalProject.environments?.[0];
  const finalApp = finalEnv?.applications?.find((item) => item.name === appName);

  console.log(JSON.stringify({
    project: finalProject.name,
    environment: finalEnv?.name,
    application: finalApp?.name,
    applicationId: finalApp?.applicationId,
    deployTriggered: true,
    domain: runtimeEnv.CONTROL_PLANE_PUBLIC_URL || null,
    next: [
      "Wait for Dokploy build/deploy to finish.",
      "Call GET /healthz on the public URL.",
      "Call POST /sync with Authorization bearer token.",
      "Call GET /readyz and authenticated GET /agents.",
    ],
  }, null, 2));
}

function ensureRuntimeEnv() {
  let runtime = fs.existsSync(localEnvPath) ? loadEnv(localEnvPath) : {};
  const updates = {};
  if (!runtime.CONTROL_PLANE_NAME) updates.CONTROL_PLANE_NAME = appName;
  if (!runtime.CONTROL_PLANE_PUBLIC_URL || runtime.CONTROL_PLANE_PUBLIC_URL.includes("<")) {
    updates.CONTROL_PLANE_PUBLIC_URL = env.AGENCY_CONTROL_PLANE_PUBLIC_URL || "";
  }
  if (!runtime.CONTROL_PLANE_TOKEN || runtime.CONTROL_PLANE_TOKEN.includes("<")) {
    updates.CONTROL_PLANE_TOKEN = crypto.randomBytes(32).toString("hex");
  }
  const defaults = {
    NODE_ENV: "production",
    PORT: "3000",
    TZ: "Asia/Saigon",
    AGENCY_REPO: "https://github.com/msitarzewski/agency-agents.git",
    AGENCY_BRANCH: "main",
    AGENCY_RUNTIME: "openclaw",
    AGENCY_SYNC_INTERVAL_SECONDS: "3600",
    AGENCY_CATALOG_DIR: "/data/agency",
    AGENCY_DATA_DIR: "/data/control-plane",
    AGENCY_JOBS_DIR: "/data/jobs",
    DATABASE_URL: "sqlite:/data/control-plane/control-plane.db",
    AGENCY_MAX_PARALLEL_JOBS: "1",
    AGENCY_MAX_PROMPT_CHARS: "20000",
    AGENCY_MAX_TOKENS_PER_JOB: "250000",
    AGENCY_DAILY_JOB_LIMIT: "20",
    AGENCY_DAILY_TOKEN_LIMIT: "2000000",
    OPENAI_MODEL: "gpt-4.1-mini",
    ANTHROPIC_MODEL: "claude-sonnet-4-5",
    DOKPLOY_INFRA_TOOLS_ENABLED: "false",
  };
  for (const [key, value] of Object.entries(defaults)) {
    if (!runtime[key]) updates[key] = value;
  }
  for (const key of ["OPENAI_API_KEY", "ANTHROPIC_API_KEY", "OPENROUTER_API_KEY", "GOOGLE_GENERATIVE_AI_API_KEY"]) {
    if (!runtime[key] && env[key] && !env[key].includes("<")) updates[key] = env[key];
  }
  if (Object.keys(updates).length) {
    writeEnv(localEnvPath, { ...runtime, ...updates });
    runtime = loadEnv(localEnvPath);
  }
  return runtime;
}

async function ensureProject() {
  const existing = await findProject();
  if (existing) return existing;
  const created = await post("/api/project.create", {
    name: projectName,
    description: "Agency Agents control-plane runtime",
  });
  return created.project || created;
}

async function findProject() {
  const projects = await get("/api/project.all");
  return projects.find((item) => item.name === projectName);
}

async function ensureApplication(environmentId) {
  const project = await findProject();
  const environment = project.environments?.find((item) => item.name === environmentName) || project.environments?.[0];
  const existing = environment?.applications?.find((item) => item.name === appName);
  if (existing) return existing;
  return post("/api/application.create", { name: appName, environmentId });
}

async function configureSource(applicationId) {
  await post("/api/application.saveGitProvider", {
    applicationId,
    customGitUrl: gitUrl,
    customGitBranch: branch,
    customGitBuildPath: "/",
    watchPaths: [],
  });
}

async function configureBuild(applicationId) {
  await post("/api/application.saveBuildType", {
    applicationId,
    buildType: "dockerfile",
    dockerfile,
    dockerContextPath: "/",
    dockerBuildStage: "",
    herokuVersion: "",
    railpackVersion: "",
  });
}

async function configureEnvironment(applicationId, runtimeEnv) {
  await post("/api/application.saveEnvironment", {
    applicationId,
    env: serializeRuntimeEnv(runtimeEnv),
    buildArgs: "",
    buildSecrets: "",
    createEnvFile: false,
  });
}

async function ensureMounts(applicationId) {
  for (const mountPath of ["/data/agency", "/data/control-plane", "/data/jobs"]) {
    try {
      await post("/api/mounts.create", {
        serviceId: applicationId,
        type: "volume",
        mountPath,
      });
    } catch (error) {
      const message = String(error.message || error).toLowerCase();
      if (!message.includes("already") && !message.includes("unique")) throw error;
    }
  }
}

async function maybeConfigureDomain(applicationId, runtimeEnv) {
  const publicUrl = runtimeEnv.CONTROL_PLANE_PUBLIC_URL;
  if (!publicUrl || publicUrl.includes("<")) return;
  const host = publicUrl.replace(/^https?:\/\//, "").replace(/\/.*$/, "");
  if (!host) return;
  try {
    await post("/api/domain.create", {
      applicationId,
      host,
      port,
      https: true,
      path: "/",
    });
  } catch (error) {
    const message = String(error.message || error).toLowerCase();
    if (!message.includes("already") && !message.includes("unique")) throw error;
  }
}

function serializeRuntimeEnv(runtimeEnv) {
  const allowed = [
    "CONTROL_PLANE_NAME",
    "CONTROL_PLANE_PUBLIC_URL",
    "CONTROL_PLANE_TOKEN",
    "NODE_ENV",
    "PORT",
    "TZ",
    "AGENCY_REPO",
    "AGENCY_BRANCH",
    "AGENCY_RUNTIME",
    "AGENCY_SYNC_INTERVAL_SECONDS",
    "AGENCY_CATALOG_DIR",
    "AGENCY_DATA_DIR",
    "AGENCY_JOBS_DIR",
    "DATABASE_URL",
    "AGENCY_MAX_PARALLEL_JOBS",
    "AGENCY_MAX_PROMPT_CHARS",
    "AGENCY_MAX_TOKENS_PER_JOB",
    "AGENCY_DAILY_JOB_LIMIT",
    "AGENCY_DAILY_TOKEN_LIMIT",
    "OPENAI_API_KEY",
    "OPENAI_MODEL",
    "ANTHROPIC_API_KEY",
    "ANTHROPIC_MODEL",
    "OPENROUTER_API_KEY",
    "GOOGLE_GENERATIVE_AI_API_KEY",
    "DOKPLOY_INFRA_TOOLS_ENABLED",
  ];
  return allowed
    .filter((key) => runtimeEnv[key] !== undefined && runtimeEnv[key] !== "" && !String(runtimeEnv[key]).includes("<"))
    .map((key) => `${key}=${runtimeEnv[key]}`)
    .join("\n");
}

async function get(path) {
  return request("GET", path);
}

async function post(path, body) {
  return request("POST", path, body);
}

async function request(method, path, body) {
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
    },
    body: method === "POST" ? JSON.stringify(body) : undefined,
  });
  const text = await response.text();
  const data = text && text !== "null" ? JSON.parse(text) : null;
  if (!response.ok) {
    throw new Error(`${method} ${path} failed ${response.status}: ${text}`);
  }
  return data;
}

function loadEnv(path) {
  const text = fs.readFileSync(path, "utf8");
  return Object.fromEntries(
    text
      .split(/\r?\n/)
      .filter((line) => line.trim() && !line.trim().startsWith("#") && line.includes("="))
      .map((line) => {
        const index = line.indexOf("=");
        return [line.slice(0, index), line.slice(index + 1)];
      }),
  );
}

function writeEnv(path, values) {
  const text = `${Object.entries(values)
    .map(([key, value]) => `${key}=${value}`)
    .join("\n")}\n`;
  fs.writeFileSync(path, text);
}

function required(key) {
  const value = env[key];
  if (!value || value.includes("<")) throw new Error(`${key} is missing`);
  return value;
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
