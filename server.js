/* eslint-disable @typescript-eslint/no-require-imports */
const express = require("express");
const cors = require("cors");
const path = require("path");
const dotenv = require("dotenv");
const OpenAI = require("openai");
const { Pool } = require("pg");

dotenv.config({ path: path.resolve(__dirname, ".env"), quiet: true });
dotenv.config({ path: path.resolve(__dirname, "..", ".env"), quiet: true });

const app = express();
app.use(cors());
app.use(express.json({ limit: "1mb" }));

const PORT = Number(process.env.PORT || 3001);
const OPENAI_MODEL = process.env.OPENAI_MODEL || "gpt-4.1-mini";
const EMBEDDING_MODEL = process.env.OPENAI_EMBEDDING_MODEL || "text-embedding-3-small";
const EMBEDDING_DIM = 1536;

const BYUH_START_URL = "https://admissions.byuh.edu/";
const BYUH_HOST = "admissions.byuh.edu";
const MAX_PAGES = 100;
const MAX_CHUNKS_PER_PAGE = 12;
const REQUEST_DELAY_MS = 500;

if (!process.env.OPENAI_API_KEY) {
  throw new Error("OPENAI_API_KEY is missing. Add it to .env.");
}

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is missing. Add it to .env.");
}

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const db = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function normalizeUrl(urlString) {
  try {
    const url = new URL(urlString);
    url.hash = "";
    if (url.pathname.length > 1 && url.pathname.endsWith("/")) {
      url.pathname = url.pathname.slice(0, -1);
    }
    return url.toString();
  } catch {
    return null;
  }
}

function isByuhAdmissionsUrl(urlString) {
  try {
    const url = new URL(urlString);
    if (url.hostname !== BYUH_HOST) return false;

    const blockedExt = [
      ".pdf", ".jpg", ".jpeg", ".png", ".gif", ".svg", ".zip",
      ".doc", ".docx", ".xls", ".xlsx", ".ppt", ".pptx",
      ".mp4", ".webm", ".mp3", ".wav"
    ];

    return !blockedExt.some((ext) => url.pathname.toLowerCase().endsWith(ext));
  } catch {
    return false;
  }
}

function extractTitle(html) {
  const match = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  if (!match) return "Untitled";
  return decodeHtml(stripWhitespace(match[1])).slice(0, 200) || "Untitled";
}

function stripWhitespace(text) {
  return text.replace(/\s+/g, " ").trim();
}

