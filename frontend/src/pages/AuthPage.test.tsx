import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { AuthPage } from "./AuthPage.js";

beforeEach(() => {
  globalThis.fetch = vi.fn(async () =>
    new Response(JSON.stringify({ user: { id: 1, username: "alfan", is_admin: true } }), {
      status: 200, headers: { "Content-Type": "application/json" },
    }),
  ) as any;
});

describe("AuthPage", () => {
  // The backend gap fix exists so /auth/login carries is_admin all the way
  // through; this pins AuthPage to actually forward it rather than dropping
  // it on the way to onAuthed.
  it("logs in and calls onAuthed with the full user, including is_admin", async () => {
    const onAuthed = vi.fn();
    render(<AuthPage onAuthed={onAuthed} />);
    fireEvent.change(screen.getByLabelText(/username/i), { target: { value: "alfan" } });
    fireEvent.change(screen.getByLabelText(/password/i), { target: { value: "password1" } });
    fireEvent.click(screen.getByRole("button", { name: /masuk/i }));
    await waitFor(() =>
      expect(onAuthed).toHaveBeenCalledWith({ id: 1, username: "alfan", is_admin: true }),
    );
    expect((globalThis.fetch as any).mock.calls[0][0]).toBe("/api/auth/login");
  });

  it("switches to register mode and posts to /api/auth/register", async () => {
    const onAuthed = vi.fn();
    render(<AuthPage onAuthed={onAuthed} />);
    fireEvent.click(screen.getByRole("button", { name: /daftar di sini/i }));
    fireEvent.change(screen.getByLabelText(/username/i), { target: { value: "baru" } });
    fireEvent.change(screen.getByLabelText(/password/i), { target: { value: "password1" } });
    fireEvent.click(screen.getByRole("button", { name: /buat akun/i }));
    await waitFor(() => expect(onAuthed).toHaveBeenCalled());
    expect((globalThis.fetch as any).mock.calls[0][0]).toBe("/api/auth/register");
  });
});
