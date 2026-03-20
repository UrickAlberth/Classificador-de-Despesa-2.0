import app from "./app.js";
import { config } from "./config.js";
import { closeDb } from "./database.js";

const server = app.listen(config.port, () => {
  console.log(`Servidor iniciado em http://localhost:${config.port}`);
});

process.on("SIGINT", () => {
  closeDb();
  server.close(() => process.exit(0));
});

process.on("SIGTERM", () => {
  closeDb();
  server.close(() => process.exit(0));
});
