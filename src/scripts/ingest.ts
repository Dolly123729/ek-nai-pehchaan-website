import { config } from "dotenv";
import pLimit from "p-limit";
import OpenAI from "openai";
import { sql } from "drizzle-orm";
import path from "path";
import { db, pool } from "../db";
import { byuhChunks } from "../db/schema";
import { crawlByuhAdmissions } from "../lib/scraper";

config({ path: path.resolve(process.cwd(), ".env"), quiet: true });
config({ path: path.resolve(process.cwd(), "..", ".env"), quiet: true });

const EMBEDDING_MODEL = "text-embedding-3-small";
const CHUNK_SIZE = 1200;
const CHUNK_OVERLAP = 200;
const CONCURRENCY = 5;

function splitIntoChunks(text: string, chunkSize = CHUNK_SIZE, overlap = CHUNK_OVERLAP) {
  const chunks: string[] = [];
  let start = 0;

  while (start < text.length) {
    const end = Math.min(start + chunkSize, text.length);
    const chunk = text.slice(start, end).trim();
    if (chunk) chunks.push(chunk);
    if (end >= text.length) break;
    start = Math.max(0, end - overlap);
  }

  return chunks;
}

async function ingest() {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY missing in .env");
  }

  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

  console.log("Scraping: https://admissions.byuh.edu/");
  const pages = await crawlByuhAdmissions();
  console.log(`Scraped pages: ${pages.length}`);

  const rows: Array<{
    url: string;
    title: string;
    content: string;
    chunkIndex: number;
  }> = [];

  for (const page of pages) {
    const chunks = splitIntoChunks(page.content).slice(0, 12);
    chunks.forEach((content, chunkIndex) => {
      rows.push({ url: page.url, title: page.title, content, chunkIndex });
    });
  }

  const limit = pLimit(CONCURRENCY);
  const embeddedRows = await Promise.all(
    rows.map((row) =>
      limit(async () => {
        const resp = await client.embeddings.create({
          model: EMBEDDING_MODEL,
          input: row.content,
        });
        return {
          ...row,
          embedding: resp.data[0].embedding,
        };
      })
    )
  );

  for (const row of embeddedRows) {
    const embeddingLiteral = `[${row.embedding.join(",")}]`;
    await db
      .insert(byuhChunks)
      .values({
        url: row.url,
        title: row.title,
        content: row.content,
        chunkIndex: row.chunkIndex,
        embedding: sql`${embeddingLiteral}::vector`,
      })
      .onConflictDoUpdate({
        target: [byuhChunks.url, byuhChunks.chunkIndex],
        set: {
          title: row.title,
          content: row.content,
          embedding: sql`${embeddingLiteral}::vector`,
          createdAt: sql`now()`,
        },
      });
  }

  console.log(`Upserted chunks: ${embeddedRows.length}`);
  await pool.end();
}

ingest().catch(async (error) => {
  console.error("Ingestion failed:", error);
  await pool.end();
  process.exit(1);
});
