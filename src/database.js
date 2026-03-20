import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "./config.js";
import { safeJsonParse } from "./utils.js";

// Diretorio deste arquivo (src/), independente de onde o processo foi iniciado
const __fileDir = path.dirname(fileURLToPath(import.meta.url));

function resolveDbPath(dbPath) {
  if (path.isAbsolute(dbPath)) {
    return copyToTmpIfVercel(dbPath);
  }

  // Tenta encontrar o arquivo em varias localizacoes possiveis
  const candidates = [
    path.resolve(__fileDir, "..", dbPath), // /var/task/arquivo.db  (src/ -> raiz)
    path.join(process.cwd(), dbPath),      // /var/task/arquivo.db  (cwd = raiz)
    path.resolve(__fileDir, dbPath),       // /var/task/src/arquivo.db (fallback)
  ];

  const found = candidates.find((p) => fs.existsSync(p));
  if (!found) {
    throw new Error(
      `Banco de dados nao encontrado: '${dbPath}'.\nLocais verificados:\n` +
        candidates.map((p) => `  - ${p}`).join("\n")
    );
  }

  return copyToTmpIfVercel(found);
}

function copyToTmpIfVercel(sourcePath) {
  if (process.env.VERCEL !== "1") return sourcePath;
  const targetPath = path.join("/tmp", path.basename(sourcePath));
  if (!fs.existsSync(targetPath)) {
    fs.copyFileSync(sourcePath, targetPath);
  }
  return targetPath;
}

// Conexao principal: Tabela 8 + cache de embeddings
const db = new Database(resolveDbPath(config.dbPath));
// Conexao CATMAS: banco separado com materiais e servicos
const catmasDb = new Database(resolveDbPath(config.catmasDbPath));

db.exec(`
  CREATE TABLE IF NOT EXISTS embedding_cache (
    scope TEXT NOT NULL,
    row_id TEXT NOT NULL,
    embedding_json TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    PRIMARY KEY (scope, row_id)
  );
`);

function quotedIdentifier(name) {
  return `"${String(name).replace(/"/g, '""')}"`;
}

const table = quotedIdentifier(config.table8.tableName);
const idColumn = quotedIdentifier(config.table8.idColumn);
const nameColumn = quotedIdentifier(config.table8.nameColumn);
const interpretationColumn = quotedIdentifier(config.table8.interpretationColumn);

function getColumnsMap(tableName) {
  const rows = db.prepare(`PRAGMA table_info(${quotedIdentifier(tableName)})`).all();
  const map = new Map();
  for (const row of rows) {
    map.set(String(row.name).toLowerCase(), row.name);
  }
  return map;
}

function resolveColumnName(columnsMap, preferredName) {
  if (!preferredName) return null;
  return columnsMap.get(String(preferredName).toLowerCase()) || null;
}

function tableExists(tableName) {
  const row = catmasDb
    .prepare("SELECT name FROM sqlite_master WHERE type='table' AND LOWER(name) = LOWER(?)")
    .get(tableName);
  return Boolean(row);
}

function getCatmasColumnsMap(tableName) {
  const rows = catmasDb.prepare(`PRAGMA table_info(${quotedIdentifier(tableName)})`).all();
  const map = new Map();
  for (const row of rows) {
    map.set(String(row.name).toLowerCase(), row.name);
  }
  return map;
}

let catmasSchemaValidated = false;

export function validateCatmasSchema() {
  if (catmasSchemaValidated) {
    return;
  }

  const requiredLogicalFields = [
    ["CATMAS_ID_COLUMN", config.catmas.idColumn],
    ["CATMAS_CODE_COLUMN", config.catmas.codeColumn],
    ["CATMAS_DESCRIPTION_COLUMN", config.catmas.descriptionColumn],
    ["CATMAS_STATUS_COLUMN", config.catmas.statusColumn],
    ["CATMAS_SUPPLY_LINE_COLUMN", config.catmas.supplyLineColumn],
    ["CATMAS_TABLE8_LINK_COLUMN", config.catmas.table8LinkColumn]
  ];

  for (const tableName of config.catmas.tables) {
    if (!tableExists(tableName)) {
      throw new Error(`Tabela CATMAS inexistente no banco: ${tableName}`);
    }

    const columnsMap = getCatmasColumnsMap(tableName);
    for (const [envName, colName] of requiredLogicalFields) {
      if (!resolveColumnName(columnsMap, colName)) {
        throw new Error(
          `Schema CATMAS invalido: coluna '${colName}' (${envName}) nao encontrada em '${tableName}'.`
        );
      }
    }
  }

  catmasSchemaValidated = true;
}

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

