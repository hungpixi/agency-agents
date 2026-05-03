import crypto from "node:crypto";
import fs from "node:fs";

export function loadEnv(path = "deploy/dokploy.env") {
  const text = fs.readFileSync(path, "utf8");
  return parseEnv(text);
}

export function parseEnv(text) {
  const env = {};
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const index = trimmed.indexOf("=");
    if (index === -1) continue;
    env[trimmed.slice(0, index)] = trimmed.slice(index + 1);
  }
  return env;
}

export function saveEnv(path, updates) {
  let text = fs.readFileSync(path, "utf8");
  for (const [key, value] of Object.entries(updates)) {
    const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const pattern = new RegExp(`^${escaped}=.*$`, "m");
    const line = `${key}=${value}`;
    if (pattern.test(text)) {
      text = text.replace(pattern, line);
    } else {
      text += `\n${line}`;
    }
  }
  fs.writeFileSync(path, text.endsWith("\n") ? text : `${text}\n`);
}

export function requireEnv(env, keys) {
  const missing = keys.filter((key) => !env[key] || env[key].includes("<"));
  if (missing.length) {
    throw new Error(`Missing required env values: ${missing.join(", ")}`);
  }
}

export function needsValue(value) {
  return !value || value.includes("<");
}

export function randomToken(bytes = 32) {
  return crypto.randomBytes(bytes).toString("hex");
}

export function randomPassword(bytes = 18) {
  return crypto.randomBytes(bytes).toString("base64url");
}
