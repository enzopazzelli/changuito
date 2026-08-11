// Único lugar donde vive esta URL: cuando el repo tenga releases
// publicadas de verdad, se cambia acá y en ningún otro lado. GitHub
// expone la última release por API pública (sin autenticación,
// mientras el repo sea público) — no hace falta mantener un
// version.json a mano en un sitio aparte.
export const URL_ULTIMA_RELEASE =
  "https://api.github.com/repos/enzopazzelli/changuito/releases/latest";
