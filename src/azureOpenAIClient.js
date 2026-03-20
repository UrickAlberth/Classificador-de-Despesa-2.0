import { config } from "./config.js";

async function azurePost(path, body) {
  const url = `${config.azure.endpoint}${path}`;

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "api-key": config.azure.apiKey
    },
    body: JSON.stringify(body)
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Azure OpenAI erro (${response.status}): ${errorText}`);
  }

  return response.json();
}

export async function chatJson(systemPrompt, userPrompt) {
  const path = `/openai/deployments/${config.azure.chatDeployment}/chat/completions?api-version=${config.azure.apiVersion}`;

  const payload = {
    temperature: 0,
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt }
    ]
  };

  const data = await azurePost(path, payload);
  const content = data?.choices?.[0]?.message?.content;

  if (!content) {
    throw new Error("Azure OpenAI nao retornou conteudo no chat completion.");
  }

  return JSON.parse(content);
}

export async function createEmbedding(text) {
  const path = `/openai/deployments/${config.azure.embeddingDeployment}/embeddings?api-version=${config.azure.apiVersion}`;

  const payload = { input: text };
  const data = await azurePost(path, payload);
  const embedding = data?.data?.[0]?.embedding;

  if (!embedding) {
    throw new Error("Azure OpenAI nao retornou embedding.");
  }

  return embedding;
}
