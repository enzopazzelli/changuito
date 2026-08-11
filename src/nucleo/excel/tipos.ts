// Tipos del motor genérico de Excel (§5.5 del prompt base). Cada módulo
// de negocio futuro solo declara un `ColumnaExcel[]` con sus propias
// columnas; el motor no sabe nada de stock, ventas ni ningún otro
// dominio.

export type TipoColumna = "texto" | "entero" | "numero" | "booleano";

export type ColumnaExcel = {
  /** Clave del objeto fila (y, por convención, de la columna de la tabla). */
  clave: string;
  /** Encabezado visible en la planilla. */
  encabezado: string;
  tipo: TipoColumna;
  requerido?: boolean;
};

/** Una fila tal como se leyó del archivo, con su número de fila real
 * (el que el usuario ve si abre el archivo en Excel: cuenta el
 * encabezado y arranca en 1). */
export type FilaCruda = {
  fila: number;
  valores: Record<string, unknown>;
};

export type ErrorFila = {
  fila: number;
  motivo: string;
};

export type FilaValidada = {
  fila: number;
  valores: Record<string, unknown>;
};

export type ResultadoValidacion = {
  validas: FilaValidada[];
  errores: ErrorFila[];
};
