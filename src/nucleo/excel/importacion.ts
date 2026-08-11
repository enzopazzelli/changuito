// Aplica una importación ya validada, genérica sobre cualquier tabla de
// Drizzle: actualiza por código en vez de duplicar. "Todo o nada" en dos
// capas: rechaza de entrada si la validación previa encontró algún
// error (ni las filas válidas del mismo archivo se aplican), y además
// todo el ciclo insertar/actualizar corre dentro de una transacción por
// si algo falla recién al escribir (una restricción de la base, por
// ejemplo).
//
// La columna de código: `ColumnaExcel.clave` de esa columna tiene que
// coincidir con el nombre real de la columna en la tabla (`columna.name`
// de Drizzle) para que la búsqueda funcione — en este proyecto los
// nombres de columna son una sola palabra en español, así que TS y SQL
// ya coinciden sin que haga falta un mapeo aparte.

import { eq } from "drizzle-orm";
import type { SQLiteColumn, SQLiteTable } from "drizzle-orm/sqlite-core";
import type { SqliteRemoteDatabase } from "drizzle-orm/sqlite-proxy";
import type { ResultadoValidacion } from "./tipos";

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

  return db.transaction(async (tx) => {
    let creadas = 0;
    let actualizadas = 0;

    for (const fila of resultado.validas) {
      const codigo = fila.valores[columnaCodigo.name];
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
