import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { Personas } from "./Personas.js";
import * as adminApi from "../../adminApi.js";

const ROWS = [
  {
    key: "hendra", name: "Ir. Hendra Gunawan, M.Sc.", initials: "HG",
    role: "Pembimbing yang menenangkan", mode: "santai", type: "umum",
    color: "#0f9d6e", trait: "Bertanya pelan.", position: 0, active: true,
  },
];

describe("Personas", () => {
  beforeEach(() => {
    vi.spyOn(adminApi, "listAdminPersonas").mockResolvedValue(ROWS as any);
    vi.spyOn(adminApi, "putPersona").mockResolvedValue(undefined as any);
  });
  afterEach(() => vi.restoreAllMocks());

  it("lists personas and saves an edited name", async () => {
    render(<Personas />);
    fireEvent.click(await screen.findByRole("button", { name: /Ubah hendra/ }));

    fireEvent.change(screen.getByLabelText("Nama"), { target: { value: "Ir. Hendra G." } });
    fireEvent.click(screen.getByRole("button", { name: "Simpan" }));

    await waitFor(() =>
      expect(adminApi.putPersona).toHaveBeenCalledWith(
        expect.objectContaining({ key: "hendra", name: "Ir. Hendra G." }),
      ),
    );
  });
});
