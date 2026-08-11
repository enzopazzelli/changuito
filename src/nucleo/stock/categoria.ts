// Únicas funciones que el resto de la app puede usar para tocar la tabla
// `categoria` (regla de arquitectura, §4 del prompt base).

import { eq } from "drizzle-orm";
import { db } from "../datos/cliente";
import { categoria } from "../datos/esquema";

export async function listarCategorias(soloActivas = true) {
  const filas = await db.select().from(categoria);
  return soloActivas ? filas.filter((fila) => fila.activa) : filas;
}

export async function crearCategoria(nombre: string) {
  const [fila] = await db.insert(categoria).values({ nombre: nombre.trim() }).returning();
  return fila;
}

// No hay borrado: una categoría con productos ya cargados no puede
// desaparecer sin dejarlos huérfanos. Se desactiva y deja de listarse
// para elegir en productos nuevos, pero los existentes la conservan.
export async function desactivarCategoria(id: number) {
  await db.update(categoria).set({ activa: false }).where(eq(categoria.id, id));
}
