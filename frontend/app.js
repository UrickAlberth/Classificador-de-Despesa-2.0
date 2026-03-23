const form = document.getElementById("processForm");
const submitButton = document.getElementById("submitButton");
const copyJsonButton = document.getElementById("copyJsonButton");
const statusEl = document.getElementById("status");
const summaryEl = document.getElementById("summary");
const resultsListEl = document.getElementById("resultsList");
const rawJsonEl = document.getElementById("rawJson");

const itemTemplate = document.getElementById("itemTemplate");
const matchTemplate = document.getElementById("matchTemplate");

let latestResponse = null;

async function parseApiResponse(response) {
  const contentType = String(response.headers.get("content-type") || "").toLowerCase();

  if (contentType.includes("application/json")) {
    try {
      return {
        payload: await response.json(),
        rawText: ""
      };
    } catch {
      // Continua para fallback de texto abaixo.
    }
  }

  const rawText = await response.text();

  try {
    return {
      payload: JSON.parse(rawText),
      rawText
    };
  } catch {
    return {
      payload: null,
      rawText
    };
  }
}

function buildNonJsonResponseMessage(apiUrl, response, rawText) {
  const condensed = String(rawText || "").replace(/\s+/g, " ").trim();
  const sample = condensed.slice(0, 140);
  const looksLikeHtml =
    condensed.includes("<html") ||
    condensed.includes("<!doctype") ||
    condensed.toLowerCase().includes("the page could not be found");

  if (looksLikeHtml) {
    return `O endpoint retornou uma pagina HTML (HTTP ${response.status}) em vez de JSON. Verifique se a URL esta correta e termina com /api/process-document. URL atual: ${apiUrl}`;
  }

  return `A resposta da API nao veio em JSON (HTTP ${response.status}). Trecho retornado: ${sample || "(vazio)"}`;
}

const savedApiUrl = localStorage.getItem("classificador.apiUrl");
if (savedApiUrl) {
  form.apiUrl.value = savedApiUrl;
}

async function bootstrapApiUrl() {
  if (savedApiUrl) {
    return;
  }

  try {
    const response = await fetch("/api/config", { method: "GET" });
    if (!response.ok) {
      return;
    }

    const { payload } = await parseApiResponse(response);
    if (!payload) {
      return;
    }

    const backendApiUrl = String(payload?.backendApiUrl || "").trim();

    if (backendApiUrl) {
      form.apiUrl.value = backendApiUrl;
      localStorage.setItem("classificador.apiUrl", backendApiUrl);
      setStatus("Endpoint da API preenchido automaticamente pela configuracao da Vercel.");
    }
  } catch {
    // Ignora: ambiente local pode nao ter /api/config.
  }
}

bootstrapApiUrl();

function setStatus(message, isError = false) {
  statusEl.textContent = message;
  statusEl.classList.toggle("error", isError);
}

function clearResults() {
  resultsListEl.innerHTML = "";
  summaryEl.classList.add("hidden");
  rawJsonEl.classList.add("hidden");
  rawJsonEl.textContent = "";
  copyJsonButton.disabled = true;
  latestResponse = null;
}

function toPercent(score) {
  const n = Number(score);
  if (Number.isNaN(n)) return "-";
  return `${(n * 100).toFixed(2)}%`;
}

function renderResults(payload) {
  clearResults();

  latestResponse = payload;
  copyJsonButton.disabled = false;

  summaryEl.classList.remove("hidden");
  summaryEl.textContent = `Arquivo: ${payload.fileName || "-"} | Tipo: ${
    payload.documentType || "Nao informado"
  } | Itens encontrados: ${payload.itemsFound ?? 0}`;

  const results = Array.isArray(payload.results) ? payload.results : [];

  if (results.length === 0) {
    const empty = document.createElement("p");
    empty.textContent = "Nenhum item de despesa foi identificado no documento.";
    resultsListEl.appendChild(empty);
  }

  for (const item of results) {
    const itemNode = itemTemplate.content.firstElementChild.cloneNode(true);

    itemNode.querySelector(".item-index").textContent = `Item #${item.itemIndex}`;
    itemNode.querySelector(".item-title").textContent = item.itemDescription || "Sem descricao";
    itemNode.querySelector(".item-justification").textContent =
      item.justification || "Sem justificativa retornada.";

    const matchesContainer = itemNode.querySelector(".matches");
    const matches = Array.isArray(item.matches) ? item.matches : [];

    if (matches.length === 0) {
      const noMatch = document.createElement("p");
      noMatch.textContent = "Sem correspondencias para este item.";
      matchesContainer.appendChild(noMatch);
    }

    for (const match of matches) {
      const matchNode = matchTemplate.content.firstElementChild.cloneNode(true);
      matchNode.querySelector(".match-name").textContent = match.name || "Sem nome";
      matchNode.querySelector(".match-id").textContent = `ID: ${match.id}`;
      matchNode.querySelector(".match-score").textContent = toPercent(match.score);
      matchesContainer.appendChild(matchNode);
    }

    resultsListEl.appendChild(itemNode);
  }

  rawJsonEl.classList.remove("hidden");
  rawJsonEl.textContent = JSON.stringify(payload, null, 2);
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  clearResults();

  const apiUrl = form.apiUrl.value.trim();
  const documentType = form.documentType.value.trim();
  const file = form.document.files?.[0];

  if (!apiUrl) {
    setStatus("Informe o endpoint da API.", true);
    return;
  }

  if (!/\/api\/process-document\/?(\?.*)?$/i.test(apiUrl)) {
    setStatus("Dica: normalmente a URL deve terminar com /api/process-document.");
  }

  if (!file) {
    setStatus("Selecione um arquivo para processar.", true);
    return;
  }

  const formData = new FormData();
  formData.append("document", file);
  if (documentType) {
    formData.append("documentType", documentType);
  }

  localStorage.setItem("classificador.apiUrl", apiUrl);

  try {
    submitButton.disabled = true;
    setStatus("Enviando arquivo e processando OCR + IA...");

    const response = await fetch(apiUrl, {
      method: "POST",
      body: formData
    });

    const { payload, rawText } = await parseApiResponse(response);

    if (!response.ok) {
      throw new Error(
        payload?.details ||
          payload?.error ||
          buildNonJsonResponseMessage(apiUrl, response, rawText)
      );
    }

    if (!payload) {
      throw new Error(buildNonJsonResponseMessage(apiUrl, response, rawText));
    }

    renderResults(payload);
    setStatus("Processamento concluido com sucesso.");
  } catch (error) {
    setStatus(`Erro: ${error.message || String(error)}`, true);
  } finally {
    submitButton.disabled = false;
  }
});

copyJsonButton.addEventListener("click", async () => {
  if (!latestResponse) return;
  try {
    await navigator.clipboard.writeText(JSON.stringify(latestResponse, null, 2));
    setStatus("JSON copiado para a area de transferencia.");
  } catch {
    setStatus("Nao foi possivel copiar o JSON.", true);
  }
});
