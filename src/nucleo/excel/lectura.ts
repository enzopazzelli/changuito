// Lectura genérica de .xlsx y .csv. No sabe nada de columnas de negocio
// todavía: devuelve cada fila con sus valores indexados por el
// encabezado real del archivo (recortado y en minúsculas, para poder
// buscarlo sin importar mayúsculas/orden). El mapeo a las columnas que
// declara cada módulo pasa en `validar` (validacion.ts).

import * as XLSX from "xlsx";
import type { FilaCruda } from "./tipos";

const MENSAJE_NO_ES_PLANILLA = "El archivo no es una planilla válida (.xlsx o .csv).";

// Un encabezado con bytes de control o el carácter de reemplazo Unicode
// (que aparece cuando una secuencia de bytes no es UTF-8 válido) es la
// señal de que esto no es texto de verdad: XLSX.read acepta *cualquier*
// byte como si fuera un CSV de una sola columna en vez de fallar, así
// que ese chequeo hay que hacerlo a mano.
const CARACTER_DE_REEMPLAZO = String.fromCharCode(0xfffd);
const CARACTERES_INVALIDOS = new RegExp(`[\\x00-\\x08\\x0e-\\x1f${CARACTER_DE_REEMPLAZO}]`);

export function leer(bytes: Uint8Array): FilaCruda[] {
  let libro: XLSX.WorkBook;
  try {
    // codepage 65001 = UTF-8: sin esto, un .csv sin BOM (no todos los
    // programas lo agregan) se decodifica como si fuera Latin-1 y los
    // acentos/ñ salen rotos.
    libro = XLSX.read(bytes, { type: "array", codepage: 65001 });
  } catch {
    throw new Error(MENSAJE_NO_ES_PLANILLA);
  }

  const nombreHoja = libro.SheetNames[0];
  if (!nombreHoja) {
    throw new Error(MENSAJE_NO_ES_PLANILLA);
  }

  const filas: unknown[][] = XLSX.utils.sheet_to_json(libro.Sheets[nombreHoja], {
    header: 1,
    blankrows: false,
    defval: "",
  });

  if (filas.length === 0) {
    return [];
  }

  const encabezados = (filas[0] as unknown[]).map((valor) => String(valor).trim().toLowerCase());

  if (
    encabezados.every((encabezado) => encabezado === "") ||
    encabezados.some((encabezado) => CARACTERES_INVALIDOS.test(encabezado))
  ) {
    throw new Error(MENSAJE_NO_ES_PLANILLA);
  }

  const resultado: FilaCruda[] = [];
  for (let indiceFila = 1; indiceFila < filas.length; indiceFila++) {
    const filaOriginal = filas[indiceFila] as unknown[];
    const valores: Record<string, unknown> = {};
    encabezados.forEach((encabezado, indiceColumna) => {
      if (encabezado) {
        valores[encabezado] = filaOriginal[indiceColumna] ?? "";
      }
    });
    resultado.push({ fila: indiceFila + 1, valores });
  }

  return resultado;
}
