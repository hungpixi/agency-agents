import fs from "node:fs";

const env = loadEnv("deploy/dokploy.env");
const baseUrl = required("DOKPLOY_BASE_URL").replace(/\/$/, "");
const applicationId = process.argv[2] || "1cMgVO-rZ8ePfP9uDlcyC";

const deployments = await getJson(`/api/deployment.allByType?id=${encodeURIComponent(applicationId)}&type=application`);
const latest = deployments?.[0];
if (!latest?.logPath) {
  throw new Error(`No deployment log found for ${applicationId}`);
}

const wsUrl = `${baseUrl.replace(/^http/, "ws")}/listen-deployment?logPath=${latest.logPath}`;
const socket = new WebSocket(wsUrl);
let output = "";

const timeout = setTimeout(() => {
  socket.close();
}, 20000);

socket.addEventListener("message", (event) => {
  output += event.data;
});

socket.addEventListener("close", () => {
  clearTimeout(timeout);
  console.log(output.slice(-12000));
});

socket.addEventListener("error", (event) => {
  clearTimeout(timeout);
  console.error(event.message || "WebSocket error");
  process.exitCode = 1;
});

async function getJson(path) {
  const response = await fetch(`${baseUrl}${path}`, {
    headers: { "x-api-key": required("DOKPLOY_API_KEY") },
  });
  if (!response.ok) {
    throw new Error(`GET ${path} failed ${response.status}: ${await response.text()}`);
  }
  return response.json();
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
