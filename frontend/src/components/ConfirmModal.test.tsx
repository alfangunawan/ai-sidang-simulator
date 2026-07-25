import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ConfirmModal } from "./ConfirmModal.js";

describe("ConfirmModal", () => {
  it("uses default labels when none are given", () => {
    render(
      <ConfirmModal open title="t" message="m" onConfirm={() => {}} onCancel={() => {}} />,
    );
    expect(screen.getByText("Ya, hapus")).toBeTruthy();
    expect(screen.getByText("Batal")).toBeTruthy();
  });

  it("renders custom labels and wires callbacks", () => {
    const onConfirm = vi.fn();
    const onCancel = vi.fn();
    render(
      <ConfirmModal
        open
        title="Akhiri sidang?"
        message="m"
        confirmLabel="Akhiri & lihat hasil"
        cancelLabel="Lanjut bertanya"
        onConfirm={onConfirm}
        onCancel={onCancel}
      />,
    );
    fireEvent.click(screen.getByText("Akhiri & lihat hasil"));
    fireEvent.click(screen.getByText("Lanjut bertanya"));
    expect(onConfirm).toHaveBeenCalledOnce();
    expect(onCancel).toHaveBeenCalledOnce();
  });
});
