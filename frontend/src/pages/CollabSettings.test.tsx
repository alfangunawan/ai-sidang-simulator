import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { CollabSettings } from "./CollabSettings.js";

function jsonRes(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

describe("CollabSettings", () => {
  beforeEach(() => { vi.restoreAllMocks(); });

  it("shows the join form when not hosting and not joined, and joins by code", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonRes({ hosting: null, joined: null }))       // initial getCollab
      .mockResolvedValueOnce(jsonRes({ joined: { host_username: "host", shares: { share_ai: 1, share_tts: 0, share_stt: 0 } } })); // join
    globalThis.fetch = fetchMock as any;

    render(<CollabSettings />);
    await screen.findByLabelText(/kode undangan/i);
    fireEvent.change(screen.getByLabelText(/kode undangan/i), { target: { value: "abc123abc123" } });
    fireEvent.click(screen.getByRole("button", { name: /gabung/i }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith("/api/collab/join", expect.objectContaining({ method: "POST" })));
    // Hosting and joining now render independently (a non-host can still see
    // "Jadi host"), so anchor on the joined confirmation line itself rather
    // than the ambiguous substring "host" (which "Jadi host" also contains).
    await screen.findByText(/tergabung dengan/i);
  });

  it("shows host invite code + share toggles when hosting", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(
      jsonRes({ hosting: { invite_code: "deadbeefdead", shares: { share_ai: 1, share_tts: 0, share_stt: 0 }, members: [], usage: { total: { calls: 0 }, by_member: [] } }, joined: null }),
    ) as any;
    render(<CollabSettings />);
    // The host's code is an editable Input now, so it lives in a value, not in text.
    expect(await screen.findByDisplayValue("deadbeefdead")).toBeTruthy();
    // three share toggles (AI / Suara / Diktasi) render for a host
    expect(screen.getAllByRole("checkbox")).toHaveLength(3);
    // The toggle is a Radix checkbox (a <button role="checkbox">), so its state
    // lives in aria-checked rather than an input's .checked property.
    expect(screen.getByRole("checkbox", { name: /AI/ }).getAttribute("aria-checked")).toBe("true");
  });

  it("lets the host rewrite its own code, and surfaces the server's rejection", async () => {
    const hosting = { invite_code: "deadbeefdead", shares: { share_ai: 0, share_tts: 0, share_stt: 0 }, members: [], usage: { total: { calls: 0 }, by_member: [] } };
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonRes({ hosting, joined: null }))                       // initial getCollab
      .mockResolvedValueOnce(jsonRes({ error: "Kode akses sudah dipakai" }, 409))      // taken
      .mockResolvedValueOnce(jsonRes({ hosting: { ...hosting, invite_code: "sibiru-2026" } })); // saved
    globalThis.fetch = fetchMock as any;

    render(<CollabSettings />);
    const input = await screen.findByLabelText(/kode undangan anda/i);
    const save = () => screen.getByRole("button", { name: /^simpan$/i });

    // Unchanged code is not a save — the button stays dead until the draft moves.
    expect((save() as HTMLButtonElement).disabled).toBe(true);

    fireEvent.change(input, { target: { value: "sibiru-2026" } });
    fireEvent.click(save());
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith("/api/collab/code", expect.objectContaining({ method: "PUT" })),
    );
    expect(await screen.findByText("Kode akses sudah dipakai")).toBeTruthy();

    fireEvent.click(save());
    expect(await screen.findByDisplayValue("sibiru-2026")).toBeTruthy();
    await waitFor(() => expect((save() as HTMLButtonElement).disabled).toBe(true));
  });

  it("shows both the host panel and the joined panel when a user hosts AND is joined elsewhere", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(
      jsonRes({
        hosting: { invite_code: "cafebabecafe", shares: { share_ai: 1, share_tts: 0, share_stt: 0 }, members: [], usage: { total: { calls: 0 }, by_member: [] } },
        joined: { host_username: "otherhost", shares: { share_ai: 0, share_tts: 1, share_stt: 0 } },
      }),
    ) as any;
    render(<CollabSettings />);
    expect(await screen.findByDisplayValue("cafebabecafe")).toBeTruthy();
    expect(await screen.findByText(/otherhost/i)).toBeTruthy();
    // both panels' own actions are present — not mutually exclusive
    expect(screen.getByRole("button", { name: /bubarkan/i })).toBeTruthy();
    expect(screen.getByRole("button", { name: /^keluar$/i })).toBeTruthy();
  });
});
