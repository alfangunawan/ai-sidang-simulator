import { useState } from "react";
import {
  ArrowLeft, ChartColumn, FileQuestion, KeyRound, MessageSquare, UserCog, Users as UsersIcon,
} from "lucide-react";
import { Overview } from "./Overview.js";
import { Users } from "./Users.js";
import { Sessions } from "./Sessions.js";
import { Codes } from "./Codes.js";
import { Questions } from "./Questions.js";
import { Personas } from "./Personas.js";
import { Avatar, EYEBROW, Panel } from "./ui.js";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { User } from "../../types.js";

type Section = "ringkasan" | "pengguna" | "sesi" | "kode" | "pertanyaan" | "persona";

const SECTIONS: { key: Section; label: string; icon: typeof UsersIcon }[] = [
  { key: "ringkasan", label: "Ringkasan", icon: ChartColumn },
  { key: "pengguna", label: "Pengguna", icon: UsersIcon },
  { key: "sesi", label: "Sesi", icon: MessageSquare },
  { key: "kode", label: "Kode Akses", icon: KeyRound },
  { key: "pertanyaan", label: "Bank Pertanyaan", icon: FileQuestion },
  { key: "persona", label: "Persona", icon: UserCog },
];

/**
 * Navigasi antar bagian pakai state, bukan URL. Deep link seperti
 * /admin/users/42 sengaja belum didukung — tambahkan kalau debug jadi repot.
 */
export function AdminApp({ user }: { user: User }) {
  const [section, setSection] = useState<Section>("ringkasan");
  // Angka di samping menu datang dari bagian yang sudah termuat, bukan dari
  // permintaan terpisah: Ringkasan (tab awal) sudah membawa jumlah pengguna
  // dan sesi, sisanya terisi begitu bagiannya pernah dibuka.
  const [counts, setCounts] = useState<Partial<Record<Section, number>>>({});
  const count = (key: Section) => (n: number) =>
    setCounts((c) => (c[key] === n ? c : { ...c, [key]: n }));

  return (
    <div className="min-h-dvh bg-background">
      <header className="sticky top-0 z-30 border-b bg-card/90 backdrop-blur-md">
        <div className="mx-auto flex h-16 w-full max-w-[1460px] items-center gap-3 px-4 md:px-7">
          <span className="flex size-[34px] items-center justify-center rounded-[10px] bg-linear-150 from-blue-500 to-blue-700 shadow-lg shadow-primary/25">
            <svg width="21" height="21" viewBox="0 0 48 48" fill="none" aria-hidden="true">
              <path
                d="M11 9a3 3 0 0 1 3-3h12.5L37 16.5V33a3 3 0 0 1-3 3H14a3 3 0 0 1-3-3z"
                fill="#fff"
                fillOpacity=".55"
              />
              <path d="M26.5 6 37 16.5h-8.5a2 2 0 0 1-2-2z" fill="#fff" />
              <path
                d="M17 31h18a3 3 0 0 1 3 3v6a3 3 0 0 1-3 3h-9.5l-6 4.2a.6.6 0 0 1-.94-.5V43H17a3 3 0 0 1-3-3v-6a3 3 0 0 1 3-3z"
                fill="#fff"
              />
            </svg>
          </span>
          <h1 className="font-serif text-xl font-semibold tracking-tight">SiBiru</h1>
          <span className={cn(EYEBROW, "rounded-md bg-primary/10 px-2 py-0.5 text-primary")}>
            Admin
          </span>

          <div className="ml-auto flex items-center gap-2">
            <span className="hidden items-center gap-2 rounded-full border bg-card py-1 pr-3 pl-1.5 sm:flex">
              <Avatar className="size-[26px] bg-primary/10 text-primary">
                {user.username.slice(0, 1).toUpperCase()}
              </Avatar>
              <span className="flex flex-col leading-tight">
                <span className="text-xs font-bold tracking-tight">{user.username}</span>
                <span className={cn(EYEBROW, "text-[9.5px]")}>Administrator</span>
              </span>
            </span>
            <Button variant="outline" size="sm" onClick={() => window.location.assign("/")}>
              <ArrowLeft />
              Aplikasi
            </Button>
          </div>
        </div>
      </header>

      <div className="mx-auto grid w-full max-w-[1460px] items-start gap-6 px-4 py-6 pb-24 md:grid-cols-[232px_minmax(0,1fr)] md:gap-7 md:px-7">
        <Panel className="p-2.5 md:sticky md:top-[88px]">
          <span className={cn(EYEBROW, "hidden px-2.5 pt-1.5 pb-2 md:block")}>Kelola</span>
          <nav aria-label="Bagian admin" className="flex gap-0.5 overflow-x-auto md:flex-col">
            {SECTIONS.map((s) => {
              const on = section === s.key;
              const n = counts[s.key];
              return (
                <button
                  key={s.key}
                  onClick={() => setSection(s.key)}
                  aria-current={on ? "page" : undefined}
                  className={cn(
                    "flex w-full items-center gap-2.5 rounded-[10px] px-3 py-2.5 text-left text-[13.5px] tracking-tight whitespace-nowrap transition-colors",
                    on
                      ? "bg-primary/10 font-bold text-primary"
                      : "font-medium text-foreground/70 hover:bg-accent",
                  )}
                >
                  <s.icon className="size-[15px] opacity-85" />
                  {s.label}
                  {n !== undefined && (
                    // aria-hidden: nama aksesibel tombol harus tetap "Pengguna",
                    // bukan "Pengguna 12" — angkanya hiasan, bukan label.
                    <span
                      aria-hidden="true"
                      className={cn(
                        "ml-auto pl-2 text-[11.5px] font-bold tabular-nums",
                        on ? "text-primary" : "text-muted-foreground/70",
                      )}
                    >
                      {n}
                    </span>
                  )}
                </button>
              );
            })}
          </nav>
        </Panel>

        <main className="min-w-0">
          {section === "ringkasan" && (
            <Overview onCounts={(c) => setCounts((prev) => ({ ...prev, ...c }))} />
          )}
          {section === "pengguna" && <Users selfId={user.id} onCount={count("pengguna")} />}
          {section === "sesi" && <Sessions onCount={count("sesi")} />}
          {section === "kode" && <Codes onCount={count("kode")} />}
          {section === "pertanyaan" && <Questions onCount={count("pertanyaan")} />}
          {section === "persona" && <Personas onCount={count("persona")} />}
        </main>
      </div>
    </div>
  );
}
