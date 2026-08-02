import { useEffect, useState } from "react";
import { LogOut } from "lucide-react";
import {
  SessionPage,
  clearStoredSession,
  hasStoredSession,
} from "./pages/SessionPage.js";
import { HomePage } from "./pages/HomePage.js";
import { SettingsPage } from "./pages/SettingsPage.js";
import { HistoryPage } from "./pages/HistoryPage.js";
import { ResultPage } from "./pages/ResultPage.js";
import { AuthPage } from "./pages/AuthPage.js";
import { LandingPage } from "./pages/LandingPage.js";
import { AdminApp } from "./pages/admin/AdminApp.js";
import { SetupModal, type MicState } from "./components/SetupModal.js";
import { SkripsiModal } from "./components/SkripsiModal.js";
import {
  EarlyAccessBanner,
  EarlyAccessModal,
  earlyAccessSeen,
} from "./components/EarlyAccess.js";
import { DEFAULT_PERSONA, PERSONAS, personaFor } from "./personas.js";
import type { Persona } from "./personas.js";
import {
  getResult,
  getSettings,
  getPersonas,
  getSkripsi,
  saveSettings,
  me,
  logout,
  setUnauthorizedHandler,
} from "./api.js";
import type { Assessment, User } from "./types.js";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type Tab = "beranda" | "riwayat" | "pengaturan";

const TABS: { key: Tab; label: string }[] = [
  { key: "beranda", label: "Beranda" },
  { key: "riwayat", label: "Riwayat" },
  { key: "pengaturan", label: "Pengaturan" },
];

