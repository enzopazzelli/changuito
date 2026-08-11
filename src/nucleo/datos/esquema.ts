// Esquema de la fundación (§5.2 del prompt base). Es la fuente de verdad
// para `drizzle-kit generate`: cada cambio acá genera el próximo archivo
// en src-tauri/migraciones/. La primera migración (0000_fundacion.sql)
// se generó a partir de este archivo tal cual está.

import { sql } from "drizzle-orm";
import { check, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const comercio = sqliteTable(
  "comercio",
  {
    id: integer("id").primaryKey(),
    nombre: text("nombre").notNull(),
    rubro: text("rubro").notNull(),
    cuit: text("cuit"),
    fiadoActivo: integer("fiado_activo", { mode: "boolean" }).notNull().default(false),
    ivaIncluido: integer("iva_incluido", { mode: "boolean" }).notNull().default(true),
    redondeo: text("redondeo").notNull().default("sin_redondeo"),
    permiteStockNegativo: integer("permite_stock_negativo", { mode: "boolean" })
      .notNull()
      .default(false),
    vendePorPeso: integer("vende_por_peso", { mode: "boolean" }).notNull().default(false),
    // Vacía = default en Rust (AppData\Roaming\Changuito\respaldos\).
    // Se completa cuando exista la pantalla para apuntarla a Drive/OneDrive.
    carpetaRespaldos: text("carpeta_respaldos"),
  },
  // Regla §10.1: el invariante de "solo puede haber un comercio" vive en
  // un CHECK, no en una consulta previa al insert.
  (tabla) => [check("un_solo_comercio", sql`${tabla.id} = 1`)],
);

export const usuario = sqliteTable("usuario", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  nombre: text("nombre").notNull(),
  rol: text("rol").notNull(),
  activo: integer("activo", { mode: "boolean" }).notNull().default(true),
});
