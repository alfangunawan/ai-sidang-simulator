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

// api_key is not a real field of AdminUserDetail.settings — it stands in for
// a hypothetical leak, mirroring backend/test/admin.users.test.ts's
// "reports key presence but never key material" guard on the same endpoint.
const DETAIL = {
  user: ROWS[1],
  settings: {
    provider: "claude", model: "claude-sonnet-5", base_url: "",
    has_api_key: true, attack_points: "", examiner_mode: "standar",
    examiner_modes: [], examiner_type: "umum", examiner_types: [],
    tts_provider: "browser", tts_voice: "", has_google_tts_key: false,
    has_openai_tts_key: false, stt_provider: "browser", has_openai_stt_key: false,
    api_key: "sk-ant-SECRETVALUE",
  },
  sessions: [
    { id: "s1", created_at: "2026-07-02T10:00:00.000Z", status: "closed", turn_count: 12 },
  ],
  documents: [
    { id: 1, filename: "skripsi.pdf", char_count: 302447, dossier_status: "ready" },
  ],
};

// Aksi merusak hidup di balik menu kebab: Radix membukanya pada pointerdown,
// bukan click (pola yang sama dipakai Select, lihat test-setup.ts).
async function openMenu(username: string) {
  fireEvent.pointerDown(screen.getByRole("button", { name: `Aksi lain untuk ${username}` }), {
    button: 0,
    ctrlKey: false,
    pointerType: "mouse",
  });
  await screen.findByRole("menu");
}

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
    await openMenu("budi");
    fireEvent.click(screen.getByRole("menuitem", { name: "Tangguhkan budi" }));
    await waitFor(() =>
      expect(adminApi.patchUser).toHaveBeenCalledWith(2, { suspended: true }),
    );
  });

  // Hapus itu tak bisa dibatalkan dan membawa serta seluruh transkrip serta
  // naskah orang, jadi tombolnya tidak boleh cukup diklik sekali.
  it("requires the username to be typed before deleting", async () => {
    render(<Users selfId={1} />);
    await screen.findByText("budi");
    await openMenu("budi");
    fireEvent.click(screen.getByRole("menuitem", { name: "Hapus budi" }));

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
    // Menunya sendiri tidak ada, jadi tidak ada jalan menuju aksi merusaknya.
    expect(screen.queryByRole("button", { name: "Aksi lain untuk alfan" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Aksi lain untuk budi" })).toBeTruthy();
  });

  it("opens the detail dialog by id and shows sessions, documents, and key presence as booleans only", async () => {
    vi.spyOn(adminApi, "getUserDetail").mockResolvedValue(DETAIL as any);
    render(<Users selfId={1} />);
    await screen.findByText("budi");

    fireEvent.click(screen.getByRole("button", { name: "Detail budi" }));
    await waitFor(() => expect(adminApi.getUserDetail).toHaveBeenCalledWith(2));

    expect(await screen.findByText("skripsi.pdf")).toBeTruthy();
    expect(screen.getByText(/302.447 karakter/)).toBeTruthy();
    expect(screen.getByText(/API key LLM: Terisi/)).toBeTruthy();
    expect(screen.getByText(/API key TTS Google: Kosong/)).toBeTruthy();

    // Presence only — never the key material, even if it somehow arrived on
    // the wire (see backend/test/admin.users.test.ts's matching guard).
    expect(document.body.textContent).not.toContain("SECRETVALUE");
  });
});
