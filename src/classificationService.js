import { chatJson, createEmbedding } from "./azureOpenAIClient.js";
import { config } from "./config.js";
import { getCachedEmbedding, getTable8Rows, saveCachedEmbedding } from "./database.js";
import { cosineSimilarity, ensureArray } from "./utils.js";

async function extractItemsFromDocument(ocrText, documentType = "Nao informado") {
  const systemPrompt = [
    "Voce extrai itens de despesa de documentos administrativos brasileiros.",
    "Documentos possiveis: CI, Pedido SIAD, ETP, TR, Contratos.",
    "Regra critica: se houver mais de um item, retorne todos sem perder nenhum.",
    "Retorne JSON no formato:",
    "{",
    '  "items": [',
    "    {",
    '      "description": "texto do item",',
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
      justification: String(item?.justification || "").trim()
    }))
    .filter((item) => item.description.length > 0);

  return items;
}

async function ensureTable8Embeddings(table8Rows) {
  const rowsWithEmbedding = [];

  for (const row of table8Rows) {
    const cached = getCachedEmbedding(row.id);
    if (cached) {
      rowsWithEmbedding.push({ ...row, embedding: cached });
      continue;
    }

    const embedding = await createEmbedding(row.interpretation);
    saveCachedEmbedding(row.id, embedding);
    rowsWithEmbedding.push({ ...row, embedding });
  }

  return rowsWithEmbedding;
}

async function rankMatchesByInterpretation(items, rowsWithEmbedding) {
  const results = [];

  for (const item of items) {
    const itemEmbedding = await createEmbedding(item.description);

    const scored = rowsWithEmbedding
      .map((row) => ({
        id: row.id,
        name: row.name,
        interpretation: row.interpretation,
        score: cosineSimilarity(itemEmbedding, row.embedding)
      }))
      .sort((a, b) => b.score - a.score)
      .slice(0, config.topKMatches);

    results.push({
      itemDescription: item.description,
      justification: item.justification,
      matches: scored
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

  const rowsWithEmbedding = await ensureTable8Embeddings(table8Rows);
  const results = await rankMatchesByInterpretation(items, rowsWithEmbedding);

  return {
    itemsFound: items.length,
    results: results.map((r, index) => ({
      itemIndex: index + 1,
      itemDescription: r.itemDescription,
      justification: r.justification,
      matches: r.matches
    }))
  };
}
