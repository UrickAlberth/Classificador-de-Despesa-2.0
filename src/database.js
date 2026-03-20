import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";
import { config } from "./config.js";
import { safeJsonParse } from "./utils.js";

function resolveDbPath() {
  const sourcePath = path.isAbsolute(config.dbPath)
    ? config.dbPath
    : path.join(process.cwd(), config.dbPath);

  // Em funcoes serverless da Vercel, /var/task e somente leitura.
  if (process.env.VERCEL === "1") {
    const targetPath = path.join("/tmp", path.basename(sourcePath));
    if (!fs.existsSync(targetPath)) {
      fs.copyFileSync(sourcePath, targetPath);
    }
    return targetPath;
  }

  return sourcePath;
}

const db = new Database(resolveDbPath());

db.exec(`
  CREATE TABLE IF NOT EXISTS table8_embedding_cache (
    row_id TEXT PRIMARY KEY,
    embedding_json TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
`);

function quotedIdentifier(name) {
  return `"${String(name).replace(/"/g, '""')}"`;
}

const table = quotedIdentifier(config.table8.tableName);
const idColumn = quotedIdentifier(config.table8.idColumn);
const nameColumn = quotedIdentifier(config.table8.nameColumn);
const interpretationColumn = quotedIdentifier(config.table8.interpretationColumn);

export function getTable8Rows() {
  const stmt = db.prepare(`
    SELECT
      ${idColumn} AS id,
      ${nameColumn} AS name,
      ${interpretationColumn} AS interpretation
    FROM ${table}
    WHERE ${interpretationColumn} IS NOT NULL
      AND TRIM(${interpretationColumn}) <> ''
  `);

  return stmt.all();
}

export function getCachedEmbedding(rowId) {
  const stmt = db.prepare("SELECT embedding_json FROM table8_embedding_cache WHERE row_id = ?");
  const row = stmt.get(String(rowId));
  if (!row) return null;
  return safeJsonParse(row.embedding_json, null);
}

export function saveCachedEmbedding(rowId, embedding) {
  const stmt = db.prepare(`
    INSERT INTO table8_embedding_cache (row_id, embedding_json, updated_at)
    VALUES (?, ?, datetime('now'))
    ON CONFLICT(row_id)
    DO UPDATE SET
      embedding_json = excluded.embedding_json,
      updated_at = excluded.updated_at
  `);

  stmt.run(String(rowId), JSON.stringify(embedding));
}

export function closeDb() {
  db.close();
}
