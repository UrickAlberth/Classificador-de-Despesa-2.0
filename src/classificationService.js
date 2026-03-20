import { chatJson, createEmbedding } from "./azureOpenAIClient.js";
import { config } from "./config.js";
import {
  getCachedEmbedding,
  getCatmasRowsByTable8,
  getTable8Rows,
  saveCachedEmbedding
} from "./database.js";
import { cosineSimilarity, ensureArray } from "./utils.js";

async function extractItemsFromDocument(ocrText, documentType = "Nao informado") {
  const systemPrompt = [
    "Voce extrai itens de despesa de documentos administrativos brasileiros.",
    "Documentos possiveis: CI, Pedido SIAD, ETP, TR, Contratos.",
    "Regra critica: se houver mais de um item, retorne todos sem perder nenhum.",
    "Para cada item, identifique obrigatoriamente finalidade do gasto e objeto da contratacao.",
    "Retorne JSON no formato:",
    "{",
    '  "items": [',
    "    {",
    '      "description": "texto do item",',
    '      "finalidadeGasto": "finalidade do gasto",',
    '      "objetoContratacao": "objeto da contratacao",',
    '      "justification": "trecho resumido que justifica a identificacao"',
    "    }",
    "  ]",
    "}",
    "Sem comentarios fora do JSON."
  ].join("\n");

  const userPrompt = [
    `Tipo de documento informado: ${documentType}`,
    "Texto OCR:",
    ocrText
  ].join("\n\n");

  const data = await chatJson(systemPrompt, userPrompt);
  const items = ensureArray(data?.items)
    .map((item) => ({
      description: String(item?.description || "").trim(),
      finalidadeGasto: String(item?.finalidadeGasto || "").trim(),
      objetoContratacao: String(item?.objetoContratacao || "").trim(),
      justification: String(item?.justification || "").trim()
    }))
    .filter((item) => item.description.length > 0);

  return items;
}

async function ensureEmbeddings(rows, scope, textBuilder) {
  const rowsWithEmbedding = [];

  for (const row of rows) {
    const cached = getCachedEmbedding(scope, row.id);
    if (cached) {
      rowsWithEmbedding.push({ ...row, embedding: cached });
      continue;
    }

    const embedding = await createEmbedding(textBuilder(row));
    saveCachedEmbedding(scope, row.id, embedding);
    rowsWithEmbedding.push({ ...row, embedding });
  }

  return rowsWithEmbedding;
}

function normalizeItemContext(item) {
  return [
    `Descricao do item: ${item.description}`,
    `Finalidade do gasto: ${item.finalidadeGasto || "nao informada"}`,
    `Objeto da contratacao: ${item.objetoContratacao || "nao informado"}`
  ].join("\n");
}

async function rankTable8ForItem(item, table8RowsWithEmbedding) {
  const itemEmbedding = await createEmbedding(normalizeItemContext(item));

  return table8RowsWithEmbedding
    .map((row) => ({
      id: row.id,
      name: row.name,
      interpretation: row.interpretation,
      score: cosineSimilarity(itemEmbedding, row.embedding)
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, config.topKMatches);
}

async function rankCatmasForTable8(item, table8Match) {
  let catmasRows = getCatmasRowsByTable8(table8Match.id);

  if (catmasRows.length === 0) {
    catmasRows = getCatmasRowsByTable8(null);
  }

  if (catmasRows.length === 0) {
    return [];
  }

  const catmasRowsWithEmbedding = await ensureEmbeddings(
    catmasRows,
    "catmas",
    (row) =>
      [
        row.description || "",
        row.detailedDescription || "",
        row.supplyLine || ""
      ]
        .join("\n")
        .trim()
  );

  const itemEmbedding = await createEmbedding(
    [
      normalizeItemContext(item),
      `Classificador/Tabela 8 candidato: ${table8Match.name}`,
      `Interpretacao da Tabela 8: ${table8Match.interpretation}`
    ].join("\n")
  );

  return catmasRowsWithEmbedding
    .map((row) => ({
      id: row.id,
      code: row.code,
      description: row.description,
      detailedDescription: row.detailedDescription,
      supplyLine: row.supplyLine,
      status: row.status,
      score: cosineSimilarity(itemEmbedding, row.embedding)
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, config.topKMatches);
}

async function buildCrossedResults(items, table8RowsWithEmbedding) {
  const results = [];

  for (const item of items) {
    const table8Matches = await rankTable8ForItem(item, table8RowsWithEmbedding);
    const crossedMatches = [];

    for (const table8Match of table8Matches) {
      const catmasMatches = await rankCatmasForTable8(item, table8Match);

      crossedMatches.push({
        ...table8Match,
        catmasMatches,
        crossCheck: {
          finalidadeGasto: item.finalidadeGasto,
          objetoContratacao: item.objetoContratacao,
          catmasStatusFilter: config.catmas.activeOnly ? "ATIVO" : "SEM_FILTRO"
        }
      });
    }

    results.push({
      itemDescription: item.description,
      finalidadeGasto: item.finalidadeGasto,
      objetoContratacao: item.objetoContratacao,
      justification: item.justification,
      matches: crossedMatches
    });
  }

  return results;
}

export async function classifyDocumentByTable8({ ocrText, documentType }) {
  const items = await extractItemsFromDocument(ocrText, documentType);

  if (items.length === 0) {
    return {
      itemsFound: 0,
      results: []
    };
  }

  const table8Rows = getTable8Rows();
  if (table8Rows.length === 0) {
    throw new Error("Tabela 8 sem dados com interpretacao para comparar.");
  }

  const rowsWithEmbedding = await ensureEmbeddings(
    table8Rows,
    "table8",
    (row) => `${row.name || ""}\n${row.interpretation || ""}`.trim()
  );
  const results = await buildCrossedResults(items, rowsWithEmbedding);

  return {
    itemsFound: items.length,
    results: results.map((r, index) => ({
      itemIndex: index + 1,
      itemDescription: r.itemDescription,
      finalidadeGasto: r.finalidadeGasto,
      objetoContratacao: r.objetoContratacao,
      justification: r.justification,
      matches: r.matches
    }))
  };
}
