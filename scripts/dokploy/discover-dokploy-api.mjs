import fs from "node:fs";

const env = loadEnv("deploy/dokploy.env");
const baseUrl = required("DOKPLOY_BASE_URL").replace(/\/$/, "");

const html = await fetchText("/");
const buildId = html.match(/\/_next\/static\/([^/]+)\/_buildManifest\.js/)?.[1];
const scripts = new Set([...html.matchAll(/src="([^"]+\.js)"/g)].map((match) => match[1]));
if (buildId) {
  const manifestText = await fetchText(`/_next/static/${buildId}/_buildManifest.js`);
  for (const match of manifestText.matchAll(/"([^"]+\.js)"/g)) {
    scripts.add(match[1].startsWith("/") ? match[1] : `/_next/${match[1].replace(/^static\//, "static/")}`);
  }
}
const hits = [];

for (const script of scripts) {
  const text = await fetchText(script);
  const applicationMethods = uniqueMatches(text, /application\.[A-Za-z0-9_]+/g);
  const deploymentMethods = uniqueMatches(text, /deployment\.[A-Za-z0-9_]+/g);
  const logMethods = uniqueMatches(text, /[A-Za-z0-9_]+\.[A-Za-z0-9_]*(?:Deploy|deploy|Log|log)[A-Za-z0-9_]*/g);
  if (applicationMethods.length || deploymentMethods.length || logMethods.length) {
    hits.push({
      script,
      applicationMethods,
      deploymentMethods,
      logMethods,
    });
  }
}

console.log(JSON.stringify(hits, null, 2));

async function fetchText(path) {
  const response = await fetch(`${baseUrl}${path}`, {
    headers: { "x-api-key": required("DOKPLOY_API_KEY") },
  });
  return response.text();
}

function uniqueMatches(text, regex) {
  return [...new Set([...text.matchAll(regex)].map((match) => match[0]))].slice(0, 300);
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
