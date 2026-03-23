import { config } from "./config.js";

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

  const payload = {
    model: config.mistral.documentModel,
    document: {
      type: "document_url",
      document_url: dataUrl
    },
    include_image_base64: false
  };

  const response = await fetch(config.mistral.ocrEndpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${config.mistral.apiKey}`
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
