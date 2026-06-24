import { sql } from "drizzle-orm";
import { db, pool } from "./index";

async function testConnection() {
  try {
    console.log("Checking BYUH database connection...");
    const result = await db.execute(sql`select now() as now`);
    console.log("Database connected at:", result.rows[0]?.now);
  } catch (error) {
    console.error("Database connection failed:", error);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

testConnection();
