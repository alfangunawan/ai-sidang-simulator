import { describe, it, expect } from "vitest";
import { createRef } from "react";
import { render } from "@testing-library/react";
import { Button } from "./button.js";

// Radix menitipkan ref lewat asChild (DropdownMenuTrigger, DialogClose). Kalau
// ref berhenti di komponen, Popper kehilangan anchor dan menunya terbuka di
// luar layar sambil mengunci klik halaman — lihat komentar di button.tsx.
describe("Button", () => {
  it("forwards its ref to the DOM node", () => {
    const ref = createRef<HTMLButtonElement>();
    render(<Button ref={ref}>Aksi</Button>);
    expect(ref.current).toBeInstanceOf(HTMLButtonElement);
  });

  it("forwards its ref through asChild", () => {
    const ref = createRef<HTMLButtonElement>();
    render(
      <Button asChild ref={ref}>
        <button type="button">Aksi</button>
      </Button>,
    );
    expect(ref.current).toBeInstanceOf(HTMLButtonElement);
  });
});
