import { useEffect, useRef, useState } from "react";
import { PERSONAS, DEFAULT_PERSONA, heatOf, heatLabel, TYPE_LABELS } from "../personas.js";
import type { Persona } from "../personas.js";
import { useAudioLevel } from "../hooks/useAudioLevel.js";

export type MicState = "idle" | "ok" | "fail";

const RULES = [
  "Penguji bertanya langsung dari naskah PDF Anda — bab, tabel, dan angka yang benar-benar ada di sana.",
  "Jawab dengan suara lewat tombol Rekam, atau ketik bila situasinya tidak memungkinkan.",
  "Jawaban dangkal akan dikejar sampai Anda menyebut data spesifik; boleh berhenti sejenak untuk berpikir.",
  "Sidang ditutup saat penguji merasa cukup atau saat Anda menekan Akhiri Sidang — penilaian muncul setelahnya.",
];

const PRIVACY = [
  "Rekaman suara hanya dipakai untuk menyusun transkrip sesi ini.",
  "Naskah dan transkrip tersimpan di server lokal Anda, tidak dibagikan ke pihak lain.",
  "Anda bisa menutup sesi kapan saja lewat tombol Akhiri Sidang.",
];

const MIC_BARS = Array.from({ length: 24 }, (_, i) => ({
  height: 8 + ((i * 5) % 20),
  delay: (i * 0.05).toFixed(2),
  duration: (0.6 + (i % 5) * 0.12).toFixed(2),
}));

const TEST_MS = 4000;
// Room tone alone sits well under this; a voice at normal volume clears it.
const HEARD = 0.02;

interface Props {
  step: 1 | 2;
  initial: Persona;
  mic: MicState;
  starting: boolean;
  onStep: (step: 0 | 1 | 2) => void;
  onMic: (state: MicState) => void;
  onStart: (persona: Persona) => void;
}

export function SetupModal({ step, initial, mic, starting, onStep, onMic, onStart }: Props) {
  const [pending, setPending] = useState<Persona>(initial ?? DEFAULT_PERSONA);
  const [testing, setTesting] = useState(false);
  const audio = useAudioLevel(testing);
  const peak = useRef(0);

  // A mic test is four seconds of listening: if nothing ever crosses the floor,
  // the student is told now rather than after the examiner's first question.
  useEffect(() => {
    if (!testing) return;
    peak.current = 0;
    const poll = setInterval(() => {
      peak.current = Math.max(peak.current, audio.getLevel());
    }, 100);
    const done = setTimeout(() => {
      setTesting(false);
      onMic(peak.current > HEARD ? "ok" : "fail");
    }, TEST_MS);
    return () => {
      clearInterval(poll);
      clearTimeout(done);
    };
  }, [testing]);

  const micNote = testing
    ? "Bicara sekarang…"
    : mic === "ok"
      ? "✓ Mikrofon terdengar jelas"
      : mic === "fail"
        ? "Tidak terdengar — periksa izin mikrofon browser."
        : audio.supported
          ? "Belum diuji"
          : "Perangkat ini tidak mendukung perekaman.";

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label="Siapkan sidang">
      <div className="modal sheet">
        <div className="sheet-head">
          <div className="sheet-title">
            <span className="eyebrow">Langkah {step} dari 2</span>
            <h3>{step === 1 ? "Pilih dosen penguji Anda" : "Cek kesiapan Anda"}</h3>
          </div>
          <div className="sheet-dots" aria-hidden="true">
            <i className="on" />
            <i className={step === 2 ? "on" : ""} />
          </div>
          <button className="ghost sheet-x" aria-label="Tutup" onClick={() => onStep(0)}>
            ✕
          </button>
        </div>

        <div className="sheet-body">
          {step === 1 ? (
            <>
              <p className="sheet-lead">
                Tiap penguji punya gaya menekan dan bidang yang dikejar sendiri. Pilih
                satu — ia yang akan menemani Anda sepanjang sidang.
              </p>
              <div className="persona-grid">
                {PERSONAS.map((p) => {
                  const on = p.key === pending.key;
                  const heat = heatOf(p);
                  return (
                    <button
                      key={p.key}
                      type="button"
                      className={`persona-card ${on ? "on" : ""}`}
                      aria-pressed={on}
                      onClick={() => setPending(p)}
                    >
                      <div className="persona-top">
                        <div className="persona-avatar" style={{ background: p.color }}>
                          {p.initials}
                        </div>
                        <div className="persona-id">
                          <span className="persona-name">{p.name}</span>
                          <span className="persona-role">{p.role}</span>
                        </div>
                        <span className="persona-pick" aria-hidden="true" />
                      </div>
                      <span className="persona-trait">{p.trait}</span>
                      <div className="persona-foot">
                        <span className={`heat heat-${heat}`} aria-hidden="true">
                          <i /><i /><i /><i />
                        </span>
                        <span className="heat-label">{heatLabel(p)}</span>
                        <span className="persona-type">{TYPE_LABELS[p.type] ?? p.type}</span>
                      </div>
                    </button>
                  );
                })}
              </div>
            </>
          ) : (
            <div className="stack-lg">
              <ol className="rules">
                {RULES.map((text, i) => (
                  <li key={i}>
                    <span className="rule-n">{String(i + 1).padStart(2, "0")}</span>
                    <span>{text}</span>
                  </li>
                ))}
              </ol>

              <div className="mic-test">
                <div className="mic-test-head">
                  <div>
                    <div className="mic-test-title">
                      Tes mikrofon <span>— opsional, 4 detik</span>
                    </div>
                    <div className="mic-test-sub">
                      Bicara seperti biasa untuk memastikan suara Anda terdengar jelas
                      sebelum sidang dimulai.
                    </div>
                  </div>
                  <button
                    className={`rec ${testing ? "on" : ""}`}
                    disabled={testing || !audio.supported}
                    onClick={() => setTesting(true)}
                  >
                    {testing ? "Merekam…" : mic === "idle" ? "Tes Mic" : "Ulangi tes"}
                  </button>
                </div>
                <div className="mic-test-meter">
                  <div className={`wave ${testing ? "on" : ""}`} aria-hidden="true">
                    {MIC_BARS.map((b, i) => (
                      <span
                        key={i}
                        style={{
                          height: `${b.height}px`,
                          animationDelay: `${b.delay}s`,
                          animationDuration: `${b.duration}s`,
                        }}
                      />
                    ))}
                  </div>
                  <span
                    className={`mic-note ${testing ? "live" : mic === "ok" ? "ok" : mic === "fail" ? "bad" : ""}`}
                  >
                    {micNote}
                  </span>
                </div>
              </div>

              <ul className="privacy">
                {PRIVACY.map((text, i) => (
                  <li key={i}>{text}</li>
                ))}
              </ul>
            </div>
          )}
        </div>

        <div className="sheet-foot">
          <span className="sheet-note">
            {step === 1
              ? "Penguji terkunci sampai sidang selesai."
              : `Penguji: ${pending.name}`}
          </span>
          <div className="sheet-actions">
            <button onClick={() => onStep(step === 2 ? 1 : 0)}>
              {step === 1 ? "Batal" : "Kembali"}
            </button>
            <button
              className="primary"
              disabled={starting}
              onClick={() => (step === 1 ? onStep(2) : onStart(pending))}
            >
              {step === 1 ? "Lanjut" : starting ? "Menyiapkan…" : "Mulai Sidang"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
