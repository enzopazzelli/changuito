// Únicas funciones que el resto de la app puede usar para tocar la tabla
// `producto` (regla de arquitectura, §4 del prompt base). Los cambios de
// `stock_actual` después de la carga inicial pasan por `aplicarAjusteStock`
// (ajustes.ts), no por acá — así queda auditado quién y por qué. Por eso
// `actualizarProducto` no acepta `stockActual` entre los campos editables.

import { eq, or } from "drizzle-orm";
import { db } from "../datos/cliente";
import { producto } from "../datos/esquema";

export type DatosProducto = {
  nombre: string;
  categoriaId?: number | null;
  codigoBarras?: string | null;
  codigoInterno?: string | null;
  seVendePorPeso?: boolean;
  costo?: number;
  precio?: number;
  /** Solo tiene sentido en la carga inicial del catálogo (alta manual o
   * importación de Excel): a partir de ahí, el stock se mueve con
   * `aplicarAjusteStock`. */
  stockActual?: number;
  stockMinimo?: number;
};

function normalizarCodigo(valor: string | null | undefined) {
  const limpio = valor?.trim();
  return limpio ? limpio : null;
}

export async function crearProducto(datos: DatosProducto) {
  const seVendePorPeso = datos.seVendePorPeso ?? false;
  const [fila] = await db
    .insert(producto)
    .values({
      nombre: datos.nombre.trim(),
      categoriaId: datos.categoriaId ?? null,
      codigoBarras: normalizarCodigo(datos.codigoBarras),
      codigoInterno: normalizarCodigo(datos.codigoInterno),
      seVendePorPeso,
      // La unidad se deriva de si se vende por peso: no tiene sentido
      // dejar que quede en un estado inconsistente entre las dos.
      unidadMedida: seVendePorPeso ? "kg" : "unidad",
      costo: datos.costo ?? 0,
      precio: datos.precio ?? 0,
      stockActual: datos.stockActual ?? 0,
      stockMinimo: datos.stockMinimo ?? 0,
    })
    .returning();
  return fila;
}

export async function listarProductos(soloActivos = true) {
  const filas = await db.select().from(producto);
  return soloActivos ? filas.filter((fila) => fila.activo) : filas;
}

/** Busca por código de barras o código interno (PLU), lo que traiga el
 * lector o se tipee a mano. */
export async function buscarPorCodigo(codigo: string) {
  const [fila] = await db
    .select()
    .from(producto)
    .where(or(eq(producto.codigoBarras, codigo), eq(producto.codigoInterno, codigo)))
    .limit(1);
  return fila ?? null;
}

export async function actualizarProducto(
  id: number,
  cambios: Partial<Omit<DatosProducto, "stockActual">>,
) {
  const valores: Record<string, unknown> = { ...cambios };
  if (cambios.codigoBarras !== undefined) valores.codigoBarras = normalizarCodigo(cambios.codigoBarras);
  if (cambios.codigoInterno !== undefined) valores.codigoInterno = normalizarCodigo(cambios.codigoInterno);
  if (cambios.seVendePorPeso !== undefined) {
    valores.unidadMedida = cambios.seVendePorPeso ? "kg" : "unidad";
  }
  if (cambios.nombre !== undefined) valores.nombre = cambios.nombre.trim();

  await db.update(producto).set(valores).where(eq(producto.id, id));
}

// No hay borrado: un producto con ajustes o ventas ya registrados no
// puede desaparecer sin romper esa historia. Se desactiva y deja de
// ofrecerse para vender, pero el registro sigue intacto.
export async function desactivarProducto(id: number) {
  await db.update(producto).set({ activo: false }).where(eq(producto.id, id));
}
