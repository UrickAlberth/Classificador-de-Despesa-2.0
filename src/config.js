import dotenv from "dotenv";

dotenv.config();

function required(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Variavel obrigatoria ausente: ${name}`);
  }
  return value;
}

export const config = {
  port: Number(process.env.PORT || 3000),
  dbPath: process.env.DB_PATH || "./DadosTabelas.db",
  table8: {
    tableName: process.env.TABLE8_NAME || "elemento_item_despesa",
    idColumn: process.env.TABLE8_ID_COLUMN || "cd_elemento_item",
    nameColumn: process.env.TABLE8_NAME_COLUMN || "denominacao_item_despesa",
    interpretationColumn: process.env.TABLE8_INTERPRETATION_COLUMN || "interpretacao"
  },
  azure: {
    endpoint: process.env.AZURE_ENDPOINT || process.env.AZURE_OPENAI_ENDPOINT,
    apiKey: process.env.AZURE_API_KEY || process.env.AZURE_OPENAI_API_KEY,
    apiVersion: process.env.AZURE_OPENAI_API_VERSION || "2024-12-01-preview",
    chatDeployment: required("AZURE_OPENAI_CHAT_DEPLOYMENT"),
    embeddingDeployment: required("AZURE_OPENAI_EMBEDDING_DEPLOYMENT")
  },
  mistral: {
    apiKey: process.env.MISTRAL_API_KEY || process.env.AZURE_API_KEY || process.env.AZURE_OPENAI_API_KEY,
    authMode: process.env.AZURE_OCR_AUTH_MODE || process.env.MISTRAL_AUTH_MODE || "bearer",
    baseUrl:
      process.env.AZURE_OCR_BASE_URL ||
      process.env.AZURE_ENDPOINT ||
      process.env.AZURE_OPENAI_ENDPOINT ||
      process.env.MISTRAL_BASE_URL ||
      "https://api.mistral.ai/v1",
    ocrModel: process.env.AZURE_OCR_MODEL || process.env.MISTRAL_OCR_MODEL || "mistral-document-ai-2512"
  },
  topKMatches: Number(process.env.TOP_K_MATCHES || 5)
};

if (!config.azure.endpoint) {
  throw new Error("Variavel obrigatoria ausente: AZURE_ENDPOINT (ou AZURE_OPENAI_ENDPOINT)");
}

if (!config.azure.apiKey) {
  throw new Error("Variavel obrigatoria ausente: AZURE_API_KEY (ou AZURE_OPENAI_API_KEY)");
}

if (!config.mistral.apiKey) {
  throw new Error("Variavel obrigatoria ausente: AZURE_API_KEY (ou AZURE_OPENAI_API_KEY ou MISTRAL_API_KEY)");
}
