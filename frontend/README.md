# Front-end do Classificador

Interface web pronta para uso com o backend em Node.js.

## Abrir a interface

Abra o arquivo `frontend/index.html` no navegador.

## Deploy na Vercel (frontend separado)

1. Crie um projeto na Vercel usando a pasta `frontend` como Root Directory.
2. Em Environment Variables, configure:

`FRONTEND_BACKEND_API_URL=https://seu-backend.vercel.app/api/process-document`

3. Publique o projeto (site estatico).
4. O campo "Endpoint da API" sera preenchido automaticamente.

Se quiser, voce ainda pode alterar manualmente na tela para testar outro endpoint.

Exemplo de endpoint esperado:

`https://seu-backend.vercel.app/api/process-document`

Essa URL fica salva automaticamente no navegador.

## Fluxo

1. Defina o endpoint da API (padrao: `http://localhost:3000/api/process-document`).
2. Selecione o tipo de documento.
3. Anexe o arquivo (CI, Pedido SIAD, ETP, TR ou Contrato).
4. Clique em "Processar com IA".

A tela mostra:
- resumo da analise
- todos os itens encontrados no documento
- matches da Tabela 8 com score
- JSON completo para auditoria
