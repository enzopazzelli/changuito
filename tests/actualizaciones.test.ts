import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { consultarActualizacion, esVersionMasNueva } from "../src/nucleo/actualizaciones";
import * as appTauri from "@tauri-apps/api/app";

vi.mock("@tauri-apps/api/app");

describe("esVersionMasNueva", () => {
  it("una versión mayor es más nueva", () => {
    expect(esVersionMasNueva("0.2.0", "0.1.0")).toBe(true);
  });

  it("la misma versión no es más nueva", () => {
    expect(esVersionMasNueva("0.1.0", "0.1.0")).toBe(false);
  });

  it("una versión menor no es más nueva", () => {
    expect(esVersionMasNueva("0.1.0", "0.2.0")).toBe(false);
  });

  it("tolera el prefijo v de un tag de GitHub", () => {
    expect(esVersionMasNueva("v0.3.0", "0.2.5")).toBe(true);
  });
});

describe("consultarActualizacion", () => {
  beforeEach(() => {
    vi.mocked(appTauri.getVersion).mockResolvedValue("0.1.0");
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("avisa cuando la release de GitHub es más nueva", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          tag_name: "v0.2.0",
          body: "notas de la versión",
          html_url: "https://github.com/enzopazzelli/changuito/releases/tag/v0.2.0",
        }),
      }),
    );

    const resultado = await consultarActualizacion();

    expect(resultado).toEqual({
      hayNueva: true,
      version: "0.2.0",
      notas: "notas de la versión",
      url: "https://github.com/enzopazzelli/changuito/releases/tag/v0.2.0",
    });
  });

  it("no avisa cuando la release es igual o más vieja", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          tag_name: "v0.1.0",
          body: "",
          html_url: "https://github.com/enzopazzelli/changuito/releases/tag/v0.1.0",
        }),
      }),
    );

    expect(await consultarActualizacion()).toEqual({ hayNueva: false });
  });

  it("sin conexión, falla en silencio", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new Error("sin conexión")),
    );

    await expect(consultarActualizacion()).resolves.toEqual({ hayNueva: false });
  });

  it("una respuesta que no es JSON de una release también falla en silencio", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ mensaje: "not found" }),
      }),
    );

    expect(await consultarActualizacion()).toEqual({ hayNueva: false });
  });
});
