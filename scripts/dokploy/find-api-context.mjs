import fs from "node:fs";

const env = loadEnv("deploy/dokploy.env");
const baseUrl = required("DOKPLOY_BASE_URL").replace(/\/$/, "");
const pattern = process.argv[2];

if (!pattern) {
  throw new Error("Usage: node scripts/dokploy/find-api-context.mjs <pattern>");
}

const html = await fetchText("/");
const buildId = html.match(/\/_next\/static\/([^/]+)\/_buildManifest\.js/)?.[1];
const scripts = new Set([...html.matchAll(/src="([^"]+\.js)"/g)].map((match) => match[1]));
if (buildId) {
  const manifestText = await fetchText(`/_next/static/${buildId}/_buildManifest.js`);
  for (const match of manifestText.matchAll(/"([^"]+\.js)"/g)) {
    scripts.add(match[1].startsWith("/") ? match[1] : `/_next/${match[1].replace(/^static\//, "static/")}`);
  }
}

for (const script of scripts) {
  const text = await fetchText(script);
  let index = text.indexOf(pattern);
  if (index === -1) continue;
  while (index !== -1) {
    const start = Math.max(0, index - 500);
    const end = Math.min(text.length, index + pattern.length + 500);
    console.log(`\n--- ${script} @ ${index} ---\n${text.slice(start, end)}`);
    index = text.indexOf(pattern, index + pattern.length);
  }
}

async function fetchText(path) {
  const response = await fetch(`${baseUrl}${path}`, {
    headers: { "x-api-key": required("DOKPLOY_API_KEY") },
  });
  return response.text();
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
