import crypto from "node:crypto";
import fs from "node:fs";

const env = loadEnv("deploy/dokploy.env");
const baseUrl = required("DOKPLOY_BASE_URL").replace(/\/$/, "");
const apiKey = required("DOKPLOY_API_KEY");

const projectName = "9router";
const environmentName = "production";
const appName = "9router";
const gitUrl = "https://github.com/hungpixi/agency-agents.git";
const branch = "main";
const dockerfile = "apps/9router/Dockerfile";
const port = 20128;
const runtimeEnvPath = "deploy/9router.env";
const backupPath = "9router-backup-2026-05-03T03-14-02-786Z.json";
const skipBackup = env.NINE_ROUTER_SKIP_BACKUP === "true";

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
    port,
    domain: runtimeEnv.NINE_ROUTER_PUBLIC_URL || null,
    notes: [
      "9Router dashboard listens on port 20128.",
      "The app installs the official npm 9router package and runs its bundled dashboard server.",
      "If no domain is configured, attach one later and set NINE_ROUTER_PUBLIC_URL.",
      "The generated INITIAL_PASSWORD is stored only in deploy/9router.env, which is gitignored.",
      "The local backup is injected through NINE_ROUTER_DB_JSON_BASE64 and restored to /app/data/db.json on first boot.",
    ],
  }, null, 2));
}

function ensureRuntimeEnv() {
  let runtime = fs.existsSync(runtimeEnvPath) ? loadEnv(runtimeEnvPath) : {};
  if (skipBackup) {
    runtime = Object.fromEntries(
      Object.entries(runtime).filter(([key]) => !key.startsWith("NINE_ROUTER_DB_JSON_")),
    );
    runtime.NINE_ROUTER_RESTORE_BACKUP = "false";
    runtime.NINE_ROUTER_FORCE_RESTORE = "false";
  }
  const defaults = {
    PORT: "20128",
    HOSTNAME: "0.0.0.0",
    NODE_ENV: "production",
    DATA_DIR: "/app/data",
    BASE_URL: runtime.NINE_ROUTER_PUBLIC_URL || "",
    NEXT_PUBLIC_BASE_URL: runtime.NINE_ROUTER_PUBLIC_URL || "",
    CLOUD_URL: "https://9router.com",
    NEXT_PUBLIC_CLOUD_URL: "https://9router.com",
    OBSERVABILITY_ENABLED: "true",
    AUTH_COOKIE_SECURE: runtime.NINE_ROUTER_PUBLIC_URL?.startsWith("https://") ? "true" : "false",
    REQUIRE_API_KEY: "false",
    ENABLE_REQUEST_LOGS: "false",
  };
  const updates = {};
  for (const [key, value] of Object.entries(defaults)) {
    if (!runtime[key]) updates[key] = value;
  }
  for (const key of ["JWT_SECRET", "API_KEY_SECRET", "MACHINE_ID_SALT"]) {
    if (!runtime[key] || runtime[key].includes("<")) updates[key] = crypto.randomBytes(32).toString("hex");
  }
  if (!runtime.INITIAL_PASSWORD || runtime.INITIAL_PASSWORD.includes("<")) {
    updates.INITIAL_PASSWORD = crypto.randomBytes(18).toString("base64url");
  }
  if (!skipBackup && fs.existsSync(backupPath)) {
    const backupText = JSON.stringify(sanitizeBackup(JSON.parse(fs.readFileSync(backupPath, "utf8"))), null, 2);
    const backupSha256 = crypto.createHash("sha256").update(backupText).digest("hex");
    const backupBase64 = Buffer.from(backupText, "utf8").toString("base64");
    if (runtime.NINE_ROUTER_DB_JSON_BASE64 !== backupBase64) {
      updates.NINE_ROUTER_DB_JSON_BASE64 = backupBase64;
      updates.NINE_ROUTER_DB_JSON_SHA256 = backupSha256;
      if (!runtime.NINE_ROUTER_RESTORE_BACKUP) updates.NINE_ROUTER_RESTORE_BACKUP = "true";
      if (!runtime.NINE_ROUTER_FORCE_RESTORE) updates.NINE_ROUTER_FORCE_RESTORE = "false";
    }
  }
  if (!runtime.NINE_ROUTER_PUBLIC_URL && env.NINE_ROUTER_PUBLIC_URL && !env.NINE_ROUTER_PUBLIC_URL.includes("<")) {
    updates.NINE_ROUTER_PUBLIC_URL = env.NINE_ROUTER_PUBLIC_URL;
    updates.BASE_URL = env.NINE_ROUTER_PUBLIC_URL;
    updates.NEXT_PUBLIC_BASE_URL = env.NINE_ROUTER_PUBLIC_URL;
  }
  if (Object.keys(updates).length) {
    runtime = { ...runtime, ...updates };
    writeEnv(runtimeEnvPath, runtime);
  }
  return runtime;
}

