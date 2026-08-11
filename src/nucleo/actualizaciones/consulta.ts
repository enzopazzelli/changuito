// Consulta la última release en GitHub y la compara contra la versión
// instalada. Cualquier fallo (sin conexión, JSON inesperado, lo que
// sea) devuelve "no hay nada nuevo" en vez de propagar el error: "sin
// conexión, la consulta falla en silencio y la app sigue funcionando"
// (§5.4). No hay ningún canal que descargue ni aplique nada — ver
// nucleo/excel para el mismo criterio de "motor probado, sin UI todavía"
// que se usó en los puntos 3 y 4; acá el motor sí tiene un aviso mínimo
// en App.tsx porque no hace falta ningún plugin nuevo para mostrarlo.

import { getVersion } from "@tauri-apps/api/app";
import { URL_ULTIMA_RELEASE } from "./config";
import { esVersionMasNueva } from "./version";

export type ResultadoActualizacion =
  | { hayNueva: false }
  | { hayNueva: true; version: string; notas: string; url: string };

type RespuestaGitHub = {
  tag_name?: string;
  body?: string;
  html_url?: string;
};

export async function consultarActualizacion(): Promise<ResultadoActualizacion> {
  try {
    const [respuesta, actual] = await Promise.all([fetch(URL_ULTIMA_RELEASE), getVersion()]);

    if (!respuesta.ok) {
      return { hayNueva: false };
    }

    const datos = (await respuesta.json()) as RespuestaGitHub;
    if (!datos.tag_name || !datos.html_url) {
      return { hayNueva: false };
    }

    if (!esVersionMasNueva(datos.tag_name, actual)) {
      return { hayNueva: false };
    }

    return {
      hayNueva: true,
      version: datos.tag_name.replace(/^v/i, ""),
      notas: datos.body ?? "",
      url: datos.html_url,
    };
  } catch {
    return { hayNueva: false };
  }
}
