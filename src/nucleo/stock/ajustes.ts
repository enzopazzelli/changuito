// Único camino para mover `producto.stock_actual` fuera de la carga
// inicial (regla de arquitectura, §4): lee el stock y `permite_stock_negativo`
// del comercio, valida, y escribe el nuevo stock más su registro de
// auditoría en la misma transacción (regla §10.3 — tocan dos tablas).
//
// La lógica vive en `aplicarAjusteStockConexion`, que recibe la conexión
// como parámetro (mismo patrón que `aplicarImportacion` del motor de
// Excel) para poder probarla contra una base de prueba real en vez de la
// conexión real de Tauri. `aplicarAjusteStock` es el atajo que usa el
// resto de la app.

import { eq } from "drizzle-orm";
import type { SqliteRemoteDatabase } from "drizzle-orm/sqlite-proxy";
import { db } from "../datos/cliente";
import { ajusteStock, comercio, producto } from "../datos/esquema";
import { calcularStockResultante, esStockValido } from "./calculos";

export type MotivoAjuste = "rotura" | "vencido" | "conteo" | "otro";

export type DatosAjuste = {
  productoId: number;
  /** Delta: positivo suma, negativo resta. */
  cantidad: number;
  motivo: MotivoAjuste;
  detalle?: string | null;
  usuarioId: number;
};

export async function aplicarAjusteStockConexion(
  // `any`: la conexión de prueba corre contra un esquema propio (sql.js).
  db: SqliteRemoteDatabase<any>,
  datos: DatosAjuste,
) {
  return db.transaction(async (tx) => {
    const [prod] = await tx.select().from(producto).where(eq(producto.id, datos.productoId)).limit(1);
    if (!prod) {
      throw new Error("El producto no existe.");
    }

    const [datosComercio] = await tx.select().from(comercio).where(eq(comercio.id, 1)).limit(1);
    const permiteStockNegativo = datosComercio?.permiteStockNegativo ?? false;

    const stockResultante = calcularStockResultante(
      prod.stockActual,
      datos.cantidad,
      prod.seVendePorPeso,
    );

    if (!esStockValido(stockResultante, permiteStockNegativo)) {
      throw new Error("No hay stock suficiente para este ajuste.");
    }

    await tx.update(producto).set({ stockActual: stockResultante }).where(eq(producto.id, datos.productoId));

    await tx.insert(ajusteStock).values({
      productoId: datos.productoId,
      cantidad: datos.cantidad,
      motivo: datos.motivo,
      detalle: datos.detalle ?? null,
      stockResultante,
      usuarioId: datos.usuarioId,
    });

    return { stockResultante };
  });
}

export function aplicarAjusteStock(datos: DatosAjuste) {
  return aplicarAjusteStockConexion(db, datos);
}