async function ensureProject() {
  const existing = await findProject();
  if (existing) return existing;
  const created = await post("/api/project.create", {
    name: projectName,
    description: "9Router AI provider router",
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
  try {
    await post("/api/mounts.create", {
      serviceId: applicationId,
      serviceType: "application",
      type: "volume",
      volumeName: "agency-9router-data",
      mountPath: "/app/data",
    });
  } catch (error) {
    const message = String(error.message || error).toLowerCase();
    if (!message.includes("already") && !message.includes("unique")) {
      throw error;
    }
  }
}

async function maybeConfigureDomain(applicationId, runtimeEnv) {
  const publicUrl = runtimeEnv.NINE_ROUTER_PUBLIC_URL;
  if (!publicUrl || publicUrl.includes("<")) return;
  const host = publicUrl.replace(/^https?:\/\//, "").replace(/\/.*$/, "");
  if (!host) return;
  const existingApp = await get(`/api/application.one?applicationId=${encodeURIComponent(applicationId)}`);
  const existingDomain = existingApp.domains?.find((domain) => domain.host === host && domain.port === port);
  if (existingDomain) return;
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
    "JWT_SECRET",
    "INITIAL_PASSWORD",
    "DATA_DIR",
    "PORT",
    "HOSTNAME",
    "NODE_ENV",
    "BASE_URL",
    "CLOUD_URL",
    "NEXT_PUBLIC_BASE_URL",
    "NEXT_PUBLIC_CLOUD_URL",
    "API_KEY_SECRET",
    "MACHINE_ID_SALT",
    "ENABLE_REQUEST_LOGS",
    "OBSERVABILITY_ENABLED",
    "AUTH_COOKIE_SECURE",
    "REQUIRE_API_KEY",
    "NINE_ROUTER_DB_JSON_BASE64",
    "NINE_ROUTER_DB_JSON_SHA256",
    "NINE_ROUTER_RESTORE_BACKUP",
    "NINE_ROUTER_FORCE_RESTORE",
  ];
  return allowed
    .filter((key) => runtimeEnv[key] !== undefined && runtimeEnv[key] !== "" && !String(runtimeEnv[key]).includes("<"))
    .map((key) => `${key}=${runtimeEnv[key]}`)
    .join("\n");
}

function sanitizeBackup(backup) {
  const sanitized = structuredClone(backup);
  sanitized.settings = {
    ...(sanitized.settings || {}),
    cloudEnabled: false,
    tunnelEnabled: false,
    tailscaleEnabled: false,
    outboundProxyEnabled: false,
    mitmEnabled: false,
    mitmCertInstalled: false,
  };
  return sanitized;
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
  if (!response.ok) throw new Error(`${method} ${path} failed ${response.status}: ${text}`);
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
  fs.writeFileSync(path, `${Object.entries(values).map(([key, value]) => `${key}=${value}`).join("\n")}\n`);
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
