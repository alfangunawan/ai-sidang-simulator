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

// Radix selects: options only exist once the trigger is opened, and it opens
// on pointerdown rather than click (see SettingsPage.test.tsx for the same
// pattern).
async function pick(triggerLabel: string, optionName: string | RegExp) {
  fireEvent.pointerDown(screen.getByLabelText(triggerLabel), {
    button: 0,
    ctrlKey: false,
    pointerType: "mouse",
  });
  fireEvent.click(await screen.findByRole("option", { name: optionName }));
}

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

  // PUT ke /admin/personas/:key memakai key di URL sebagai penentu baris.
  // Kalau Kunci bisa diubah di sesi "Ubah", mengetik ulang membuat baris baru
  // ketimbang mengganti nama baris lama — dua persona di mana harusnya satu.
  it("keeps an existing persona's key read-only, saving under the original key", async () => {
    render(<Personas />);
    fireEvent.click(await screen.findByRole("button", { name: /Ubah hendra/ }));

    const keyInput = screen.getByLabelText("Kunci") as HTMLInputElement;
    expect(keyInput.disabled).toBe(true);
    fireEvent.change(keyInput, { target: { value: "hendra2" } });
    expect(keyInput.value).toBe("hendra"); // unchanged despite the attempted edit

    fireEvent.change(screen.getByLabelText("Peran"), { target: { value: "Peran baru" } });
    fireEvent.click(screen.getByRole("button", { name: "Simpan" }));

    await waitFor(() =>
      expect(adminApi.putPersona).toHaveBeenCalledWith(
        expect.objectContaining({ key: "hendra", role: "Peran baru" }),
      ),
    );
  });

  it("lets a new persona's key be typed", async () => {
    render(<Personas />);
    fireEvent.click(await screen.findByRole("button", { name: "Persona baru" }));

    const keyInput = screen.getByLabelText("Kunci") as HTMLInputElement;
    expect(keyInput.disabled).toBe(false);
    fireEvent.change(keyInput, { target: { value: "baru" } });
    expect(keyInput.value).toBe("baru");
  });

  it("toggling Aktif off sends active: false", async () => {
    render(<Personas />);
    fireEvent.click(await screen.findByRole("button", { name: /Ubah hendra/ }));

    fireEvent.click(screen.getByLabelText("Aktif"));
    fireEvent.click(screen.getByRole("button", { name: "Simpan" }));

    await waitFor(() =>
      expect(adminApi.putPersona).toHaveBeenCalledWith(
        expect.objectContaining({ key: "hendra", active: false }),
      ),
    );
  });

  // Free-text mode/type let an admin type an unknown mode (defangs the
  // examiner, backend.persona.ts falls back silently) or a pair another
  // persona already holds (personaFor then resolves to the wrong persona).
  // The picker must only offer the known options.
  it("offers the known mode and type options instead of free text", async () => {
    render(<Personas />);
    fireEvent.click(await screen.findByRole("button", { name: /Ubah hendra/ }));

    await pick("Mode", "Kritis");
    await pick("Tipe", "Metodolog");
    fireEvent.click(screen.getByRole("button", { name: "Simpan" }));

    await waitFor(() =>
      expect(adminApi.putPersona).toHaveBeenCalledWith(
        expect.objectContaining({ key: "hendra", mode: "kritis", type: "metodolog" }),
      ),
    );
  });

  it("surfaces a rejected save (e.g. the last-active-persona guard) as an alert", async () => {
    vi.spyOn(adminApi, "putPersona").mockRejectedValue(
      new Error("Persona aktif terakhir tidak bisa dinonaktifkan"),
    );
    render(<Personas />);
    fireEvent.click(await screen.findByRole("button", { name: /Ubah hendra/ }));
    fireEvent.click(screen.getByLabelText("Aktif"));
    fireEvent.click(screen.getByRole("button", { name: "Simpan" }));

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("Persona aktif terakhir tidak bisa dinonaktifkan");
  });
});
