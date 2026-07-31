import { useState } from "react";
import { ArrowLeft } from "lucide-react";
import { Overview } from "./Overview.js";
import { Users } from "./Users.js";
import { Sessions } from "./Sessions.js";
import { Codes } from "./Codes.js";
import { Questions } from "./Questions.js";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { User } from "../../types.js";

type Section = "ringkasan" | "pengguna" | "sesi" | "kode" | "pertanyaan" | "persona";

const SECTIONS: { key: Section; label: string }[] = [
  { key: "ringkasan", label: "Ringkasan" },
  { key: "pengguna", label: "Pengguna" },
  { key: "sesi", label: "Sesi" },
  { key: "kode", label: "Kode Akses" },
  { key: "pertanyaan", label: "Bank Pertanyaan" },
  { key: "persona", label: "Persona" },
];

/**
 * Navigasi antar bagian pakai state, bukan URL. Deep link seperti
 * /admin/users/42 sengaja belum didukung — tambahkan kalau debug jadi repot.
 */
export function AdminApp({ user }: { user: User }) {
  const [section, setSection] = useState<Section>("ringkasan");

  return (
    <div className="min-h-dvh bg-background">
      <header className="border-b bg-card">
        <div className="mx-auto flex w-full max-w-6xl items-center gap-3 px-4 py-3">
          <h1 className="font-serif text-lg font-semibold tracking-tight">SiBiru Admin</h1>
          <span className="ml-auto text-sm text-muted-foreground">{user.username}</span>
          <Button variant="ghost" size="sm" onClick={() => window.location.assign("/")}>
            <ArrowLeft />
            Aplikasi
          </Button>
        </div>
      </header>

      <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-6 md:flex-row">
        <aside className="md:w-48 md:shrink-0">
          <nav className="flex gap-1 overflow-x-auto md:flex-col">
            {SECTIONS.map((s) => (
              <button
                key={s.key}
                onClick={() => setSection(s.key)}
                aria-current={section === s.key ? "page" : undefined}
                className={cn(
                  "whitespace-nowrap rounded-md px-3 py-2 text-left text-sm font-medium transition-colors",
                  section === s.key
                    ? "bg-muted text-foreground"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {s.label}
              </button>
            ))}
          </nav>
        </aside>

        <main className="min-w-0 flex-1">
          {section === "ringkasan" && <Overview />}
          {section === "pengguna" && <Users selfId={user.id} />}
          {section === "sesi" && <Sessions />}
          {section === "kode" && <Codes />}
          {section === "pertanyaan" && <Questions />}
          {!["ringkasan", "pengguna", "sesi", "kode", "pertanyaan"].includes(section) && (
            <p className="text-sm text-muted-foreground">Bagian ini belum dibuat.</p>
          )}
        </main>
      </div>
    </div>
  );
}
