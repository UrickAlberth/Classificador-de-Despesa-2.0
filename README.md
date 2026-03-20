# Classificador de Despesa com IA

Sistema para importar documentos administrativos (CI, Pedido SIAD, ETP, TR e Contratos), extrair todos os itens com OCR e IA, e classificar cada item com cruzamento obrigatorio entre Tabela 8 e CATMAS/SIAD.

## Arquitetura

1. Upload de arquivo (`pdf`, `png`, `jpg`, `jpeg`, `tiff`, `bmp`, `webp`).
2. OCR com `mistral-document-ai-2512`.
3. Extracao de todos os itens de despesa com Azure OpenAI `gpt-4.1-mini`.
4. Busca semantica na Tabela 8 do SQLite usando embeddings de `interpretacao`.
5. Cruzamento obrigatorio com CATMAS/SIAD, incluindo linha de fornecimento e situacao do item (Ativo/Suspenso).
6. Retorno com lista de itens e melhores correspondencias.

## Requisitos

- Node.js 18+
- Chave Azure OpenAI
- Endpoint e chave Azure API (os mesmos podem ser usados para GPT e OCR)
- Banco SQLite com os dados transformados das planilhas

## Configuracao

1. Instale dependencias:

```bash
npm install
```

2. Copie `.env.example` para `.env` e preencha as chaves.
3. Para OCR Mistral no Azure, use:

```dotenv
AZURE_ENDPOINT=https://SEU-RECURSO.azure.com
AZURE_OCR_AUTH_MODE=api-key
AZURE_OCR_MODEL=mistral-document-ai-2512
# MISTRAL_API_KEY opcional: se nao informar, usa AZURE_API_KEY
# AZURE_OCR_BASE_URL opcional: se nao informar, usa AZURE_ENDPOINT
```

Observacao: o codigo ainda aceita variaveis antigas (`AZURE_OPENAI_API_KEY` e `MISTRAL_*`) para compatibilidade.

4. Ajuste `TABLE8_*` caso sua Tabela 8 tenha nome/colunas diferentes.
5. Configure o CATMAS/SIAD no `.env` (`CATMAS_*`).

Exemplo validado para `catma.db` (schema real):

```dotenv
CATMAS_TABLES=materiais,servicos
CATMAS_ID_COLUMN=id
CATMAS_CODE_COLUMN=codigo
CATMAS_DESCRIPTION_COLUMN=descricao
CATMAS_DETAILED_DESCRIPTION_COLUMN=descricao_item
CATMAS_STATUS_COLUMN=situacao
CATMAS_SUPPLY_LINE_COLUMN=grupo
CATMAS_SUPPLY_SUBLINE_COLUMN=classe
CATMAS_TABLE8_LINK_COLUMN=natureza
CATMAS_ACTIVE_ONLY=true
```

## Executar

```bash
npm start
```

Servidor sobe em `http://localhost:3000`.

## Deploy separado na Vercel

### Backend (raiz do projeto)

1. Crie um projeto na Vercel apontando para a raiz deste repositorio.
2. Configure as variaveis de ambiente com os mesmos nomes do `.env`.
3. Funcoes serverless disponiveis:
  - `POST /api/process-document`
  - `GET /health`

Observacao: o backend foi adaptado para copiar o SQLite para `/tmp` na Vercel.

### Frontend (pasta `frontend`)

1. Crie outro projeto na Vercel apontando o Root Directory para `frontend`.
2. Abra o front publicado e informe no campo "Endpoint da API" a URL do backend:
  - Exemplo: `https://seu-backend.vercel.app/api/process-document`
3. O front salva essa URL no navegador para os proximos envios.

## Endpoint principal

### `POST /api/process-document`

`multipart/form-data`:
- `document` (arquivo)
- `documentType` (opcional: `CI`, `Pedido SIAD`, `ETP`, `TR`, `Contrato`)

Exemplo com curl:

```bash
curl -X POST "http://localhost:3000/api/process-document" \
  -F "document=@./Proposta_de_Utilizacao_de_inteligencia_Artificial__CEOR__04_03_2026.pdf" \
  -F "documentType=TR"
```

Resposta (resumo):

```json
{
  "fileName": "arquivo.pdf",
  "documentType": "TR",
  "itemsFound": 3,
  "results": [
    {
      "itemIndex": 1,
      "itemDescription": "...",
      "justification": "...",
      "matches": [
        {
          "id": 3011,
          "name": "MATERIAL ODONTOLOGICO",
          "interpretation": "...",
          "score": 0.91
        }
      ]
    }
  ]
}
```

## Observacoes importantes

- O sistema lista todos os itens detectados no documento (nao apenas um).
- A comparacao principal e feita sobre `interpretacao` da Tabela 8.
- O cruzamento com CATMAS/SIAD e obrigatorio na resposta do classificador.
- O backend valida automaticamente o schema CATMAS configurado e interrompe com erro claro se houver coluna/tabela invalida.
- O cache de embeddings usa a tabela `embedding_cache` no mesmo banco.
