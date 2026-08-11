// Columnas de `producto` declaradas al motor genérico de Excel (§5.5).
// El código de barras es la columna de código para "actualiza por
// código" (§13: "Importa y exporta en Excel declarando sus columnas al
// motor"). No incluye `categoriaId`: es una referencia interna (FK), no
// algo que un comerciante escriba en una planilla — la categoría se
// asigna desde la pantalla del catálogo, cuando exista.

import { aplicarImportacion, exportarCsv, exportarXlsx, generarPlantilla, leer, validar } from "../excel";
import type { ColumnaExcel, ResultadoValidacion } from "../excel";
import { db } from "../datos/cliente";
import { producto } from "../datos/esquema";

export const columnasProducto: ColumnaExcel[] = [
  { clave: "codigoBarras", encabezado: "Código de barras", tipo: "texto", requerido: true },
  { clave: "nombre", encabezado: "Nombre", tipo: "texto", requerido: true },
  { clave: "codigoInterno", encabezado: "Código interno", tipo: "texto" },
  { clave: "costo", encabezado: "Costo", tipo: "numero", requerido: true },
  { clave: "precio", encabezado: "Precio", tipo: "numero", requerido: true },
  { clave: "stockActual", encabezado: "Stock actual", tipo: "numero", requerido: true },
  { clave: "stockMinimo", encabezado: "Stock mínimo", tipo: "numero" },
  { clave: "seVendePorPeso", encabezado: "Se vende por peso", tipo: "booleano" },
  { clave: "activo", encabezado: "Activo", tipo: "booleano" },
];

export function validarProductos(bytes: Uint8Array): ResultadoValidacion {
  return validar(leer(bytes), columnasProducto);
}

export function exportarProductosXlsx(filas: Record<string, unknown>[]) {
  return exportarXlsx(filas, columnasProducto);
}

export function exportarProductosCsv(filas: Record<string, unknown>[]) {
  return exportarCsv(filas, columnasProducto);
}

export function generarPlantillaProductos() {
  return generarPlantilla(columnasProducto);
}

export function importarProductos(resultado: ResultadoValidacion) {
  return aplicarImportacion(db, producto, producto.codigoBarras, resultado);
}
