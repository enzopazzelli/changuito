// Únicas funciones que el resto de la app puede usar para tocar la tabla
// `comercio` (regla de arquitectura, §4 del prompt base).

import { eq } from "drizzle-orm";
import { db } from "./cliente";
import { comercio } from "./esquema";

export type DatosComercio = {
  nombre: string;
  rubro: string;
  cuit?: string | null;
};

export async function obtenerComercio() {
  const filas = await db.select().from(comercio).where(eq(comercio.id, 1)).limit(1);
  return filas[0] ?? null;
}

// Solo tiene sentido en el primer arranque: `comercio` es una tabla de
// una sola fila (CHECK id = 1 en el esquema), así que esto se llama una
// única vez, cuando `obtenerComercio()` todavía devuelve null.
export async function guardarComercio(datos: DatosComercio) {
  await db.insert(comercio).values({
    id: 1,
    nombre: datos.nombre,
    rubro: datos.rubro,
    cuit: datos.cuit?.trim() ? datos.cuit.trim() : null,
  });
}
