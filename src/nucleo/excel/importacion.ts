// Aplica una importación ya validada, genérica sobre cualquier tabla de
// Drizzle: actualiza por código en vez de duplicar. "Todo o nada" en dos
// capas: rechaza de entrada si la validación previa encontró algún
// error (ni las filas válidas del mismo archivo se aplican), y además
// todo el ciclo insertar/actualizar corre dentro de una transacción por
// si algo falla recién al escribir (una restricción de la base, por
// ejemplo).
//
// La columna de código: `resultado.validas[].valores` viene indexado por
// `ColumnaExcel.clave`, que es la clave de TS/Drizzle (`codigoBarras`),
// no el nombre real de la columna en SQL (`codigo_barras`). Con columnas
// de una sola palabra las dos coinciden por casualidad; con cualquier
// columna de más de una palabra no. Por eso la clave para buscar el
// valor se deriva de la propia tabla (`claveDeColumna`) en vez de leer
// `columnaCodigo.name` a secas.

import { eq, getTableColumns } from "drizzle-orm";
import type { SQLiteColumn, SQLiteTable } from "drizzle-orm/sqlite-core";
import type { SqliteRemoteDatabase } from "drizzle-orm/sqlite-proxy";
import type { ResultadoValidacion } from "./tipos";

function claveDeColumna(tabla: SQLiteTable, columna: SQLiteColumn): string {
  const columnas = getTableColumns(tabla);
  const entrada = Object.entries(columnas).find(([, valor]) => valor === columna);
  if (!entrada) {
    throw new Error("La columna de código no pertenece a la tabla indicada.");
  }
  return entrada[0];
}

export async function aplicarImportacion(
  // `any`: la función es genérica sobre cualquier esquema de Drizzle,
  // no sobre uno en particular.
  db: SqliteRemoteDatabase<any>,
  tabla: SQLiteTable,
  columnaCodigo: SQLiteColumn,
  resultado: ResultadoValidacion,
): Promise<{ creadas: number; actualizadas: number }> {
  if (resultado.errores.length > 0) {
    throw new Error(
      `No se puede importar: hay ${resultado.errores.length} fila(s) con errores. Corregí el archivo y volvé a intentar.`,
    );
  }

  const claveCodigo = claveDeColumna(tabla, columnaCodigo);

  return db.transaction(async (tx) => {
    let creadas = 0;
    let actualizadas = 0;

    for (const fila of resultado.validas) {
      const codigo = fila.valores[claveCodigo];
      const existente = await tx.select().from(tabla).where(eq(columnaCodigo, codigo)).limit(1);

      if (existente.length > 0) {
        await tx.update(tabla).set(fila.valores).where(eq(columnaCodigo, codigo));
        actualizadas++;
      } else {
        await tx.insert(tabla).values(fila.valores);
        creadas++;
      }
    }

    return { creadas, actualizadas };
  });
}
