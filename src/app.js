import express from "express";
import multer from "multer";
import { runOcr } from "./mistralOcrClient.js";
import { classifyDocumentByTable8 } from "./classificationService.js";

const app = express();
const upload = multer({ storage: multer.memoryStorage() });

// Permite front-end em dominio separado na Vercel.
app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.header("Access-Control-Allow-Headers", "Content-Type,Authorization,api-key");

  if (req.method === "OPTIONS") {
    return res.status(204).end();
  }

  return next();
});

app.get("/health", (_req, res) => {
  res.json({ status: "ok" });
});

app.post("/api/process-document", upload.single("document"), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: "Arquivo obrigatorio no campo 'document'." });
    }

    const documentType = (req.body?.documentType || "Nao informado").trim();

    const ocr = await runOcr({
      buffer: req.file.buffer,
      originalName: req.file.originalname
    });

    const classification = await classifyDocumentByTable8({
      ocrText: ocr.text,
      documentType
    });

    return res.json({
      fileName: req.file.originalname,
      documentType,
      itemsFound: classification.itemsFound,
      results: classification.results
    });
  } catch (error) {
    return res.status(500).json({
      error: "Falha ao processar documento.",
      details: error instanceof Error ? error.message : String(error)
    });
  }
});

export default app;