export default function App() {
  const [tab, setTab] = useState<Tab>("beranda");
  // Under Beranda the session replaces the dashboard, the way the sidang
  // replaces the waiting room — the tab stays lit either way.
  //
  // Dibuka dari localStorage, bukan `false`: refresh di tengah sidang dulu
  // melempar mahasiswa ke dashboard padahal sesinya masih hidup di server.
  // Sesi yang sudah ditutup selalu menghapus kuncinya, jadi ini hanya menyala
  // untuk sidang yang benar-benar belum selesai.
  const [inSession, setInSession] = useState(hasStoredSession);
  const [result, setResult] = useState<Assessment | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [ready, setReady] = useState(false);
  const [showAuth, setShowAuth] = useState(false);
  const [setup, setSetup] = useState<0 | 1 | 2 | 3>(0);
  // Bab yang diuji sesi berikutnya, diteruskan ke SessionPage yang membuat sesinya.
  const [phases, setPhases] = useState<string[] | undefined>(undefined);
  const [needSkripsi, setNeedSkripsi] = useState(false);
  const [persona, setPersona] = useState<Persona>(DEFAULT_PERSONA);
  // PERSONAS statis jadi nilai awal, fetch menggantinya. Picker dan header
  // sidang karena itu tidak pernah render kosong sambil menunggu jaringan.
  const [personas, setPersonas] = useState<Persona[]>(PERSONAS);
  const [mic, setMic] = useState<MicState>("idle");
  const [starting, setStarting] = useState(false);
  const [historyOpenId, setHistoryOpenId] = useState<string | null>(null);
  const [welcome, setWelcome] = useState(() => !earlyAccessSeen());
  // Remounts SessionPage so it picks up the session it is meant to run.
  const [sitting, setSitting] = useState(0);
  const [resumable, setResumable] = useState(() => hasStoredSession());

  useEffect(() => {
    setUnauthorizedHandler(() => setUser(null));
    me().then(setUser).catch(() => setUser(null)).finally(() => setReady(true));
  }, []);

  // The picker opens on whoever ran last, so "Sesi Baru" with the same examiner
  // is two clicks rather than a hunt through six cards.
  useEffect(() => {
    if (!user) return;
    getSettings()
      .then((s) => setPersona(personaFor(personas, s.examiner_mode, s.examiner_type ?? "umum")))
      .catch(() => {});
  }, [user, personas]);

  useEffect(() => {
    if (!user) return;
    // Nilai kosong dari server tidak boleh mengosongkan picker: PERSONAS
    // statis tetap jadi jaring pengaman kalau tabel personas pernah kosong.
    getPersonas()
      .then((list) => {
        if (list.length > 0) setPersonas(list);
      })
      .catch(() => {});
  }, [user]);

  // Every road into a sidang goes through here, so the missing-naskah blocker is
  // asked once, at the door — not at the student's first recording, when the
  // sitting has already begun.
  async function openSetup(step: 1 | 3 = 1) {
    setResumable(hasStoredSession());
    // Bukan sekadar "naskah ada": tanpa dossier siap, giliran pertama pasti
    // ditolak server, dan mahasiswa baru tahu setelah sidang dimulai. Modal
    // naskah satu-satunya tempat yang bisa memperbaikinya.
    if (step === 1) {
      const s = await getSkripsi().catch(() => null);
      if (s?.dossier_status !== "ready") {
        setNeedSkripsi(true);
        return;
      }
    }
    setSetup(step);
  }

  function goHome() {
    setInSession(false);
    setResumable(hasStoredSession());
    setTab("beranda");
  }

  async function startSession(p: Persona, picked: string[]) {
    setStarting(true);
    try {
      await saveSettings({ examiner_mode: p.mode, examiner_type: p.type });
    } catch {
      // The examiner falls back to whatever was already saved; the sidang can
      // still run, so this is not worth blocking on.
    }
    setPersona(p);
    setPhases(picked);
    setStarting(false);
    clearStoredSession();
    setSitting((n) => n + 1);
    setResult(null);
    setSetup(0);
    setTab("beranda");
    setInSession(true);
  }

  function showResult(a: Assessment) {
    setResult(a);
    setInSession(false);
    setTab("riwayat");
  }

  async function openResult(id: string) {
    try {
      const r = await getResult(id);
      if (r.assessment) {
        setResult(r.assessment);
        setTab("riwayat");
      }
    } catch {
      // ignore; stay on history
    }
  }

  function goTab(next: Tab) {
    setResult(null);
    setTab(next);
    if (next === "beranda") setResumable(hasStoredSession());
  }

  if (!ready) return <div className="min-h-dvh bg-background" />;
  if (!user) {
    return showAuth ? (
      <AuthPage onAuthed={setUser} onBack={() => setShowAuth(false)} />
    ) : (
      <LandingPage onStart={() => setShowAuth(true)} />
    );
  }

  // Panel admin punya kerangka sendiri: tab mahasiswa tidak berlaku di sini.
  // Ditaruh SESUDAH gerbang login supaya pengunjung /admin yang belum masuk
  // tetap melihat halaman login, bukan lemparan balik yang membingungkan.
  if (window.location.pathname.startsWith("/admin")) {
    if (!user.is_admin) {
      window.location.replace("/");
      return null;
    }
    return <AdminApp user={user} />;
  }

  return (
    <div className="min-h-dvh bg-background">
      <header className="sticky top-0 z-40 border-b bg-card/85 backdrop-blur-sm no-print">
        {/* Narrow screens cannot hold brand + three tabs + sign-out on one line,
            so the tab bar drops to its own full-width row below. `order` does the
            rearranging, which keeps the DOM in reading order on every width. */}
        <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center gap-x-3 gap-y-3 px-4 py-3">
          <div className="order-1 flex min-w-0 items-center gap-2.5">
            <img src="/sibiru-icon.svg" alt="" width={34} height={34} className="shrink-0" />
            <div className="min-w-0 leading-tight">
              <h1 className="font-serif text-lg font-semibold tracking-tight">SiBiru</h1>
              <p className="truncate text-[11px] text-muted-foreground">
                Simulator Sidang Skripsi
              </p>
            </div>
          </div>

          <nav className="order-3 flex w-full items-center gap-1 rounded-lg bg-muted p-1 sm:order-2 sm:ml-2 sm:w-auto">
            {TABS.map((t) => (
              <button
                key={t.key}
                onClick={() => goTab(t.key)}
                aria-current={tab === t.key ? "page" : undefined}
                className={cn(
                  "flex-1 rounded-md px-3 py-1.5 text-sm font-medium transition-colors sm:flex-none",
                  tab === t.key
                    ? "bg-card text-foreground shadow-xs"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {t.label}
              </button>
            ))}
          </nav>

          <span className="order-4 ml-auto hidden max-w-40 truncate text-sm text-muted-foreground sm:order-3 sm:inline">
            {user.username}
          </span>
          <Button
            variant="ghost"
            size="sm"
            className="order-2 ml-auto sm:order-4 sm:ml-0"
            onClick={async () => {
              try {
                await logout();
              } finally {
                setUser(null);
              }
            }}
          >
            <LogOut />
            Keluar
          </Button>
        </div>
      </header>

      <EarlyAccessBanner className="no-print" onEnterCode={() => setWelcome(true)} />

      <main className="mx-auto w-full max-w-6xl px-4 py-8">
        {tab === "beranda" &&
          (inSession ? (
            <SessionPage
              key={sitting}
              personas={personas}
              phases={phases}
              onClosed={showResult}
              onNewSession={() => {
                goHome();
                openSetup(1);
              }}
            />
          ) : (
            <HomePage
              mic={mic}
              resumable={resumable}
              onStart={() => openSetup(1)}
              onResume={() => setInSession(true)}
              onOpenHistory={() => goTab("riwayat")}
              onOpenSession={(id) => {
                setHistoryOpenId(id);
                goTab("riwayat");
              }}
              onOpenSettings={() => goTab("pengaturan")}
              onTestMic={() => openSetup(3)}
            />
          ))}

        {tab === "riwayat" &&
          (result ? (
            <ResultPage
              assessment={result}
              onNewSession={() => {
                setResult(null);
                goHome();
                openSetup(1);
              }}
              onBack={() => setResult(null)}
            />
          ) : (
            <HistoryPage
              onOpenResult={openResult}
              openId={historyOpenId}
              onOpened={() => setHistoryOpenId(null)}
            />
          ))}

        {tab === "pengaturan" && <SettingsPage />}
      </main>

      {welcome && <EarlyAccessModal onClose={() => setWelcome(false)} />}

      {needSkripsi && (
        <SkripsiModal
          onClose={() => setNeedSkripsi(false)}
          onReady={() => {
            setNeedSkripsi(false);
            setSetup(1);
          }}
        />
      )}

      {setup !== 0 && (
        <SetupModal
          step={setup}
          initial={persona}
          personas={personas}
          mic={mic}
          starting={starting}
          onStep={setSetup}
          onMic={setMic}
          onStart={startSession}
        />
      )}
    </div>
  );
}
