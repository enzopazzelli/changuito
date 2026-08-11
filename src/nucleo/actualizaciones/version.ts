// Comparación de versiones sin librería de semver: alcanza con comparar
// major.minor.patch como números. Tolera un "v" inicial (así viene el
// `tag_name` de una release de GitHub).

function normalizar(version: string): number[] {
  const sinPrefijo = version.trim().replace(/^v/i, "");
  return sinPrefijo.split(".").map((parte) => {
    const numero = Number.parseInt(parte, 10);
    return Number.isNaN(numero) ? 0 : numero;
  });
}

export function esVersionMasNueva(remota: string, actual: string): boolean {
  const partesRemota = normalizar(remota);
  const partesActual = normalizar(actual);
  const longitud = Math.max(partesRemota.length, partesActual.length);

  for (let i = 0; i < longitud; i++) {
    const remoto = partesRemota[i] ?? 0;
    const propio = partesActual[i] ?? 0;
    if (remoto !== propio) {
      return remoto > propio;
    }
  }

  return false;
}
