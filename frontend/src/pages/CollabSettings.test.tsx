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
    await screen.findByText(/host/i);
  });

  it("shows host invite code + share toggles when hosting", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(
      jsonRes({ hosting: { invite_code: "deadbeefdead", shares: { share_ai: 1, share_tts: 0, share_stt: 0 }, members: [], usage: { total: { calls: 0 }, by_member: [] } }, joined: null }),
    ) as any;
    render(<CollabSettings />);
    expect(await screen.findByText("deadbeefdead")).toBeTruthy();
    expect(screen.getByLabelText(/bagikan ai/i)).toBeTruthy();
  });
});
