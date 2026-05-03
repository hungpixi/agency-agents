import fs from "node:fs";
import { DokployClient } from "./lib/client.mjs";
import { loadEnv, needsValue, randomPassword, randomToken, requireEnv, saveEnv } from "./lib/env.mjs";
import { ENVIRONMENT_NAME, PROJECT_NAME, SERVICES, appEnv, parseRepository } from "./lib/resources.mjs";

const envPath = "deploy/dokploy.env";
const mode = process.argv.find((arg) => arg.startsWith("--")) || "--help";

async function main() {
  if (!fs.existsSync(envPath)) {
    throw new Error(`Missing ${envPath}. Copy deploy/dokploy.env.example first.`);
  }
  if (mode === "--help") {
    console.log("Usage: node scripts/dokploy/bootstrap.mjs --prepare-env|--dry-run|--apply|--verify");
    return;
  }

  let env = loadEnv(envPath);
  if (mode === "--prepare-env") {
    prepareEnv(env);
    return;
  }

  requireEnv(env, ["DOKPLOY_BASE_URL", "DOKPLOY_API_KEY"]);
  const client = new DokployClient({ baseUrl: env.DOKPLOY_BASE_URL, apiKey: env.DOKPLOY_API_KEY });

  if (mode === "--dry-run") {
    await dryRun(client, env);
    return;
  }
  if (mode === "--apply") {
    await apply(client, env);
    return;
  }
  if (mode === "--verify") {
    await verify(client, env);
    return;
  }
  throw new Error(`Unknown mode: ${mode}`);
}

function prepareEnv(env) {
  const updates = {
    DOKPLOY_PROJECT_NAME: PROJECT_NAME,
    DOKPLOY_ENVIRONMENT_NAME: ENVIRONMENT_NAME,
    AGENCY_DEPLOY_REPOSITORY: "hungpixi/agency-agents",
    AGENCY_DEPLOY_BRANCH: env.AGENCY_DEPLOY_BRANCH || "main",
  };
  if (needsValue(env.OPENCLAW_GATEWAY_TOKEN)) updates.OPENCLAW_GATEWAY_TOKEN = randomToken(24);
  if (needsValue(env.CONTROL_PLANE_TOKEN)) updates.CONTROL_PLANE_TOKEN = randomToken(24);
  if (needsValue(env.REDIS_PASSWORD)) updates.REDIS_PASSWORD = randomPassword();
  if (needsValue(env.POSTGRES_PASSWORD)) updates.POSTGRES_PASSWORD = randomPassword();
  saveEnv(envPath, updates);
  console.log("Prepared deploy/dokploy.env defaults without printing secrets.");
}

async function dryRun(client, env) {
  const context = await getContext(client);
  console.log(`Dokploy reachable. Projects visible: ${context.projects.length}`);
  console.log(`Target project: ${PROJECT_NAME}`);
  console.log(`Target environment: ${ENVIRONMENT_NAME}`);
  console.log(`Will ensure Redis: agency-redis`);
  console.log(`Will ensure Postgres: agency-postgres`);
  console.log(`Will ensure apps: ${Object.values(SERVICES).map((service) => service.name).join(", ")}`);
  console.log(`Will use repository: ${env.AGENCY_DEPLOY_REPOSITORY || "hungpixi/agency-agents"}`);
  if (!env.AGENCY_API_DOMAIN || env.AGENCY_API_DOMAIN.includes("<")) {
    console.log("No API domain set; domain creation will be skipped.");
  } else {
    console.log(`Will attach API domain: ${env.AGENCY_API_DOMAIN}`);
  }
}

async function apply(client, env) {
  const project = await ensureProject(client);
  const environment = ensureEnvironment(project);
  const redis = await ensureRedis(client, environment.environmentId, env);
  const postgres = await ensurePostgres(client, environment.environmentId, env);

  const redisUrl = `redis://:${env.REDIS_PASSWORD}@agency-redis:6379/0`;
  const databaseUrl = `postgresql://agency:${env.POSTGRES_PASSWORD}@agency-postgres:5432/agency`;
  saveEnv(envPath, { REDIS_URL: redisUrl, DATABASE_URL: databaseUrl });
  env = loadEnv(envPath);

  const apps = {};
  for (const service of Object.values(SERVICES)) {
    apps[service.name] = await ensureApplication(client, environment.environmentId, service.name);
    await configureApplication(client, apps[service.name].applicationId, service, env);
    for (const mount of service.mounts) {
      await ensureMount(client, apps[service.name].applicationId, mount);
    }
  }

  if (env.AGENCY_API_DOMAIN && !env.AGENCY_API_DOMAIN.includes("<")) {
    await ensureDomain(client, apps[SERVICES.api.name].applicationId, env.AGENCY_API_DOMAIN, SERVICES.api.port);
  }

  for (const service of Object.values(SERVICES)) {
    await client.post("/api/application.deploy", { applicationId: apps[service.name].applicationId });
    console.log(`Deploy triggered: ${service.name}`);
  }

  console.log(`Ensured Redis ${redis.redisId || redis.id || "agency-redis"} and Postgres ${postgres.postgresId || postgres.id || "agency-postgres"}.`);
}

