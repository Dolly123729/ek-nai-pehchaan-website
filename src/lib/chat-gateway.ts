import OpenAI from "openai";
import { Pool } from "pg";

const OPENAI_MODEL = process.env.OPENAI_MODEL || "gpt-4.1-mini";
const EMBEDDING_MODEL =
  process.env.OPENAI_EMBEDDING_MODEL || "text-embedding-3-small";

let pool: Pool | null = null;
let openai: OpenAI | null = null;

function getRequiredEnv(name: "OPENAI_API_KEY" | "DATABASE_URL") {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} is missing. Add it to .env.`);
  }
  return value;
}

function getOptionalDatabaseUrl() {
  const value = process.env.DATABASE_URL?.trim();
  if (!value) return null;
  if (value.includes("user:password@host/dbname")) return null;
  return value;
}

function getPool() {
  if (!pool) {
    pool = new Pool({
      connectionString: getRequiredEnv("DATABASE_URL"),
      ssl: { rejectUnauthorized: false },
    });
  }

  return pool;
}

function getOpenAIClient() {
  if (!openai) {
    openai = new OpenAI({ apiKey: getRequiredEnv("OPENAI_API_KEY") });
  }

  return openai;
}

function vectorLiteral(values: number[]) {
  return `[${values.join(",")}]`;
}

export async function checkGatewayHealth() {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY is missing. Add it to .env.");
  }

  const databaseUrl = getOptionalDatabaseUrl();
  if (!databaseUrl) {
    return { ok: true, mode: "openai-only" };
  }

  const db = getPool();
  await db.query("SELECT 1");
  return { ok: true, mode: "rag" };
}

async function answerWithGeneralOpenAI(question: string) {
  const client = getOpenAIClient();
  const response = await client.responses.create({
    model: OPENAI_MODEL,
    input: [
      {
        role: "system",
        content:
          "You are a helpful BYUH admissions assistant. Answer clearly and carefully. If you are not certain, say so and encourage the user to confirm details on the official BYUH admissions website.",
      },
      {
        role: "user",
        content: question,
      },
    ],
    max_output_tokens: 450,
  });

  return {
    reply:
      response.output_text ||
      "I could not generate a response. Please try again.",
    sources: ["https://admissions.byuh.edu/"],
    mode: "openai-only",
  };
}

export async function answerAdmissionsQuestion(question: string) {
  const trimmedQuestion = question.trim();
  if (!trimmedQuestion) {
    throw new Error("message is required");
  }

  const databaseUrl = getOptionalDatabaseUrl();
  if (!databaseUrl) {
    return answerWithGeneralOpenAI(trimmedQuestion);
  }

  const client = getOpenAIClient();
  const db = getPool();

  const embeddingResponse = await client.embeddings.create({
    model: EMBEDDING_MODEL,
    input: [trimmedQuestion],
  });

  const queryVector = vectorLiteral(embeddingResponse.data[0].embedding);
  const result = await db.query(
    `
    SELECT url, title, content, (1 - (embedding <=> $1::vector)) AS score
    FROM byuh_chunks
    ORDER BY embedding <=> $1::vector
    LIMIT $2
    `,
    [queryVector, 5]
  );

  if (result.rowCount === 0) {
    return answerWithGeneralOpenAI(trimmedQuestion);
  }

  const context = result.rows
    .map(
      (row, index) =>
        `Source ${index + 1}\nURL: ${row.url}\nTitle: ${row.title}\nContent: ${row.content}`
    )
    .join("\n\n---\n\n");

  const response = await client.responses.create({
    model: OPENAI_MODEL,
    input: [
      {
        role: "system",
        content:
          "You are the BYU-Hawaii Admissions Assistant. Answer only from the provided BYUH admissions sources. If the answer is not in the sources, say you do not know and advise contacting BYUH Admissions. Include source URLs when relevant.",
      },
      {
        role: "user",
        content: `Question: ${trimmedQuestion}\n\nRetrieved BYUH Admissions Sources:\n${context}`,
      },
    ],
    max_output_tokens: 450,
  });

  return {
    reply: response.output_text || "I could not generate a response.",
    sources: Array.from(new Set(result.rows.map((row) => row.url))),
    mode: "rag",
  };
}
