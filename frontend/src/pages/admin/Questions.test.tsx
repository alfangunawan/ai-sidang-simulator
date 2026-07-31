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
});
