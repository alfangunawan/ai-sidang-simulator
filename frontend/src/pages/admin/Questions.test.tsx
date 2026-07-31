import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { Questions } from "./Questions.js";
import * as adminApi from "../../adminApi.js";

describe("Questions", () => {
  beforeEach(() => {
    vi.spyOn(adminApi, "getQuestions").mockResolvedValue({
      phases: ["Pembukaan", "Metodologi"],
      bank: { Pembukaan: ["Satu?"], Metodologi: ["Dua?"] },
    } as any);
    vi.spyOn(adminApi, "putQuestions").mockResolvedValue(undefined as any);
  });
  afterEach(() => vi.restoreAllMocks());

  it("edits one phase and saves it as a list of lines", async () => {
    render(<Questions />);
    const box = (await screen.findByLabelText("Pembukaan")) as HTMLTextAreaElement;
    expect(box.value).toBe("Satu?");

    fireEvent.change(box, { target: { value: "Satu?\nTiga?" } });
    fireEvent.click(screen.getByRole("button", { name: "Simpan Pembukaan" }));
    await waitFor(() =>
      expect(adminApi.putQuestions).toHaveBeenCalledWith("Pembukaan", ["Satu?", "Tiga?"]),
    );
  });

  it("normalises the textarea to what was actually saved, and clears the saved flag on edit", async () => {
    render(<Questions />);
    const box = (await screen.findByLabelText("Pembukaan")) as HTMLTextAreaElement;

    fireEvent.change(box, { target: { value: "  Satu?  \n\nDua?\n" } });
    fireEvent.click(screen.getByRole("button", { name: "Simpan Pembukaan" }));
    await waitFor(() =>
      expect(adminApi.putQuestions).toHaveBeenCalledWith("Pembukaan", ["Satu?", "Dua?"]),
    );
    // textarea harus menampilkan persis yang tersimpan di server, bukan input mentah
    expect(box.value).toBe("Satu?\nDua?");
    expect(screen.getByText("Tersimpan.")).toBeTruthy();

    fireEvent.change(box, { target: { value: "Satu?\nDua?\nTiga?" } });
    expect(screen.queryByText("Tersimpan.")).toBeNull();
  });
});