function decodeHtml(text) {
  return text
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

function htmlToMainText(html) {
  let cleaned = html;

  // Remove content that should not be part of retrieval context.
  cleaned = cleaned.replace(/<script[\s\S]*?<\/script>/gi, " ");
  cleaned = cleaned.replace(/<style[\s\S]*?<\/style>/gi, " ");
  cleaned = cleaned.replace(/<noscript[\s\S]*?<\/noscript>/gi, " ");
  cleaned = cleaned.replace(/<header[\s\S]*?<\/header>/gi, " ");
  cleaned = cleaned.replace(/<nav[\s\S]*?<\/nav>/gi, " ");
  cleaned = cleaned.replace(/<footer[\s\S]*?<\/footer>/gi, " ");
  cleaned = cleaned.replace(/<aside[\s\S]*?<\/aside>/gi, " ");

  const mainMatch = cleaned.match(/<main[^>]*>([\s\S]*?)<\/main>/i);
  if (mainMatch) {
    cleaned = mainMatch[1];
  }

  cleaned = cleaned.replace(/<[^>]+>/g, " ");
  cleaned = decodeHtml(cleaned);
  return stripWhitespace(cleaned);
}

function splitIntoChunks(text, chunkSize = 1200, overlap = 200) {
  const chunks = [];
  let start = 0;

  while (start < text.length) {
    const end = Math.min(start + chunkSize, text.length);
    const chunk = text.slice(start, end).trim();
    if (chunk.length > 0) chunks.push(chunk);
    if (end >= text.length) break;
    start = Math.max(0, end - overlap);
  }

  return chunks;
}

function extractLinks(html, baseUrl) {
  const hrefRegex = /href\s*=\s*["']([^"']+)["']/gi;
  const links = new Set();
  let match = hrefRegex.exec(html);

  while (match) {
    const href = match[1];
    try {
      const absolute = new URL(href, baseUrl).toString();
      const normalized = normalizeUrl(absolute);
      if (normalized && isByuhAdmissionsUrl(normalized)) {
        links.add(normalized);
      }
    } catch {
      // Ignore malformed URLs.
    }

    match = hrefRegex.exec(html);
  }

  return Array.from(links);
}

function vectorLiteral(values) {
  return `[${values.join(",")}]`;
}

async function ensureByuhTables() {
  await db.query("CREATE EXTENSION IF NOT EXISTS vector");

  await db.query(`
    CREATE TABLE IF NOT EXISTS byuh_chunks (
      id BIGSERIAL PRIMARY KEY,
      url TEXT NOT NULL,
      title TEXT NOT NULL DEFAULT '',
      content TEXT NOT NULL,
      chunk_index INTEGER NOT NULL,
      embedding VECTOR(${EMBEDDING_DIM}) NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (url, chunk_index)
    )
  `);

  await db.query(`
    CREATE INDEX IF NOT EXISTS byuh_chunks_embedding_idx
    ON byuh_chunks USING ivfflat (embedding vector_cosine_ops)
    WITH (lists = 100)
  `);
}

async function embedTexts(texts) {
  const response = await openai.embeddings.create({
    model: EMBEDDING_MODEL,
    input: texts,
  });

  return response.data.map((item) => item.embedding);
}

async function upsertChunks(rows) {
  for (const row of rows) {
    await db.query(
      `
      INSERT INTO byuh_chunks (url, title, content, chunk_index, embedding)
      VALUES ($1, $2, $3, $4, $5::vector)
      ON CONFLICT (url, chunk_index)
      DO UPDATE SET
        title = EXCLUDED.title,
        content = EXCLUDED.content,
        embedding = EXCLUDED.embedding,
        created_at = NOW()
      `,
      [row.url, row.title, row.content, row.chunkIndex, vectorLiteral(row.embedding)]
    );
  }
}

async function crawlByuhAdmissions() {
  const start = normalizeUrl(BYUH_START_URL);
  const queue = [start];
  const visited = new Set();
  const pages = [];

  while (queue.length > 0 && pages.length < MAX_PAGES) {
    const current = queue.shift();
    if (!current || visited.has(current)) continue;
    visited.add(current);

    let response;
    try {
      response = await fetch(current, {
        headers: { "User-Agent": "BYUH-Admissions-RAG-Bot/1.0" },
      });
    } catch {
      await sleep(REQUEST_DELAY_MS);
      continue;
    }

    if (!response.ok) {
      await sleep(REQUEST_DELAY_MS);
      continue;
    }

    const contentType = response.headers.get("content-type") || "";
    if (!contentType.includes("text/html")) {
      await sleep(REQUEST_DELAY_MS);
      continue;
    }

    const html = await response.text();
    const title = extractTitle(html);
    const text = htmlToMainText(html);

    if (text.length >= 250) {
      const chunks = splitIntoChunks(text).slice(0, MAX_CHUNKS_PER_PAGE);
      pages.push({ url: current, title, chunks });
    }

    const links = extractLinks(html, current);
    for (const link of links) {
      if (!visited.has(link)) queue.push(link);
    }

    await sleep(REQUEST_DELAY_MS);
  }

  return pages;
}

app.get("/", (_req, res) => {
  res.json({
    ok: true,
    service: "BYUH Admissions RAG API",
    websiteScope: BYUH_START_URL,
    endpoints: ["GET /health", "POST /ingest/byuh", "POST /chat"],
  });
});

app.get("/health", async (_req, res) => {
  try {
    await ensureByuhTables();
    res.json({ ok: true });
  } catch (error) {
    res.status(500).json({ ok: false, error: error.message });
  }
});

app.post("/ingest/byuh", async (_req, res) => {
  try {
    await ensureByuhTables();

    const pages = await crawlByuhAdmissions();
    const allRows = [];

    for (const page of pages) {
      page.chunks.forEach((content, idx) => {
        allRows.push({
          url: page.url,
          title: page.title,
          content,
          chunkIndex: idx,
        });
      });
    }

    const batchSize = 25;
    let upserted = 0;

    for (let i = 0; i < allRows.length; i += batchSize) {
      const batch = allRows.slice(i, i + batchSize);
      const embeddings = await embedTexts(batch.map((row) => row.content));
      const rows = batch.map((row, idx) => ({ ...row, embedding: embeddings[idx] }));
      await upsertChunks(rows);
      upserted += rows.length;
    }

    res.json({
      ok: true,
      websiteScope: BYUH_START_URL,
      pagesCrawled: pages.length,
      chunksUpserted: upserted,
      uniqueUrls: pages.map((p) => p.url),
    });
  } catch (error) {
    console.error("Ingest error:", error);
    res.status(500).json({ ok: false, error: error.message || "Ingestion failed" });
  }
});

app.post("/chat", async (req, res) => {
  try {
    await ensureByuhTables();

    const question = req.body?.message;
    if (!question || typeof question !== "string") {
      return res.status(400).json({ error: "message is required" });
    }

    const [queryEmbedding] = await embedTexts([question]);
    const queryVector = vectorLiteral(queryEmbedding);

    const topK = 5;
    const result = await db.query(
      `
      SELECT url, title, content, (1 - (embedding <=> $1::vector)) AS score
      FROM byuh_chunks
      ORDER BY embedding <=> $1::vector
      LIMIT $2
      `,
      [queryVector, topK]
    );

    if (result.rowCount === 0) {
      return res.status(400).json({
        error: "No BYUH Admissions data found. Run POST /ingest/byuh first.",
      });
    }

    const context = result.rows
      .map((row, i) => `Source ${i + 1}\nURL: ${row.url}\nTitle: ${row.title}\nContent: ${row.content}`)
      .join("\n\n---\n\n");

    const response = await openai.responses.create({
      model: OPENAI_MODEL,
      input: [
        {
          role: "system",
          content:
            "You are the BYU-Hawaii Admissions Assistant. Answer ONLY from admissions.byuh.edu context provided. If answer is not in sources, say you do not know and advise contacting BYUH Admissions. Include source URLs.",
        },
        {
          role: "user",
          content: `Question: ${question}\n\nRetrieved BYUH Admissions Sources:\n${context}`,
        },
      ],
      max_output_tokens: 450,
    });

    const sources = Array.from(new Set(result.rows.map((row) => row.url)));
    res.json({ reply: response.output_text || "I could not generate a response.", sources });
  } catch (error) {
    console.error("Chat error:", error);
    res.status(error.status || 500).json({ error: error.message || "AI request failed." });
  }
});

app.listen(PORT, () => {
  console.log(`BYUH Admissions RAG server running on port ${PORT}`);
});