export function getCatmasRowsByTable8(table8Id) {
  validateCatmasSchema();

  const allRows = [];

  for (const tableName of config.catmas.tables) {
    const columnsMap = getCatmasColumnsMap(tableName);

    const idCol = resolveColumnName(columnsMap, config.catmas.idColumn);
    const codeCol = resolveColumnName(columnsMap, config.catmas.codeColumn);
    const descCol = resolveColumnName(columnsMap, config.catmas.descriptionColumn);
    const detailedCol = resolveColumnName(columnsMap, config.catmas.detailedDescriptionColumn);
    const statusCol = resolveColumnName(columnsMap, config.catmas.statusColumn);
    const supplyLineCol = resolveColumnName(columnsMap, config.catmas.supplyLineColumn);
    const supplySubLineCol = resolveColumnName(columnsMap, config.catmas.supplySubLineColumn);
    const linkCol = resolveColumnName(columnsMap, config.catmas.table8LinkColumn);

    const selectParts = [
      `${quotedIdentifier(idCol)} AS id`,
      `${quotedIdentifier(codeCol)} AS code`,
      `${quotedIdentifier(descCol)} AS description`,
      detailedCol ? `${quotedIdentifier(detailedCol)} AS detailedDescription` : `'' AS detailedDescription`,
      `${quotedIdentifier(statusCol)} AS status`,
      `${quotedIdentifier(supplyLineCol)} AS supplyLine`,
      supplySubLineCol
        ? `${quotedIdentifier(supplySubLineCol)} AS supplySubLine`
        : `'' AS supplySubLine`,
      `${quotedIdentifier(linkCol)} AS table8Link`
    ];

    const whereParts = ["1=1"];
    const params = [];

    if (config.catmas.activeOnly) {
      whereParts.push(`UPPER(TRIM(${quotedIdentifier(statusCol)})) IN ('ATIVO', 'A')`);
    }

    if (table8Id !== null && table8Id !== undefined) {
      whereParts.push(`CAST(${quotedIdentifier(linkCol)} AS TEXT) LIKE ?`);
      params.push(`%${String(table8Id)}%`);
    }

    const sql = `
      SELECT ${selectParts.join(", ")}
      FROM ${quotedIdentifier(tableName)}
      WHERE ${whereParts.join(" AND ")}
      LIMIT ${Number.isFinite(config.catmas.maxRowsPerLookup) ? config.catmas.maxRowsPerLookup : 400}
    `;

    const rows = catmasDb.prepare(sql).all(...params).map((row) => ({
      ...row,
      supplyLine:
        row.supplySubLine && String(row.supplySubLine).trim().length > 0
          ? `${row.supplyLine} / ${row.supplySubLine}`
          : row.supplyLine,
      sourceTable: tableName
    }));

    allRows.push(...rows);
  }

  return allRows;
}

export function getCachedEmbedding(scope, rowId) {
  const stmt = db.prepare("SELECT embedding_json FROM embedding_cache WHERE scope = ? AND row_id = ?");
  const row = stmt.get(String(scope), String(rowId));
  if (!row) return null;
  return safeJsonParse(row.embedding_json, null);
}

export function saveCachedEmbedding(scope, rowId, embedding) {
  const stmt = db.prepare(`
    INSERT INTO embedding_cache (scope, row_id, embedding_json, updated_at)
    VALUES (?, ?, ?, datetime('now'))
    ON CONFLICT(scope, row_id)
    DO UPDATE SET
      embedding_json = excluded.embedding_json,
      updated_at = excluded.updated_at
  `);

  stmt.run(String(scope), String(rowId), JSON.stringify(embedding));
}

export function closeDb() {
  db.close();
  catmasDb.close();
}
