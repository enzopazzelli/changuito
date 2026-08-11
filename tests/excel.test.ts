// Tests del motor genérico de Excel (§5.5 del prompt base), mapeados
// 1 a 1 contra los que pide la spec. Las pruebas de "todo o nada" y
// "actualiza por código" corren contra una base SQLite real en memoria
// (sql.js, sin compilación nativa) para probar la transacción de
// verdad, no un mock que podría estar mintiendo sobre el rollback.
// Todo corre contra una tabla sintética: no depende de que exista
// ningún módulo de negocio real (Stock todavía no se construyó).

import { eq } from "drizzle-orm";
import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { drizzle } from "drizzle-orm/sqlite-proxy";
import initSqlJs, { type Database, type SqlJsStatic } from "sql.js";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  aplicarImportacion,
  exportarCsv,
  exportarXlsx,
  leer,
  validar,
  type ColumnaExcel,
} from "../src/nucleo/excel";

const productoSintetico = sqliteTable("producto_sintetico", {
  codigo: text("codigo").primaryKey(),
  nombre: text("nombre").notNull(),
  precio: integer("precio").notNull(),
});

const columnas: ColumnaExcel[] = [
  { clave: "codigo", encabezado: "Código", tipo: "texto", requerido: true },
  { clave: "nombre", encabezado: "Nombre", tipo: "texto", requerido: true },
  { clave: "precio", encabezado: "Precio", tipo: "entero", requerido: true },
];

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

describe("motor de excel — formato (sin base de datos)", () => {
  it("exportar e importar el mismo listado (xlsx) devuelve los mismos datos, con acentos y ñ", async () => {
    const filas = [
      { codigo: "A1", nombre: "Yerba mate Doña Rosa (500g)", precio: 4500 },
      { codigo: "Ñ2", nombre: "Café Ñuñoa", precio: 3200 },
    ];

    const bytes = await exportarXlsx(filas, columnas);
    const { validas, errores } = validar(leer(bytes), columnas);

    expect(errores).toEqual([]);
    expect(validas.map((f) => f.valores)).toEqual(filas);
  });

  it("exportar e importar el mismo listado (csv) devuelve los mismos datos, con acentos y ñ", () => {
    const filas = [
      { codigo: "A1", nombre: "Yerba mate Doña Rosa (500g)", precio: 4500 },
      { codigo: "Ñ2", nombre: "Café Ñuñoa", precio: 3200 },
    ];

    const bytes = exportarCsv(filas, columnas);
    const { validas, errores } = validar(leer(bytes), columnas);

    expect(errores).toEqual([]);
    expect(validas.map((f) => f.valores)).toEqual(filas);
  });

  it("un texto que empieza con = sale escapado en xlsx", async () => {
    const filas = [{ codigo: "A1", nombre: "=SUMA(A1:A2)", precio: 100 }];
    const bytes = await exportarXlsx(filas, columnas);
    const crudas = leer(bytes);
    expect(crudas[0].valores["nombre"]).toBe("'=SUMA(A1:A2)");
  });

  it("un texto que empieza con = sale escapado en csv", () => {
    const filas = [{ codigo: "A1", nombre: "=SUMA(A1:A2)", precio: 100 }];
    const bytes = exportarCsv(filas, columnas);
    const texto = new TextDecoder("utf-8").decode(bytes);
    expect(texto).toContain("'=SUMA(A1:A2)");
  });

  it("tolera columnas de más, en otro orden, y filas vacías intercaladas", () => {
    const csv = [
      "Observaciones;Precio;Nombre;Código",
      "-;100;Yerba;A1",
      "",
      "-;200;Café;A2",
    ].join("\r\n");

    const crudas = leer(new TextEncoder().encode(csv));
    const { validas, errores } = validar(crudas, columnas);

    expect(errores).toEqual([]);
    expect(validas.map((f) => f.valores)).toEqual([
      { codigo: "A1", nombre: "Yerba", precio: 100 },
      { codigo: "A2", nombre: "Café", precio: 200 },
    ]);
  });

  it("un archivo que no es una planilla da un error claro", () => {
    const bytes = new Uint8Array([0x00, 0x01, 0x02, 0xff, 0xfe, 0x10, 0x20, 0x30]);
    expect(() => leer(bytes)).toThrow();
  });
});

describe("motor de excel — aplicar importación (SQLite real en memoria)", () => {
  let SQL: SqlJsStatic;
  let sqlJsDb: Database;

  beforeAll(async () => {
    SQL = await initSqlJs();
  });

  beforeEach(() => {
    sqlJsDb = new SQL.Database();
    sqlJsDb.run(
      "CREATE TABLE producto_sintetico (codigo TEXT PRIMARY KEY, nombre TEXT NOT NULL, precio INTEGER NOT NULL)",
    );
  });

  it("una fila inválida no aplica ninguna fila (ni las válidas del mismo archivo)", async () => {
    const db = dbDePrueba(sqlJsDb);
    const csv = ["Código;Nombre;Precio", "A1;Yerba;100", "A2;Café;no-es-un-numero"].join("\r\n");
    const resultado = validar(leer(new TextEncoder().encode(csv)), columnas);

    expect(resultado.errores.length).toBeGreaterThan(0);
    await expect(
      aplicarImportacion(db, productoSintetico, productoSintetico.codigo, resultado),
    ).rejects.toThrow();

    const filas = sqlJsDb.exec("SELECT * FROM producto_sintetico");
    expect(filas).toEqual([]);
  });

  it("importar el mismo archivo dos veces no duplica: actualiza", async () => {
    const db = dbDePrueba(sqlJsDb);
    const csv = ["Código;Nombre;Precio", "A1;Yerba;100"].join("\r\n");
    const resultado = validar(leer(new TextEncoder().encode(csv)), columnas);

    const primera = await aplicarImportacion(
      db,
      productoSintetico,
      productoSintetico.codigo,
      resultado,
    );
    expect(primera).toEqual({ creadas: 1, actualizadas: 0 });

    const segunda = await aplicarImportacion(
      db,
      productoSintetico,
      productoSintetico.codigo,
      resultado,
    );
    expect(segunda).toEqual({ creadas: 0, actualizadas: 1 });

    const total = sqlJsDb.exec("SELECT COUNT(*) FROM producto_sintetico");
    expect(total[0].values[0][0]).toBe(1);

    const fila = sqlJsDb.exec("SELECT nombre FROM producto_sintetico WHERE codigo = 'A1'");
    expect(fila[0].values[0][0]).toBe("Yerba");
  });

  it("actualizar de verdad por código: un segundo import con datos distintos pisa la fila", async () => {
    const db = dbDePrueba(sqlJsDb);
    const primerCsv = ["Código;Nombre;Precio", "A1;Yerba;100"].join("\r\n");
    await aplicarImportacion(
      db,
      productoSintetico,
      productoSintetico.codigo,
      validar(leer(new TextEncoder().encode(primerCsv)), columnas),
    );

    const segundoCsv = ["Código;Nombre;Precio", "A1;Yerba (aumento);150"].join("\r\n");
    await aplicarImportacion(
      db,
      productoSintetico,
      productoSintetico.codigo,
      validar(leer(new TextEncoder().encode(segundoCsv)), columnas),
    );

    const fila = sqlJsDb.exec("SELECT nombre, precio FROM producto_sintetico WHERE codigo = 'A1'");
    expect(fila[0].values[0]).toEqual(["Yerba (aumento)", 150]);
  });
});
