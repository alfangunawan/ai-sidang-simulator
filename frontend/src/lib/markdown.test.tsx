import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { renderInline, stripMarkdown } from "./markdown.js";

describe("stripMarkdown", () => {
  it("removes bold/italic markers, keeping the inner text (for TTS)", () => {
    expect(stripMarkdown("modul **tidak membedakan fungsi** antara *screening*")).toBe(
      "modul tidak membedakan fungsi antara screening",
    );
  });

  it("leaves plain text untouched", () => {
    expect(stripMarkdown("tanpa markup apa pun")).toBe("tanpa markup apa pun");
  });
});

describe("renderInline", () => {
  it("renders **x** as bold and *x* as italic, keeping surrounding text", () => {
    const { container } = render(<div>{renderInline("a **tebal** c *miring*")}</div>);
    expect(container.querySelector("strong")?.textContent).toBe("tebal");
    expect(container.querySelector("em")?.textContent).toBe("miring");
    expect(container.textContent).toBe("a tebal c miring");
  });

  it("leaves an unmatched marker as literal text", () => {
    const { container } = render(<div>{renderInline("harga 3 * 4 saja")}</div>);
    expect(container.querySelector("strong")).toBeNull();
    expect(container.querySelector("em")).toBeNull();
    expect(container.textContent).toBe("harga 3 * 4 saja");
  });
});
