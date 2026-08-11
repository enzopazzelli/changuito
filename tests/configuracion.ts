import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

// Sin esto, el DOM de un test queda montado cuando arranca el
// siguiente: con más de un test por archivo, las consultas por texto
// empiezan a matchear duplicados de renders anteriores.
afterEach(() => {
  cleanup();
});
