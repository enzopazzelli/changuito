import { defineConfig } from "drizzle-kit";

export default defineConfig({
  dialect: "sqlite",
  schema: "./src/nucleo/datos/esquema.ts",
  out: "./src-tauri/migraciones",
});
