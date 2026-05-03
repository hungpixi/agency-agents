import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";

export function agencyDataDir() {
  return process.env.AGENCY_CATALOG_DIR || "/data/agency";
}

export function catalogRoot() {
  return path.join(agencyDataDir(), "current");
}

export function openclawCatalogDir() {
  return process.env.AGENCY_CATALOG_OPENCLAW_DIR || path.join(catalogRoot(), "integrations", "openclaw");
}

export function jobsDir() {
  return process.env.AGENCY_JOBS_DIR || "/data/jobs";
}

export async function readiness() {
  const catalog = openclawCatalogDir();
  const jobs = jobsDir();
  const checks = {
    catalogExists: await exists(catalog),
    jobsWritable: await writable(jobs),
  };

  return {
    ok: checks.catalogExists && checks.jobsWritable,
    checks,
  };
}

export async function syncCatalog() {
  const repoUrl = process.env.AGENCY_REPO || "https://github.com/msitarzewski/agency-agents.git";
  const branch = process.env.AGENCY_BRANCH || "main";
  const runtime = process.env.AGENCY_RUNTIME || "openclaw";
  const root = agencyDataDir();
  const repoDir = path.join(root, "repo");
  const outDir = catalogRoot();

  await fs.mkdir(root, { recursive: true });
  await fs.mkdir(outDir, { recursive: true });

  if (!(await exists(path.join(repoDir, ".git")))) {
    await run("git", ["clone", "--branch", branch, "--depth", "1", repoUrl, repoDir]);
  }
  await run("git", ["-C", repoDir, "fetch", "origin", branch]);
  await run("git", ["-C", repoDir, "checkout", branch]);
  await run("git", ["-C", repoDir, "reset", "--hard", `origin/${branch}`]);

  const convert = await run("bash", [
    toBashPath(path.join(repoDir, "scripts", "convert.sh")),
    "--tool",
    runtime,
    "--out",
    toBashPath(path.join(outDir, "integrations")),
  ]);

  const commit = (await run("git", ["-C", repoDir, "rev-parse", "HEAD"])).stdout.trim();
  const manifest = {
    repo: repoUrl,
    branch,
    runtime,
    synced_at: new Date().toISOString(),
    commit,
  };
  await fs.writeFile(path.join(outDir, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  return { manifest, output: convert };
}

async function exists(target) {
  try {
    await fs.access(target);
    return true;
  } catch {
    return false;
  }
}

async function writable(target) {
  try {
    await fs.mkdir(target, { recursive: true });
    const probe = path.join(target, `.write-test-${Date.now()}`);
    await fs.writeFile(probe, "ok", "utf8");
    await fs.unlink(probe);
    return true;
  } catch {
    return false;
  }
}

function run(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) {
        resolve({ stdout, stderr });
      } else {
        const error = new Error(`${command} exited ${code}: ${stderr || stdout}`);
        error.stdout = stdout;
        error.stderr = stderr;
        reject(error);
      }
    });
  });
}

function toBashPath(value) {
  if (process.platform !== "win32") return value;
  return String(value).replaceAll("\\", "/").replace(/^([A-Za-z]):/, (_, drive) => `/mnt/${drive.toLowerCase()}`);
}
