import { config } from "dotenv";
import { Pool } from "pg";
import path from "path";

config({ path: path.resolve(process.cwd(), ".env"), quiet: true });
config({ path: path.resolve(process.cwd(), "..", ".env"), quiet: true });

async function migrate() {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is required in .env");
  }

  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
  });

  const client = await pool.connect();

  try {
    await client.query("CREATE EXTENSION IF NOT EXISTS vector;");
    await client.query("CREATE EXTENSION IF NOT EXISTS pgcrypto;");

    await client.query(`
      CREATE TABLE IF NOT EXISTS byuh_chunks (
        id SERIAL PRIMARY KEY,
        url TEXT NOT NULL,
        title TEXT NOT NULL DEFAULT '',
        content TEXT NOT NULL,
        chunk_index INTEGER NOT NULL,
        embedding vector(1536),
        created_at TIMESTAMPTZ DEFAULT NOW(),
        UNIQUE (url, chunk_index)
      );
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS sessions (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        created_at TIMESTAMPTZ DEFAULT NOW()
      );
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS conversations (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        session_id UUID NOT NULL REFERENCES sessions(id),
        title TEXT NOT NULL DEFAULT 'New conversation',
        created_at TIMESTAMPTZ DEFAULT NOW()
      );
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS chat_messages (
        id SERIAL PRIMARY KEY,
        conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
        role TEXT NOT NULL,
        content TEXT NOT NULL,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS byuh_chunks_embedding_idx
      ON byuh_chunks USING ivfflat (embedding vector_cosine_ops)
      WITH (lists = 100);
    `);

    console.log("Migration complete.");
  } finally {
    client.release();
    await pool.end();
  }
}

migrate().catch((error) => {
  console.error("Migration failed:", error);
  process.exit(1);
});
