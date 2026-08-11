// Valida cada fila cruda contra las columnas que declara el módulo, y
// mapea del encabezado real del archivo a la clave interna. Junta
// *todos* los errores de *todas* las filas — la vista previa tiene que
// poder mostrarlos todos juntos, no de a uno.

import type { ColumnaExcel, ErrorFila, FilaCruda, FilaValidada, ResultadoValidacion } from "./tipos";

const VALORES_VERDADEROS = new Set(["si", "sí", "true", "1", "verdadero"]);
const VALORES_FALSOS = new Set(["no", "false", "0", "falso"]);

export function validar(filas: FilaCruda[], columnas: ColumnaExcel[]): ResultadoValidacion {
  const validas: FilaValidada[] = [];
  const errores: ErrorFila[] = [];

  for (const fila of filas) {
    const valoresFila: Record<string, unknown> = {};
    const motivosFila: string[] = [];

    for (const columna of columnas) {
      const clave = columna.encabezado.trim().toLowerCase();
      const crudo = fila.valores[clave];
      const texto = crudo === undefined || crudo === null ? "" : String(crudo).trim();

      if (texto === "") {
        if (columna.requerido) {
          motivosFila.push(`"${columna.encabezado}": es obligatorio`);
        }
        valoresFila[columna.clave] = columna.tipo === "booleano" ? false : null;
        continue;
      }

      if (columna.tipo === "texto") {
        valoresFila[columna.clave] = texto;
      } else if (columna.tipo === "entero") {
        const numero = Number(texto);
        if (!Number.isInteger(numero)) {
          motivosFila.push(`"${columna.encabezado}": no es un número entero`);
        } else {
          valoresFila[columna.clave] = numero;
        }
      } else if (columna.tipo === "numero") {
        const numero = Number(texto);
        if (Number.isNaN(numero)) {
          motivosFila.push(`"${columna.encabezado}": no es un número`);
        } else {
          valoresFila[columna.clave] = numero;
        }
      } else {
        const normalizado = texto.toLowerCase();
        if (VALORES_VERDADEROS.has(normalizado)) {
          valoresFila[columna.clave] = true;
        } else if (VALORES_FALSOS.has(normalizado)) {
          valoresFila[columna.clave] = false;
        } else {
          motivosFila.push(`"${columna.encabezado}": tiene que ser sí o no`);
        }
      }
    }

    if (motivosFila.length > 0) {
      for (const motivo of motivosFila) {
        errores.push({ fila: fila.fila, motivo });
      }
    } else {
      validas.push({ fila: fila.fila, valores: valoresFila });
    }
  }

  return { validas, errores };
}
