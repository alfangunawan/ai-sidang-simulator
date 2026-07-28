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
    expect(await screen.findByText("deadbeefdead")).toBeTruthy();
    // three share toggles (AI / Suara / Diktasi) render for a host
    expect(screen.getAllByRole("checkbox")).toHaveLength(3);
    expect((screen.getByRole("checkbox", { name: /AI/ }) as HTMLInputElement).checked).toBe(true);
  });

  it("shows both the host panel and the joined panel when a user hosts AND is joined elsewhere", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(
      jsonRes({
        hosting: { invite_code: "cafebabecafe", shares: { share_ai: 1, share_tts: 0, share_stt: 0 }, members: [], usage: { total: { calls: 0 }, by_member: [] } },
        joined: { host_username: "otherhost", shares: { share_ai: 0, share_tts: 1, share_stt: 0 } },
      }),
    ) as any;
    render(<CollabSettings />);
    expect(await screen.findByText("cafebabecafe")).toBeTruthy();
    expect(await screen.findByText(/otherhost/i)).toBeTruthy();
    // both panels' own actions are present — not mutually exclusive
    expect(screen.getByRole("button", { name: /bubarkan/i })).toBeTruthy();
    expect(screen.getByRole("button", { name: /^keluar$/i })).toBeTruthy();
  });
});
