/**
 * Daily JSON export of every OficinaPlan table.
 *
 *   SUPABASE_URL=https://jltzehisxmxywhxmdxmt.supabase.co \
 *   SUPABASE_SERVICE_ROLE_KEY=... \
 *   node scripts/backup.mjs
 *
 * Writes backups/oficinaplan-<date>/*.json. Schedule it on a machine that
 * keeps the service role key. Never put that key in the GitHub Pages build.
 * The anon key cannot read other companies' rows; this script uses the
 * service role and therefore bypasses RLS.
 */
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const url = process.env.SUPABASE_URL || "https://jltzehisxmxywhxmdxmt.supabase.co";
const key = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
if (!key) {
  console.error("Define SUPABASE_SERVICE_ROLE_KEY (service role, not the anon key).");
  process.exit(1);
}

const tables = [
  "companies",
  "memberships",
  "clients",
  "vehicles",
  "articles",
  "suppliers",
  "orders",
  "quotes",
  "doc_lines",
  "purchases",
  "purchase_lines",
  "appointments",
  "invoice_logs",
  "staff",
  "assignments",
  "work_logs",
  "punches",
  "internal_services",
  "company_settings",
  "document_counters",
];

const day = new Date().toISOString().slice(0, 10);
const dir = path.resolve("backups", `oficinaplan-${day}`);
await mkdir(dir, { recursive: true });

for (const table of tables) {
  const response = await fetch(`${url}/rest/v1/${table}?select=*`, {
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      Accept: "application/json",
    },
  });
  if (!response.ok) {
    console.error(`${table}: ${response.status} ${await response.text()}`);
    process.exitCode = 1;
    continue;
  }
  const rows = await response.json();
  await writeFile(path.join(dir, `${table}.json`), `${JSON.stringify(rows, null, 2)}\n`);
  console.log(`${table}: ${Array.isArray(rows) ? rows.length : 0}`);
}
console.log(dir);
