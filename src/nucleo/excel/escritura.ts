// Exportación genérica a .xlsx (ExcelJS) y .csv (a mano). El mismo
// escapado de fórmulas se aplica a los dos formatos: un texto que
// empieza con =, +, - o @ se antepone con una comilla, o Excel lo
// interpreta como fórmula al abrirlo. En CSV es un riesgo real (no hay
// tipos en el archivo, Excel decide mirando el primer carácter); en
// xlsx es más bien un resguardo, porque ExcelJS no convierte un string
// común en fórmula salvo que se use `{ formula: ... }` explícito.

import ExcelJS from "exceljs";
import type { ColumnaExcel } from "./tipos";

function escaparFormula(valor: unknown): unknown {
  if (typeof valor === "string" && /^[=+\-@]/.test(valor)) {
    return `'${valor}`;
  }
  return valor;
}

export async function exportarXlsx(
  filas: Record<string, unknown>[],
  columnas: ColumnaExcel[],
): Promise<Uint8Array> {
  const libro = new ExcelJS.Workbook();
  const hoja = libro.addWorksheet("Datos");

  hoja.columns = columnas.map((columna) => ({
    header: columna.encabezado,
    key: columna.clave,
    width: Math.max(columna.encabezado.length + 2, 12),
  }));

  for (const fila of filas) {
    const filaEscapada: Record<string, unknown> = {};
    for (const columna of columnas) {
      filaEscapada[columna.clave] = escaparFormula(fila[columna.clave]);
    }
    hoja.addRow(filaEscapada);
  }

  const buffer = await libro.xlsx.writeBuffer();
  return new Uint8Array(buffer);
}

export function generarPlantilla(columnas: ColumnaExcel[]): Promise<Uint8Array> {
  return exportarXlsx([], columnas);
}

function campoCsv(valorOriginal: unknown): string {
  const valor = escaparFormula(valorOriginal);
  const texto = valor === null || valor === undefined ? "" : String(valor);
  if (/[;"\n\r]/.test(texto)) {
    return `"${texto.replace(/"/g, '""')}"`;
  }
  return texto;
}

/** UTF-8 con BOM y `;` como separador: sin esto, el Excel en español
 * rompe acentos y confunde columnas (usa `,` como separador decimal). */
const BOM_UTF8 = String.fromCharCode(0xfeff);

export function exportarCsv(filas: Record<string, unknown>[], columnas: ColumnaExcel[]): Uint8Array {
  const encabezado = columnas.map((columna) => campoCsv(columna.encabezado)).join(";");
  const lineas = filas.map((fila) =>
    columnas.map((columna) => campoCsv(fila[columna.clave])).join(";"),
  );
  const contenido = BOM_UTF8 + [encabezado, ...lineas].join("\r\n");
  return new TextEncoder().encode(contenido);
}
