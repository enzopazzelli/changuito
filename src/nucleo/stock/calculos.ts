// Funciones puras del Módulo 1 (Stock, §6 del prompt base). Sin base de
// datos ni componentes: se prueban solas, y las usan tanto la capa de
// datos de este módulo como, más adelante, cualquier pantalla.

/** Margen sobre el costo (no sobre el precio de venta): 0.25 = 25%.
 * Sin costo cargado no hay margen que calcular (evita dividir por cero). */
export function calcularMargen(costo: number, precio: number): number | null {
  if (costo <= 0) return null;
  return (precio - costo) / costo;
}

/** Suma el delta de un ajuste al stock actual, redondeando para evitar
 * que un resto de punto flotante (4.999999999999 en vez de 5) rompa el
 * CHECK de la base que exige stock entero para productos que no se
 * venden por peso. Los pesables se redondean a gramos (3 decimales). */
export function calcularStockResultante(
  stockActual: number,
  cantidadAjuste: number,
  seVendePorPeso: boolean,
): number {
  const decimales = seVendePorPeso ? 3 : 0;
  const factor = 10 ** decimales;
  return Math.round((stockActual + cantidadAjuste) * factor) / factor;
}

/** El stock resultante de un ajuste solo es válido si no queda negativo,
 * salvo que el comercio permita explícitamente vender con stock negativo
 * (`comercio.permite_stock_negativo`). */
export function esStockValido(stockResultante: number, permiteStockNegativo: boolean): boolean {
  return permiteStockNegativo || stockResultante >= 0;
}
