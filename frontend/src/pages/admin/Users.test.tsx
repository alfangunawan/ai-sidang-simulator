import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { Users } from "./Users.js";
import * as adminApi from "../../adminApi.js";

const ROWS = [
  {
    id: 1, username: "alfan", created_at: "2026-07-01T00:00:00.000Z",
    suspended: false, is_admin: true, sessions: 2, documents: 1,
    cost_usd: 0, tokens: 500, key_owner: null,
  },
  {
    id: 2, username: "budi", created_at: "2026-07-02T00:00:00.000Z",
    suspended: false, is_admin: false, sessions: 5, documents: 1,
    cost_usd: 1.25, tokens: 9000, key_owner: "alfan",
  },
];

describe("Users", () => {
  beforeEach(() => {
    vi.spyOn(adminApi, "listUsers").mockResolvedValue(ROWS as any);
    vi.spyOn(adminApi, "patchUser").mockResolvedValue(undefined as any);
    vi.spyOn(adminApi, "deleteUser").mockResolvedValue(undefined as any);
  });
  afterEach(() => vi.restoreAllMocks());

  it("renders a row per user with who lends them a key", async () => {
    render(<Users selfId={1} />);
    expect(await screen.findByText("budi")).toBeTruthy();
    expect(screen.getByText("alfan (key)")).toBeTruthy();
  });

  it("suspends a user", async () => {
    render(<Users selfId={1} />);
    await screen.findByText("budi");
    fireEvent.click(screen.getByRole("button", { name: "Tangguhkan budi" }));
    await waitFor(() =>
      expect(adminApi.patchUser).toHaveBeenCalledWith(2, { suspended: true }),
    );
  });

  // Hapus itu tak bisa dibatalkan dan membawa serta seluruh transkrip serta
  // naskah orang, jadi tombolnya tidak boleh cukup diklik sekali.
  it("requires the username to be typed before deleting", async () => {
    render(<Users selfId={1} />);
    await screen.findByText("budi");
    fireEvent.click(screen.getByRole("button", { name: "Hapus budi" }));

    const confirm = await screen.findByRole("button", { name: "Hapus permanen" });
    expect(confirm.hasAttribute("disabled")).toBe(true);

    fireEvent.change(screen.getByLabelText(/Ketik username/), { target: { value: "bud" } });
    expect(screen.getByRole("button", { name: "Hapus permanen" }).hasAttribute("disabled")).toBe(true);

    fireEvent.change(screen.getByLabelText(/Ketik username/), { target: { value: "budi" } });
    fireEvent.click(screen.getByRole("button", { name: "Hapus permanen" }));
    await waitFor(() => expect(adminApi.deleteUser).toHaveBeenCalledWith(2));
  });

  it("offers no destructive action against yourself", async () => {
    render(<Users selfId={1} />);
    await screen.findByText("alfan");
    expect(screen.queryByRole("button", { name: "Hapus alfan" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Tangguhkan alfan" })).toBeNull();
  });
});
