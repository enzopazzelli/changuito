export { calcularMargen, calcularStockResultante, esStockValido } from "./calculos";
export { crearCategoria, desactivarCategoria, listarCategorias } from "./categoria";
export {
  actualizarProducto,
  buscarPorCodigo,
  crearProducto,
  desactivarProducto,
  listarProductos,
} from "./producto";
export type { DatosProducto } from "./producto";
export { aplicarAjusteStock } from "./ajustes";
export type { DatosAjuste, MotivoAjuste } from "./ajustes";
export {
  columnasProducto,
  exportarProductosCsv,
  exportarProductosXlsx,
  generarPlantillaProductos,
  importarProductos,
  validarProductos,
} from "./excel";
