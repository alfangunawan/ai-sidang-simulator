import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { Transcript } from "./Transcript.js";

describe("Transcript", () => {
  it("renders each turn as a labelled bubble with inline markdown", () => {
    const { container } = render(
      <Transcript
        turns={[
          { role: "user", content: "halo" },
          { role: "examiner", content: "modul **tidak** benar" },
        ]}
      />,
    );
    const bubbles = container.querySelectorAll(".bubble");
    expect(bubbles).toHaveLength(2);
    expect(bubbles[0].querySelector(".who")?.textContent).toBe("Anda");
    expect(bubbles[1].querySelector(".who")?.textContent).toBe("Penguji");
    expect(bubbles[1].querySelector("strong")?.textContent).toBe("tidak");
  });
});
