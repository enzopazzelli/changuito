// Tests de datos del Módulo 1 (Stock, §6 del prompt base) contra una base
// SQLite real en memoria (sql.js), cargando las migraciones reales del
// proyecto (fundación + Stock) — no un esquema sintético — para probar
// exactamente lo que se va a aplicar en producción. Las restricciones
// (CHECK, índices únicos, claves foráneas) ya se prueban más a fondo en
// Rust (migraciones.rs, misma base real que usa la app); acá se prueba
// lo que es lógica de negocio en TS: la transacción de ajuste de stock y
// el cableado de `producto` al motor de Excel.

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { drizzle } from "drizzle-orm/sqlite-proxy";
import initSqlJs, { type Database, type SqlJsStatic } from "sql.js";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { aplicarImportacion, leer, validar } from "../src/nucleo/excel";
import { comercio, producto, usuario } from "../src/nucleo/datos/esquema";
import { columnasProducto } from "../src/nucleo/stock/excel";
import { aplicarAjusteStockConexion } from "../src/nucleo/stock/ajustes";

const ARCHIVOS_MIGRACION = ["0000_fundacion.sql", "0001_respaldos.sql", "0002_modulo_stock.sql"];

function dbDePrueba(sqlJsDb: Database) {
  return drizzle(async (sqlTexto, params, method) => {
    if (method === "run") {
      sqlJsDb.run(sqlTexto, params as never[]);
      return { rows: [] };
    }
    const resultado = sqlJsDb.exec(sqlTexto, params as never[]);
    const filas = resultado[0]?.values ?? [];
    return { rows: method === "get" ? (filas[0] ?? []) : filas };
  });
}

