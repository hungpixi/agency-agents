import fs from "node:fs";

const envPath = "deploy/dokploy.env";
const env = loadEnv(envPath);
const baseUrl = required("DOKPLOY_BASE_URL").replace(/\/$/, "");
const apiKey = required("DOKPLOY_API_KEY");
const probeName = `api-probe-control-plane-${Date.now()}`;

const report = [];

async function main() {
  let projectId = null;
  try {
    const projectCreate = await post("/api/project.create", {
      name: probeName,
      description: "Temporary API probe. Safe to remove.",
    });
    projectId = projectCreate.project?.projectId || projectCreate.projectId;
    const environmentId =
      projectCreate.environment?.environmentId ||
      projectCreate.project?.environments?.[0]?.environmentId;
    ok("project.create", { projectId, environmentId });

    const app = await post("/api/application.create", {
      name: "agency-control-plane",
      environmentId,
    });
    const applicationId = app.applicationId;
    ok("application.create", { applicationId });

    await post("/api/application.saveGitProvider", {
      applicationId,
      customGitUrl: "https://github.com/hungpixi/agency-agents.git",
      customGitBranch: "main",
      customGitBuildPath: "/",
      watchPaths: [],
    });
    ok("application.saveGitProvider", { mode: "custom-git" });

    await post("/api/application.saveBuildType", {
      applicationId,
      buildType: "dockerfile",
      dockerfile: "apps/control-plane/Dockerfile",
      dockerContextPath: "/",
      dockerBuildStage: "",
      herokuVersion: "",
      railpackVersion: "",
    });
    ok("application.saveBuildType", { dockerfile: "apps/control-plane/Dockerfile" });

    await post("/api/application.saveEnvironment", {
      applicationId,
      env: [
        "CONTROL_PLANE_NAME=agency-control-plane",
        "CONTROL_PLANE_TOKEN=probe-token",
        "PORT=3000",
        "NODE_ENV=production",
        "AGENCY_CATALOG_DIR=/data/agency",
        "AGENCY_JOBS_DIR=/data/jobs",
      ].join("\n"),
      buildArgs: "",
      buildSecrets: "",
      createEnvFile: false,
    });
    ok("application.saveEnvironment", { envLines: 6 });

    for (const mountPath of ["/data/agency", "/data/control-plane", "/data/jobs"]) {
      await post("/api/mounts.create", {
        serviceId: applicationId,
        type: "volume",
        mountPath,
      });
      ok("mounts.create", { mountPath });
    }

    const deploy = await post("/api/application.deploy", { applicationId });
    ok("application.deploy", {
      accepted: true,
      deploymentId: deploy?.deploymentId || deploy?.id || null,
    });
  } finally {
    if (projectId) {
      try {
        await post("/api/project.remove", { projectId });
        ok("project.remove", { projectId });
      } catch (error) {
        fail("project.remove", error);
      }
    }
    console.log(JSON.stringify({ probeName, report }, null, 2));
  }
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
  if (!value || value.includes("<")) {
    throw new Error(`${key} is missing`);
  }
  return value;
}

async function post(path, body) {
  const response = await fetch(`${baseUrl}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
    },
    body: JSON.stringify(body),
  });
  const text = await response.text();
  const data = text && text !== "null" ? JSON.parse(text) : null;
  if (!response.ok) {
    throw new Error(`${path} failed ${response.status}: ${text}`);
  }
  return data;
}

function ok(step, data) {
  report.push({ step, ok: true, data });
}

function fail(step, error) {
  report.push({ step, ok: false, error: String(error.message || error) });
}

main().catch((error) => {
  fail("probe", error);
  console.log(JSON.stringify({ probeName, report }, null, 2));
  process.exit(1);
});
