import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import postgres from "postgres";
import { env } from "@/lib/env";

/**
 * Tiny SQL-file migrator. Tracks applied filenames in `_migrations` so each
 * file runs once. Run via: `npm run migrate`.
 */
async function main() {
  const dir = join(process.cwd(), "drizzle");
  const sql = postgres(env.databaseUrl(), { max: 1, prepare: false });
  try {
    await sql`CREATE TABLE IF NOT EXISTS _migrations (
      name text PRIMARY KEY,
      applied_at timestamptz NOT NULL DEFAULT now()
    )`;
    const applied = new Set<string>(
      (await sql<{ name: string }[]>`SELECT name FROM _migrations`).map((r) => r.name),
    );
    const files = (await readdir(dir)).filter((f) => f.endsWith(".sql")).sort();
    for (const file of files) {
      if (applied.has(file)) continue;
      const text = await readFile(join(dir, file), "utf8");
      console.log(`[migrate] applying ${file}`);
      await sql.unsafe(text);
      await sql`INSERT INTO _migrations (name) VALUES (${file})`;
    }
    console.log(`[migrate] up to date (${files.length} file(s))`);
  } finally {
    await sql.end();
  }
}

main().catch((err) => {
  console.error("[migrate] failed:", err);
  process.exit(1);
});
