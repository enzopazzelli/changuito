// Esquema de la fundación (§5.2 del prompt base). Es la fuente de verdad
// para `drizzle-kit generate`: cada cambio acá genera el próximo archivo
// en src-tauri/migraciones/. La primera migración (0000_fundacion.sql)
// se generó a partir de este archivo tal cual está.

import { sql } from "drizzle-orm";
import { check, index, integer, real, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

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

// Esquema del Módulo 1 (Stock, §6 del prompt base).

export const categoria = sqliteTable(
  "categoria",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    nombre: text("nombre").notNull(),
    activa: integer("activa", { mode: "boolean" }).notNull().default(true),
  },
  (tabla) => [uniqueIndex("categoria_nombre_unico").on(tabla.nombre)],
);

export const producto = sqliteTable(
  "producto",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    categoriaId: integer("categoria_id").references(() => categoria.id),
    nombre: text("nombre").notNull(),
    codigoBarras: text("codigo_barras"),
    // PLU de balanza u otro código propio, para productos sin código de
    // fábrica (típicamente los que se venden por peso).
    codigoInterno: text("codigo_interno"),
    seVendePorPeso: integer("se_vende_por_peso", { mode: "boolean" }).notNull().default(false),
    unidadMedida: text("unidad_medida").notNull().default("unidad"),
    costo: real("costo").notNull().default(0),
    precio: real("precio").notNull().default(0),
    stockActual: real("stock_actual").notNull().default(0),
    stockMinimo: real("stock_minimo").notNull().default(0),
    activo: integer("activo", { mode: "boolean" }).notNull().default(true),
  },
  (tabla) => [
    // Índices únicos parciales: permiten cualquier cantidad de productos
    // sin código (NULL), pero rechazan un código repetido entre los que
    // sí lo tienen.
    uniqueIndex("producto_codigo_barras_unico")
      .on(tabla.codigoBarras)
      .where(sql`${tabla.codigoBarras} is not null`),
    uniqueIndex("producto_codigo_interno_unico")
      .on(tabla.codigoInterno)
      .where(sql`${tabla.codigoInterno} is not null`),
    check("producto_unidad_medida_valida", sql`${tabla.unidadMedida} in ('unidad', 'kg')`),
    check("producto_costo_no_negativo", sql`${tabla.costo} >= 0`),
    check("producto_precio_no_negativo", sql`${tabla.precio} >= 0`),
    check("producto_stock_minimo_no_negativo", sql`${tabla.stockMinimo} >= 0`),
    // Regla §10.2: la barrera real de "no vende por peso => stock entero"
    // vive acá, no solo en la UI.
    check(
      "producto_stock_entero_si_no_es_por_peso",
      sql`${tabla.seVendePorPeso} = true or ${tabla.stockActual} = cast(${tabla.stockActual} as integer)`,
    ),
  ],
);

export const ajusteStock = sqliteTable(
  "ajuste_stock",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    productoId: integer("producto_id")
      .notNull()
      .references(() => producto.id),
    // Delta: positivo suma, negativo resta. Nunca el valor absoluto.
    cantidad: real("cantidad").notNull(),
    motivo: text("motivo").notNull(),
    // Obligatorio en la UI cuando motivo = 'otro'; acá queda libre porque
    // la base no puede exigir un campo condicional a otro con un CHECK
    // legible.
    detalle: text("detalle"),
    // Snapshot del stock después de aplicar este ajuste: deja la
    // auditoría autocontenida, sin depender de recalcular la suma de
    // todos los ajustes anteriores para saber qué pasó en cada momento.
    stockResultante: real("stock_resultante").notNull(),
    usuarioId: integer("usuario_id")
      .notNull()
      .references(() => usuario.id),
    creadoEn: text("creado_en")
      .notNull()
      .default(sql`(datetime('now'))`),
  },
  (tabla) => [
    check("ajuste_stock_cantidad_no_cero", sql`${tabla.cantidad} != 0`),
    check("ajuste_stock_motivo_valido", sql`${tabla.motivo} in ('rotura', 'vencido', 'conteo', 'otro')`),
    index("ajuste_stock_producto_fecha").on(tabla.productoId, tabla.creadoEn),
  ],
);
