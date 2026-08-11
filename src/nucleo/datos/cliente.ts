// Traductor entre Drizzle y los dos comandos Tauri genéricos
// (bd_ejecutar/bd_consultar, en src-tauri/src/nucleo/basedatos/comandos.rs).
// Es el único archivo de la app que habla con esos comandos directo —
// todo lo demás usa las funciones tipadas de este directorio.
//
// El comando Rust ya devuelve cada fila como array posicional (mismo
// orden que las columnas de la consulta), así que no hace falta mapear
// nada acá: es exactamente lo que espera el driver sqlite-proxy.

import { invoke } from "@tauri-apps/api/core";
import { drizzle } from "drizzle-orm/sqlite-proxy";
import * as esquema from "./esquema";

export const db = drizzle<typeof esquema>(
  async (sql, params, method) => {
    if (method === "run") {
      await invoke("bd_ejecutar", { sql, parametros: params });
      return { rows: [] };
    }

    const filas = await invoke<unknown[][]>("bd_consultar", { sql, parametros: params });
    return { rows: method === "get" ? (filas[0] ?? []) : filas };
  },
  { schema: esquema },
);
