const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");

const ROOT = __dirname;
const PORT = Number(process.env.PORT) || 3000;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const OPENAI_MODEL = process.env.OPENAI_MODEL || "gpt-5-mini";


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
    if (request.method === "POST" && request.url === "/api/chat") {
      await handleChat(request, response);
      return;
    }

    if (request.method !== "GET") {
      sendJson(response, 405, { error: "Method not allowed." });
      return;
    }

    serveStaticFile(request.url, response);
  } catch (error) {
    console.error(error);
    sendJson(response, 500, { error: error.message || "Unexpected server error." });
  }
});

async function handleChat(request, response) {
  if (!OPENAI_API_KEY) {
    sendJson(response, 500, {
      error: "OPENAI_API_KEY is missing. Add it to your .env file and restart the server."
    });
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
      content: message.content.slice(0, 2000)
    }));

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
      input: safeMessages
    })
  });

  const data = await apiResponse.json();

  if (!apiResponse.ok) {
    console.error("OpenAI API error:", data);
    sendJson(response, apiResponse.status, {
      error: data.error?.message || "The OpenAI API request failed."
    });
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
      if (body.length > 50_000) {
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

function serveStaticFile(url, response) {
  const pathname = decodeURIComponent((url || "/").split("?")[0]);
  const requestedPath = pathname === "/" ? "index.html" : pathname.replace(/^\/+/, "");
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

    const contentType =
      mimeTypes[path.extname(filePath).toLowerCase()] || "application/octet-stream";
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

server.listen(PORT, () => {
  console.log(`EK NAI is running at http://localhost:${PORT}`);
  if (!OPENAI_API_KEY) {
    console.warn("OPENAI_API_KEY is not set. Add it to .env before using the chatbot.");
  }
});