describe("Módulo 1 (Stock) — contra SQLite real (migraciones reales del proyecto)", () => {
  let SQL: SqlJsStatic;
  let sqlJsDb: Database;
  let db: ReturnType<typeof dbDePrueba>;

  beforeAll(async () => {
    SQL = await initSqlJs();
  });

  beforeEach(async () => {
    sqlJsDb = new SQL.Database();
    for (const archivo of ARCHIVOS_MIGRACION) {
      const sql = readFileSync(resolve(__dirname, "../src-tauri/migraciones", archivo), "utf-8");
      sqlJsDb.run(sql);
    }
    db = dbDePrueba(sqlJsDb);

    await db.insert(comercio).values({ id: 1, nombre: "Mini Market Marlyn", rubro: "despensa" });
    await db.insert(usuario).values({ id: 1, nombre: "Dueño", rol: "admin" });
  });

  describe("aplicarAjusteStockConexion", () => {
    it("un ajuste positivo sube el stock y deja auditoría con el usuario y el stock resultante", async () => {
      await db.insert(producto).values({ id: 1, nombre: "Yerba", stockActual: 10 });

      const resultado = await aplicarAjusteStockConexion(db, {
        productoId: 1,
        cantidad: 5,
        motivo: "conteo",
        usuarioId: 1,
      });

      expect(resultado.stockResultante).toBe(15);

      const [prod] = await db.select().from(producto);
      expect(prod.stockActual).toBe(15);

      const auditoria = sqlJsDb.exec("SELECT cantidad, motivo, stock_resultante, usuario_id FROM ajuste_stock");
      expect(auditoria[0].values[0]).toEqual([5, "conteo", 15, 1]);
    });

    it("un ajuste que dejaría el stock negativo no se aplica si el comercio no lo permite", async () => {
      await db.insert(producto).values({ id: 1, nombre: "Yerba", stockActual: 3 });

      await expect(
        aplicarAjusteStockConexion(db, {
          productoId: 1,
          cantidad: -5,
          motivo: "rotura",
          usuarioId: 1,
        }),
      ).rejects.toThrow();

      const [prod] = await db.select().from(producto);
      expect(prod.stockActual).toBe(3);

      const auditoria = sqlJsDb.exec("SELECT COUNT(*) FROM ajuste_stock");
      expect(auditoria[0].values[0][0]).toBe(0);
    });

    it("el mismo ajuste sí se aplica si el comercio permite stock negativo", async () => {
      await db.update(comercio).set({ permiteStockNegativo: true });
      await db.insert(producto).values({ id: 1, nombre: "Yerba", stockActual: 3 });

      const resultado = await aplicarAjusteStockConexion(db, {
        productoId: 1,
        cantidad: -5,
        motivo: "rotura",
        usuarioId: 1,
      });

      expect(resultado.stockResultante).toBe(-2);
    });

    it("un producto pesable acepta un ajuste fraccionario y lo redondea a gramos", async () => {
      await db.insert(producto).values({
        id: 1,
        nombre: "Queso",
        seVendePorPeso: true,
        unidadMedida: "kg",
        stockActual: 1.5,
      });

      const resultado = await aplicarAjusteStockConexion(db, {
        productoId: 1,
        cantidad: 0.1,
        motivo: "conteo",
        usuarioId: 1,
      });

      expect(resultado.stockResultante).toBe(1.6);
    });

    it("un producto inexistente rechaza el ajuste sin dejar rastro", async () => {
      await expect(
        aplicarAjusteStockConexion(db, {
          productoId: 999,
          cantidad: 1,
          motivo: "conteo",
          usuarioId: 1,
        }),
      ).rejects.toThrow();

      const auditoria = sqlJsDb.exec("SELECT COUNT(*) FROM ajuste_stock");
      expect(auditoria[0].values[0][0]).toBe(0);
    });
  });

  describe("producto ↔ motor de Excel", () => {
    function csvProductos(filas: string[]) {
      const encabezado = columnasProducto.map((c) => c.encabezado).join(";");
      return new TextEncoder().encode([encabezado, ...filas].join("\r\n"));
    }

    it("importa un producto nuevo y, al reimportar el mismo código, actualiza en vez de duplicar", async () => {
      // Regresión del bug de importacion.ts: `codigoBarras` es una
      // columna de dos palabras (SQL: codigo_barras) — antes del arreglo,
      // esto nunca encontraba la fila existente y siempre insertaba.
      const primeraCarga = csvProductos(["7791234567890;Yerba;;100;150;10;2;no;si"]);
      const resultado1 = validar(leer(primeraCarga), columnasProducto);
      expect(resultado1.errores).toEqual([]);

      const primera = await aplicarImportacion(db, producto, producto.codigoBarras, resultado1);
      expect(primera).toEqual({ creadas: 1, actualizadas: 0 });

      const segundaCarga = csvProductos(["7791234567890;Yerba (aumento);;110;170;10;2;no;si"]);
      const resultado2 = validar(leer(segundaCarga), columnasProducto);
      const segunda = await aplicarImportacion(db, producto, producto.codigoBarras, resultado2);
      expect(segunda).toEqual({ creadas: 0, actualizadas: 1 });

      const filas = sqlJsDb.exec("SELECT COUNT(*) FROM producto");
      expect(filas[0].values[0][0]).toBe(1);

      const fila = sqlJsDb.exec("SELECT nombre, precio FROM producto WHERE codigo_barras = '7791234567890'");
      expect(fila[0].values[0]).toEqual(["Yerba (aumento)", 170]);
    });

    it("una fila que viola una restricción de la base (costo negativo) no aplica ninguna fila del archivo", async () => {
      const csv = csvProductos([
        "7791111111111;Café;;100;150;5;1;no;si",
        "7792222222222;Té;;-10;150;5;1;no;si", // costo negativo: pasa la validación de Excel, lo rechaza el CHECK de la base
      ]);
      const resultado = validar(leer(csv), columnasProducto);
      expect(resultado.errores).toEqual([]); // el motor de Excel no conoce esta regla de negocio

      await expect(aplicarImportacion(db, producto, producto.codigoBarras, resultado)).rejects.toThrow();

      const filas = sqlJsDb.exec("SELECT COUNT(*) FROM producto");
      expect(filas[0].values[0][0]).toBe(0);
    });
  });
});
