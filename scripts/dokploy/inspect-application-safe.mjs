import fs from "node:fs";

const env = loadEnv("deploy/dokploy.env");
const baseUrl = required("DOKPLOY_BASE_URL").replace(/\/$/, "");
const applicationId = process.argv[2] || "1cMgVO-rZ8ePfP9uDlcyC";

const app = await getJson(`/api/application.one?applicationId=${encodeURIComponent(applicationId)}`);
const deployments = await getJson(`/api/deployment.allByType?id=${encodeURIComponent(applicationId)}&type=application`);
const mounts = await getJson(`/api/mounts.all?serviceId=${encodeURIComponent(applicationId)}&serviceType=application`).catch(() => []);

console.log(JSON.stringify({
  application: {
    applicationId: app.applicationId,
    name: app.name,
    appName: app.appName,
    sourceType: app.sourceType,
    buildType: app.buildType,
    repository: app.repository,
    branch: app.branch,
    customGitUrl: app.customGitUrl,
    customGitBranch: app.customGitBranch,
    customGitBuildPath: app.customGitBuildPath,
    dockerfile: app.dockerfile,
    dockerContextPath: app.dockerContextPath,
    applicationStatus: app.applicationStatus,
    envKeys: parseEnvKeys(app.env),
    mounts,
    domains: app.domains,
  },
  latestDeployment: deployments?.[0]
    ? {
        deploymentId: deployments[0].deploymentId,
        title: deployments[0].title,
        status: deployments[0].status,
        logPath: deployments[0].logPath,
        createdAt: deployments[0].createdAt,
        finishedAt: deployments[0].finishedAt,
        errorMessage: deployments[0].errorMessage,
      }
    : null,
}, null, 2));

async function getJson(path) {
  const response = await fetch(`${baseUrl}${path}`, {
    headers: { "x-api-key": required("DOKPLOY_API_KEY") },
  });
  if (!response.ok) {
    throw new Error(`GET ${path} failed ${response.status}: ${await response.text()}`);
  }
  return response.json();
}

function parseEnvKeys(text) {
  return String(text || "")
    .split(/\r?\n/)
    .filter((line) => line.trim() && line.includes("="))
    .map((line) => line.slice(0, line.indexOf("=")));
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

function required(key) {
  const value = env[key];
  if (!value || value.includes("<")) throw new Error(`${key} is missing`);
  return value;
}
