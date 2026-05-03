export const PROJECT_NAME = "agency-agents";
export const ENVIRONMENT_NAME = "production";

export const SERVICES = {
  catalog: {
    name: "agency-catalog",
    dockerfile: "deploy/agency-catalog/Dockerfile",
    mounts: [{ type: "volume", mountPath: "/data/agency", name: "agency_catalog" }],
    port: null,
  },
  api: {
    name: "agency-api",
    dockerfile: "apps/control-plane/Dockerfile",
    mounts: [
      { type: "volume", mountPath: "/data/agency", name: "agency_catalog" },
      { type: "volume", mountPath: "/data/jobs", name: "agency_jobs" },
    ],
    port: 3000,
  },
};

export function appEnv(env, serviceName) {
  const shared = {
    AGENCY_REPO: env.AGENCY_REPO,
    AGENCY_BRANCH: env.AGENCY_BRANCH,
    AGENCY_RUNTIME: env.AGENCY_RUNTIME,
    AGENCY_SYNC_INTERVAL_SECONDS: env.AGENCY_SYNC_INTERVAL_SECONDS,
    AGENCY_MAX_PARALLEL_JOBS: env.AGENCY_MAX_PARALLEL_JOBS,
    AGENCY_MAX_TOKENS_PER_JOB: env.AGENCY_MAX_TOKENS_PER_JOB,
    AGENCY_DAILY_JOB_LIMIT: env.AGENCY_DAILY_JOB_LIMIT,
    AGENCY_DAILY_TOKEN_LIMIT: env.AGENCY_DAILY_TOKEN_LIMIT,
    CONTROL_PLANE_TOKEN: env.CONTROL_PLANE_TOKEN,
    REDIS_URL: env.REDIS_URL,
    DATABASE_URL: env.DATABASE_URL,
    OPENAI_API_KEY: cleanOptional(env.OPENAI_API_KEY),
    ANTHROPIC_API_KEY: cleanOptional(env.ANTHROPIC_API_KEY),
    GOOGLE_GENERATIVE_AI_API_KEY: cleanOptional(env.GOOGLE_GENERATIVE_AI_API_KEY),
    OPENROUTER_API_KEY: cleanOptional(env.OPENROUTER_API_KEY),
    LOG_LEVEL: env.LOG_LEVEL || "info",
    NODE_ENV: "production",
    TZ: env.TZ || "Asia/Saigon",
  };
  if (serviceName === SERVICES.api.name) {
    shared.PORT = "3000";
    shared.AGENCY_CATALOG_OPENCLAW_DIR = "/data/agency/current/integrations/openclaw";
    shared.AGENCY_JOBS_DIR = "/data/jobs";
  }
  return Object.entries(shared)
    .filter(([, value]) => value !== undefined && value !== null && value !== "")
    .map(([key, value]) => `${key}=${value}`)
    .join("\n");
}

export function cleanOptional(value) {
  if (!value || value.includes("<")) return "";
  return value;
}

export function parseRepository(repo) {
  const clean = repo.replace(/^https:\/\/github.com\//, "").replace(/\.git$/, "");
  const [owner, repository] = clean.split("/");
  if (!owner || !repository) {
    throw new Error(`Invalid AGENCY_DEPLOY_REPOSITORY: ${repo}`);
  }
  return { owner, repository };
}
