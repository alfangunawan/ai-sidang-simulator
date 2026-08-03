import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { Codes } from "./Codes.js";
import * as adminApi from "../../adminApi.js";

const CODES = [
  {
    id: 1, host_user_id: 1, host_username: "alfan", invite_code: "abc123abc123",
    created_at: "2026-07-01T00:00:00.000Z",
    shares: { share_ai: 1, share_tts: 0, share_stt: 0 },
    members: [{ member_user_id: 2, username: "budi", joined_at: "2026-07-02T00:00:00.000Z" }],
    cost_usd: 0.75, calls: 3,
  },
];

describe("Codes", () => {
  beforeEach(() => {
    vi.spyOn(adminApi, "listCodes").mockResolvedValue(CODES as any);
    vi.spyOn(adminApi, "kickMember").mockResolvedValue(undefined as any);
  });
  afterEach(() => vi.restoreAllMocks());

  it("shows the code, its host, and its members", async () => {
    render(<Codes />);
    expect(await screen.findByText("abc123abc123")).toBeTruthy();
    expect(screen.getByText("alfan")).toBeTruthy();
    expect(screen.getByText("budi")).toBeTruthy();
  });

  it("kicks a member", async () => {
    render(<Codes />);
    fireEvent.click(await screen.findByRole("button", { name: "Tendang budi" }));
    await waitFor(() => expect(adminApi.kickMember).toHaveBeenCalledWith(1, 2));
  });

  it("edits a host's code by hand", async () => {
    const put = vi.spyOn(adminApi, "putCode").mockResolvedValue(undefined as any);
    render(<Codes />);
    fireEvent.click(await screen.findByRole("button", { name: "Ubah kode alfan" }));
    fireEvent.change(screen.getByLabelText("Kode alfan"), { target: { value: " sibiru-2026 " } });
    fireEvent.click(screen.getByRole("button", { name: /^simpan$/i }));
    await waitFor(() => expect(put).toHaveBeenCalledWith(1, "sibiru-2026"));
  });

  it("keeps the form open and shows why the server refused", async () => {
    vi.spyOn(adminApi, "putCode").mockRejectedValue(new Error("Kode akses sudah dipakai"));
    render(<Codes />);
    fireEvent.click(await screen.findByRole("button", { name: "Ubah kode alfan" }));
    fireEvent.change(screen.getByLabelText("Kode alfan"), { target: { value: "sibiru-2026" } });
    fireEvent.click(screen.getByRole("button", { name: /^simpan$/i }));
    expect(await screen.findByText("Kode akses sudah dipakai")).toBeTruthy();
    expect(screen.getByLabelText("Kode alfan")).toBeTruthy();
  });
});
