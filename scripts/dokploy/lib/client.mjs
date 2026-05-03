export class DokployClient {
  constructor({ baseUrl, apiKey }) {
    this.baseUrl = baseUrl.replace(/\/$/, "");
    this.apiKey = apiKey;
  }

  async get(path) {
    return this.request("GET", path);
  }

  async post(path, body = {}) {
    return this.request("POST", path, body);
  }

  async request(method, path, body) {
    const response = await fetch(`${this.baseUrl}${path}`, {
      method,
      headers: {
        "Content-Type": "application/json",
        "x-api-key": this.apiKey,
      },
      body: method === "POST" ? JSON.stringify(body) : undefined,
    });
    const text = await response.text();
    const data = text ? safeJson(text) : null;
    if (!response.ok) {
      const detail = typeof data === "object" ? JSON.stringify(data) : text;
      throw new Error(`${method} ${path} failed ${response.status}: ${detail}`);
    }
    return data;
  }
}

function safeJson(text) {
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}
