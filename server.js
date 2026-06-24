const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");

const ROOT = __dirname;
const PORT = Number(process.env.PORT) || 3000;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const OPENAI_MODEL = process.env.OPENAI_MODEL || "gpt-5-mini";
const ALLOWED_ORIGINS = new Set([
  "https://dolly123729.github.io",
  "http://localhost:3000",
  "http://127.0.0.1:3000",
  "http://localhost:5501",
  "http://127.0.0.1:5501"
]);

const RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000;
const RATE_LIMIT_MAX_REQUESTS = 20;
const requestCounts = new Map();

const mimeTypes = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".svg": "image/svg+xml"
};

const server = http.createServer(async (request, response) => {
  try {
    const requestUrl = new URL(request.url, `http://${request.headers.host || "localhost"}`);

    if (requestUrl.pathname === "/health") {
      sendJson(response, 200, { status: "ok" });
      return;
    }

    if (requestUrl.pathname === "/api/chat") {
      if (!applyCors(request, response)) return;

      if (request.method === "OPTIONS") {
        response.writeHead(204);
        response.end();
        return;
      }

      if (request.method !== "POST") {
        sendJson(response, 405, { error: "Method not allowed." });
        return;
      }

      if (!checkRateLimit(request, response)) return;
      await handleChat(request, response);
      return;
    }

    if (request.method !== "GET") {
      sendJson(response, 405, { error: "Method not allowed." });
      return;
    }

    serveStaticFile(requestUrl.pathname, response);
  } catch (error) {
    console.error(error);
    if (!response.headersSent) {
      sendJson(response, 500, { error: "Unexpected server error." });
    }
  }
});

function applyCors(request, response) {
  const origin = request.headers.origin;

  if (!origin) return true;

  if (!ALLOWED_ORIGINS.has(origin)) {
    sendJson(response, 403, { error: "This website is not allowed to use the chatbot." });
    return false;
  }

  response.setHeader("Access-Control-Allow-Origin", origin);
  response.setHeader("Vary", "Origin");
  response.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  response.setHeader("Access-Control-Allow-Headers", "Content-Type");
  return true;
}

function checkRateLimit(request, response) {
  const forwardedFor = request.headers["x-forwarded-for"];
  const clientIp = String(forwardedFor || request.socket.remoteAddress || "unknown")
    .split(",")[0]
    .trim();
  const now = Date.now();
  const current = requestCounts.get(clientIp);

  if (!current || now >= current.resetAt) {
    requestCounts.set(clientIp, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return true;
  }

  if (current.count >= RATE_LIMIT_MAX_REQUESTS) {
    const retryAfter = Math.ceil((current.resetAt - now) / 1000);
    response.setHeader("Retry-After", retryAfter);
    sendJson(response, 429, { error: "Too many messages. Please try again later." });
    return false;
  }

  current.count += 1;
  return true;
}

async function handleChat(request, response) {
  if (!OPENAI_API_KEY) {
    sendJson(response, 500, { error: "The chatbot API key is not configured on the server." });
    return;
  }

  const body = await readJsonBody(request);
  const messages = Array.isArray(body.messages) ? body.messages : [];
  const safeMessages = messages
    .filter(
      (message) =>
        (message.role === "user" || message.role === "assistant") &&
        typeof message.content === "string"
    )
    .slice(-10)
    .map((message) => ({
      role: message.role,
      content: message.content.trim().slice(0, 2000)
    }))
    .filter((message) => message.content);

  if (!safeMessages.length || safeMessages.at(-1).role !== "user") {
    sendJson(response, 400, { error: "Please enter a message." });
    return;
  }

  const apiResponse = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${OPENAI_API_KEY}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: OPENAI_MODEL,
      instructions:
        "You are EK NAI Assistant, a friendly English-learning tutor for students. " +
        "Give clear, encouraging, age-appropriate answers. Keep most answers under 150 words. " +
        "Help with grammar, vocabulary, reading, speaking practice, quizzes, and responsible AI-tool use.",
      input: safeMessages,
      max_output_tokens: 300
    })
  });

  const data = await apiResponse.json();

  if (!apiResponse.ok) {
    console.error("OpenAI API error:", data.error?.code || apiResponse.status);
    sendJson(response, 502, { error: "The learning assistant is temporarily unavailable." });
    return;
  }

  const reply = extractOutputText(data);
  if (!reply) {
    sendJson(response, 502, { error: "The assistant returned an empty response." });
    return;
  }

  sendJson(response, 200, { reply });
}

function extractOutputText(data) {
  if (typeof data.output_text === "string") return data.output_text.trim();

  return (data.output || [])
    .flatMap((item) => item.content || [])
    .filter((item) => item.type === "output_text" && typeof item.text === "string")
    .map((item) => item.text)
    .join("\n")
    .trim();
}

function readJsonBody(request) {
  return new Promise((resolve, reject) => {
    let body = "";

    request.on("data", (chunk) => {
      body += chunk;
      if (body.length > 25_000) {
        reject(new Error("Request body is too large."));
        request.destroy();
      }
    });

    request.on("end", () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch {
        reject(new Error("Invalid JSON request."));
      }
    });

    request.on("error", reject);
  });
}

function serveStaticFile(urlPath, response) {
  const requestedPath = urlPath === "/" ? "index.html" : decodeURIComponent(urlPath).replace(/^\/+/, "");
  const filePath = path.resolve(ROOT, requestedPath);

  if (filePath !== ROOT && !filePath.startsWith(`${ROOT}${path.sep}`)) {
    response.writeHead(403);
    response.end("Forbidden");
    return;
  }

  fs.readFile(filePath, (error, content) => {
    if (error) {
      response.writeHead(error.code === "ENOENT" ? 404 : 500);
      response.end(error.code === "ENOENT" ? "Not found" : "Server error");
      return;
    }

    const contentType = mimeTypes[path.extname(filePath).toLowerCase()] || "application/octet-stream";
    response.writeHead(200, { "Content-Type": contentType });
    response.end(content);
  });
}

function sendJson(response, statusCode, payload) {
  response.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store"
  });
  response.end(JSON.stringify(payload));
}

server.listen(PORT, "0.0.0.0", () => {
  console.log(`EK NAI is running on port ${PORT}`);
  if (!OPENAI_API_KEY) {
    console.warn("OPENAI_API_KEY is not set.");
  }
});
