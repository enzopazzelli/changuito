import { describe, expect, it } from "vitest";
import { calcularMargen, calcularStockResultante, esStockValido } from "../src/nucleo/stock/calculos";

describe("calcularMargen", () => {
  it("calcula el margen sobre el costo", () => {
    expect(calcularMargen(100, 125)).toBeCloseTo(0.25);
  });

  it("sin costo cargado, no hay margen que calcular", () => {
    expect(calcularMargen(0, 100)).toBeNull();
  });

  it("costo negativo tampoco tiene margen calculable", () => {
    expect(calcularMargen(-10, 100)).toBeNull();
  });

  it("vender por debajo del costo da margen negativo", () => {
    expect(calcularMargen(100, 80)).toBeCloseTo(-0.2);
  });
});

describe("calcularStockResultante", () => {
  it("suma un ajuste positivo a un producto por unidad", () => {
    expect(calcularStockResultante(10, 5, false)).toBe(15);
  });

  it("resta un ajuste negativo", () => {
    expect(calcularStockResultante(10, -3, false)).toBe(7);
  });

  it("redondea a entero un producto que no se vende por peso, incluso con resto de punto flotante", () => {
    // 0.1 + 0.2 en JS da 0.30000000000000004; acá el equivalente con
    // varias sumas de a 1 no debería dejar nunca un resto no entero.
    expect(calcularStockResultante(0.1 + 0.2 - 0.3, 5, false)).toBe(5);
  });

  it("un producto que se vende por peso conserva hasta 3 decimales (gramos)", () => {
    expect(calcularStockResultante(1.5, 0.25, true)).toBeCloseTo(1.75, 3);
  });

  it("redondea el resto de punto flotante de un pesable a gramos", () => {
    expect(calcularStockResultante(0.1, 0.2, true)).toBe(0.3);
  });
});

describe("esStockValido", () => {
  it("un resultado positivo siempre es válido", () => {
    expect(esStockValido(5, false)).toBe(true);
  });

  it("un resultado negativo es inválido si el comercio no permite stock negativo", () => {
    expect(esStockValido(-1, false)).toBe(false);
  });

  it("un resultado negativo es válido si el comercio lo permite explícitamente", () => {
    expect(esStockValido(-1, true)).toBe(true);
  });

  it("cero siempre es válido", () => {
    expect(esStockValido(0, false)).toBe(true);
  });
});
