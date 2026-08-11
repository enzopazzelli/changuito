import { useEffect, useState, type FormEvent } from "react";
import "./estilos/tema.css";
import { guardarComercio, obtenerComercio, type DatosComercio } from "./nucleo/datos";

type Comercio = Awaited<ReturnType<typeof obtenerComercio>>;

// Pantalla de configuración inicial (§5.1): se muestra hasta que exista
// una fila en `comercio`. Inputs simples con los tokens de tema.css, sin
// los componentes de §8.4 todavía — esos llegan con el módulo que
// primero los necesite, no antes.
function App() {
  const [comercio, setComercio] = useState<Comercio | undefined>(undefined);
  const [datos, setDatos] = useState<DatosComercio>({ nombre: "", rubro: "", cuit: "" });
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    obtenerComercio()
      .then(setComercio)
      .catch((motivo) => {
        console.error("No se pudo leer el comercio:", motivo);
        setError("No se pudo leer los datos del comercio.");
      });
  }, []);

  async function alGuardar(evento: FormEvent) {
    evento.preventDefault();
    setGuardando(true);
    setError(null);

    // Separado en dos try/catch a propósito: si guardar falla, el usuario
    // tiene que reintentar. Si guardar funcionó y lo que falla es solo la
    // relectura posterior, no hay que decirle "no se pudo guardar" — sería
    // mentira, y además reintentar el insert chocaría con el CHECK de
    // "un solo comercio".
    try {
      await guardarComercio(datos);
    } catch (motivo) {
      console.error("No se pudo guardar el comercio:", motivo);
      setError("No se pudo guardar. Probá de nuevo.");
      setGuardando(false);
      return;
    }

    try {
      setComercio(await obtenerComercio());
    } catch (motivo) {
      console.error("Se guardó, pero falló la relectura:", motivo);
      setError("Se guardó, pero no se pudo confirmar. Reiniciá la app.");
    }
    setGuardando(false);
  }

  if (comercio === undefined && !error) {
    return null;
  }

  if (!comercio) {
    return (
      <main className="flex h-screen items-center justify-center bg-fondo">
        <form
          onSubmit={alGuardar}
          className="w-full max-w-sm rounded-base border border-linea bg-superficie p-6"
        >
          <h1 className="mb-4 text-xl font-semibold text-texto">Antes de arrancar</h1>

          <label className="mb-3 block text-sm text-texto">
            Nombre del comercio
            <input
              required
              className="mt-1 w-full rounded-base border border-linea px-3 py-2 text-texto"
              value={datos.nombre}
              onChange={(evento) => setDatos({ ...datos, nombre: evento.target.value })}
            />
          </label>

          <label className="mb-3 block text-sm text-texto">
            Rubro
            <input
              required
              className="mt-1 w-full rounded-base border border-linea px-3 py-2 text-texto"
              value={datos.rubro}
              onChange={(evento) => setDatos({ ...datos, rubro: evento.target.value })}
            />
          </label>

          <label className="mb-4 block text-sm text-texto">
            CUIT (opcional)
            <input
              className="mt-1 w-full rounded-base border border-linea px-3 py-2 text-texto"
              value={datos.cuit ?? ""}
              onChange={(evento) => setDatos({ ...datos, cuit: evento.target.value })}
            />
          </label>

          {error && <p className="mb-3 text-sm text-alerta">{error}</p>}

          <button
            type="submit"
            disabled={guardando}
            className="w-full rounded-base bg-acento px-3 py-2 font-medium text-acento-texto disabled:opacity-50"
          >
            {guardando ? "Guardando…" : "Empezar"}
          </button>
        </form>
      </main>
    );
  }

  return (
    <main className="flex h-screen flex-col items-center justify-center gap-2 bg-fondo text-texto">
      <h1 className="text-3xl font-semibold">Changuito</h1>
      <p className="text-texto-suave">Sistema de gestión — fundación en construcción</p>
    </main>
  );
}

export default App;
