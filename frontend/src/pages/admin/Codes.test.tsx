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
});
