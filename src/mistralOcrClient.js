import { config } from "./config.js";

function buildOcrUrl() {
  const base = String(config.mistral.baseUrl || "").replace(/\/+$/, "");
  const endpoint = `${base}/ocr`;

  const isAzureEndpoint = /azure\.com|azure\.ai/i.test(base);
  if (!isAzureEndpoint) {
    return endpoint;
  }

  const apiVersion = String(config.mistral.apiVersion || "").trim();
  if (!apiVersion) {
    return endpoint;
  }

  const separator = endpoint.includes("?") ? "&" : "?";
  return `${endpoint}${separator}api-version=${encodeURIComponent(apiVersion)}`;
}

function getMimeType(fileName) {
  const lower = fileName.toLowerCase();
  if (lower.endsWith(".pdf")) return "application/pdf";
  if (lower.endsWith(".png")) return "image/png";
  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg";
  if (lower.endsWith(".tiff") || lower.endsWith(".tif")) return "image/tiff";
  if (lower.endsWith(".bmp")) return "image/bmp";
  if (lower.endsWith(".webp")) return "image/webp";
  return "application/octet-stream";
}

export async function runOcr({ buffer, originalName }) {
  const dataUrl = `data:${getMimeType(originalName)};base64,${buffer.toString("base64")}`;
  const url = buildOcrUrl();

  const authHeaders =
    String(config.mistral.authMode).toLowerCase() === "api-key"
      ? { "api-key": config.mistral.apiKey }
      : { Authorization: `Bearer ${config.mistral.apiKey}` };

  const payload = {
    model: config.mistral.ocrModel,
    document: {
      type: "document_url",
      document_url: dataUrl
    },
    include_image_base64: false
  };

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...authHeaders
    },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Mistral OCR erro (${response.status}): ${errorText}`);
  }

  const data = await response.json();
  const pages = Array.isArray(data?.pages) ? data.pages : [];

  const text = pages
    .map((p) => p?.markdown || p?.text || "")
    .filter(Boolean)
    .join("\n\n");

  if (!text.trim()) {
    throw new Error("OCR concluido, mas nenhum texto foi extraido do documento.");
  }

  return {
    text,
    raw: data
  };
}
