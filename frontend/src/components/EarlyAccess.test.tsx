import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { EarlyAccessModal, earlyAccessSeen } from "./EarlyAccess.js";
import * as api from "../api.js";

describe("EarlyAccessModal", () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => vi.restoreAllMocks());

  it("joins the collaboration with the code and names the host whose key is now in use", async () => {
    vi.spyOn(api, "joinCollab").mockResolvedValue({
      hosting: null,
      joined: { host_username: "alfan", shares: { share_ai: 1, share_tts: 0, share_stt: 0 } },
    });

    render(<EarlyAccessModal onClose={() => {}} />);
    fireEvent.change(screen.getByLabelText(/Kode early access/), {
      target: { value: "abc123" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Gunakan kode" }));

    await screen.findByText(/alfan/);
    expect(api.joinCollab).toHaveBeenCalledWith("abc123");
  });

  it("keeps the modal open on a bad code, so the student can retype it", async () => {
    vi.spyOn(api, "joinCollab").mockRejectedValue(new Error("Kode tidak ditemukan"));

    render(<EarlyAccessModal onClose={() => {}} />);
    fireEvent.change(screen.getByLabelText(/Kode early access/), {
      target: { value: "salah" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Gunakan kode" }));

    await screen.findByRole("alert");
    expect(screen.getByLabelText(/Kode early access/)).toBeTruthy();
    expect(earlyAccessSeen()).toBe(false);
  });

  it("shows the welcome only once — skipping marks it seen", async () => {
    const onClose = vi.fn();
    render(<EarlyAccessModal onClose={onClose} />);

    fireEvent.click(screen.getByRole("button", { name: "Lewati" }));

    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(earlyAccessSeen()).toBe(true);
  });
});