async function verify(client, env) {
  const context = await getContext(client);
  const project = findProject(context.projects);
  if (!project) throw new Error(`Project ${PROJECT_NAME} not found`);
  const environment = ensureEnvironment(project);
  const apps = environment.applications || [];
  for (const service of Object.values(SERVICES)) {
    if (!apps.find((app) => app.name === service.name)) {
      throw new Error(`Application missing: ${service.name}`);
    }
  }
  console.log("Dokploy resources exist.");
  if (env.AGENCY_API_DOMAIN && !env.AGENCY_API_DOMAIN.includes("<")) {
    const response = await fetch(`https://${env.AGENCY_API_DOMAIN}/healthz`);
    console.log(`API health status: ${response.status}`);
  } else {
    console.log("API domain not set; external healthcheck skipped.");
  }
}

async function getContext(client) {
  const projects = await client.get("/api/project.all");
  return { projects };
}

async function ensureProject(client) {
  const context = await getContext(client);
  const existing = findProject(context.projects);
  if (existing) return existing;
  const created = await client.post("/api/project.create", { name: PROJECT_NAME, description: "Agency Agents OPC 24x7 runtime" });
  return created.project || created;
}

function findProject(projects) {
  return projects.find((project) => project.name === PROJECT_NAME);
}

function ensureEnvironment(project) {
  const environment = project.environments?.find((item) => item.name === ENVIRONMENT_NAME) || project.environments?.[0];
  if (!environment) throw new Error(`No environment found in project ${project.name}`);
  return environment;
}

async function ensureApplication(client, environmentId, name) {
  const project = findProject((await getContext(client)).projects);
  const environment = ensureEnvironment(project);
  const existing = environment.applications?.find((app) => app.name === name);
  if (existing) return existing;
  return client.post("/api/application.create", { name, environmentId });
}

async function ensureRedis(client, environmentId, env) {
  const project = findProject((await getContext(client)).projects);
  const environment = ensureEnvironment(project);
  const existing = environment.redis?.find((item) => item.name === "agency-redis") || environment.redis?.[0];
  if (existing) return existing;
  return client.post("/api/redis.create", {
    name: "agency-redis",
    databasePassword: env.REDIS_PASSWORD,
    environmentId,
  });
}

async function ensurePostgres(client, environmentId, env) {
  const project = findProject((await getContext(client)).projects);
  const environment = ensureEnvironment(project);
  const existing = environment.postgres?.find((item) => item.name === "agency-postgres") || environment.postgres?.[0];
  if (existing) return existing;
  return client.post("/api/postgres.create", {
    name: "agency-postgres",
    databaseName: "agency",
    databaseUser: "agency",
    databasePassword: env.POSTGRES_PASSWORD,
    environmentId,
  });
}

async function configureApplication(client, applicationId, service, env) {
  const { owner, repository } = parseRepository(env.AGENCY_DEPLOY_REPOSITORY || "hungpixi/agency-agents");
  const githubId = await getGithubProviderId(client);
  await client.post("/api/application.saveGithubProvider", {
    applicationId,
    owner,
    repository,
    branch: env.AGENCY_DEPLOY_BRANCH || "main",
    buildPath: "/",
    githubId,
  });
  await client.post("/api/application.saveBuildType", {
    applicationId,
    buildType: "dockerfile",
    dockerfile: service.dockerfile,
    dockerContextPath: "/",
    dockerBuildStage: "",
    herokuVersion: "",
    railpackVersion: "",
  });
  await client.post("/api/application.saveEnvironment", {
    applicationId,
    env: appEnv(env, service.name),
    buildArgs: "",
    buildSecrets: "",
    createEnvFile: false,
  });
}

async function getGithubProviderId(client) {
  const providers = await client.get("/api/gitProvider.getAll");
  const provider = providers.find((item) => item.providerType === "github" || item.github);
  if (!provider) {
    throw new Error("No GitHub provider is configured in Dokploy.");
  }
  return provider.gitProviderId;
}

async function ensureMount(client, serviceId, mount) {
  try {
    await client.post("/api/mounts.create", {
      serviceId,
      type: mount.type,
      mountPath: mount.mountPath,
      name: mount.name,
    });
  } catch (error) {
    if (!String(error.message).toLowerCase().includes("already")) throw error;
  }
}

async function ensureDomain(client, applicationId, host, port) {
  try {
    await client.post("/api/domain.create", {
      applicationId,
      host,
      port,
      https: true,
      path: "/",
    });
  } catch (error) {
    if (!String(error.message).toLowerCase().includes("already")) throw error;
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
