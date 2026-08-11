import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import App from "../src/App";

describe("App", () => {
  it("arranca y muestra el nombre del producto", () => {
    render(<App />);
    expect(screen.getByText("Changuito")).toBeInTheDocument();
  });
});
