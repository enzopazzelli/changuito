import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import App from "../src/App";
import * as datos from "../src/nucleo/datos";

// El resto de la app no le habla a Tauri directo (regla de arquitectura,
// §4): alcanza con mockear src/nucleo/datos para probar App.tsx sin un
// backend real.
vi.mock("../src/nucleo/datos");

const comercioGuardado = {
  id: 1,
  nombre: "Almacén Doña Rosa",
  rubro: "despensa",
  cuit: null,
  fiadoActivo: false,
  ivaIncluido: true,
  redondeo: "sin_redondeo",
  permiteStockNegativo: false,
  vendePorPeso: false,
};

describe("App", () => {
  beforeEach(() => {
    vi.mocked(datos.obtenerComercio).mockReset();
    vi.mocked(datos.guardarComercio).mockReset();
  });

  it("si ya hay un comercio guardado, arranca directo (sin formulario)", async () => {
    vi.mocked(datos.obtenerComercio).mockResolvedValue(comercioGuardado);

    render(<App />);

    expect(await screen.findByText("Changuito")).toBeInTheDocument();
    expect(screen.queryByText("Antes de arrancar")).not.toBeInTheDocument();
  });

  it("si todavía no hay comercio, completar el formulario lo guarda", async () => {
    vi.mocked(datos.obtenerComercio).mockResolvedValueOnce(null);
    vi.mocked(datos.guardarComercio).mockResolvedValue(undefined);
    vi.mocked(datos.obtenerComercio).mockResolvedValueOnce(comercioGuardado);

    render(<App />);

    expect(await screen.findByText("Antes de arrancar")).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Nombre del comercio"), {
      target: { value: "Almacén Doña Rosa" },
    });
    fireEvent.change(screen.getByLabelText("Rubro"), { target: { value: "despensa" } });
    fireEvent.click(screen.getByRole("button", { name: /empezar/i }));

    await waitFor(() => {
      expect(datos.guardarComercio).toHaveBeenCalledWith({
        nombre: "Almacén Doña Rosa",
        rubro: "despensa",
        cuit: "",
      });
    });

    expect(await screen.findByText("Changuito")).toBeInTheDocument();
  });

  it("si falla la lectura inicial, no se queda trabado en blanco", async () => {
    vi.mocked(datos.obtenerComercio).mockRejectedValue(new Error("sin conexión"));

    render(<App />);

    expect(await screen.findByText(/no se pudo leer/i)).toBeInTheDocument();
  });
});
