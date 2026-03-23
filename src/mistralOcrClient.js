import { config } from "./config.js";

const DIRECT_MISTRAL_OCR_ENDPOINT = "https://api.mistral.ai/v1/ocr";

function isAzureLikeEndpoint(value) {
  return /azure\.com|azure\.ai/i.test(String(value || ""));
}

function normalizeMistralEndpoint(value) {
  const raw = String(value || "").trim();
  if (!raw) {
    return DIRECT_MISTRAL_OCR_ENDPOINT;
  }

  try {
    const parsed = new URL(raw);

    if (/mistral\.ai$/i.test(parsed.hostname) || /(^|\.)mistral\.ai$/i.test(parsed.hostname)) {
      parsed.pathname = "/v1/ocr";
      parsed.searchParams.delete("api-version");
      return parsed.toString();
    }

    return raw;
  } catch {
    return raw;
  }
}

function isApiVersionError(status, errorText) {
  const text = String(errorText || "");
  return (
    status === 400 &&
    (/api version not supported/i.test(text) || /missing required query parameter:\s*api-version/i.test(text))
  );
}

function getCandidateEndpoints() {
  const normalized = normalizeMistralEndpoint(config.mistral.ocrEndpoint);
  const candidates = [normalized];

  if (isAzureLikeEndpoint(normalized) || /api-version=/i.test(normalized)) {
    candidates.push(DIRECT_MISTRAL_OCR_ENDPOINT);
  }

  return [...new Set(candidates)];
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

  const payload = {
    model: config.mistral.documentModel,
    document: {
      type: "document_url",
      document_url: dataUrl
    },
    include_image_base64: false
  };

  let lastError = null;
  for (const endpoint of getCandidateEndpoints()) {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${config.mistral.apiKey}`
      },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      const errorText = await response.text();
      if (isApiVersionError(response.status, errorText)) {
        lastError = new Error(`Mistral OCR erro (${response.status}): ${errorText}`);
        continue;
      }

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

  throw new Error(
    `${lastError?.message || "Falha ao chamar OCR da Mistral."} Verifique MISTRAL_OCR_ENDPOINT e use ${DIRECT_MISTRAL_OCR_ENDPOINT}.`
  );
}
