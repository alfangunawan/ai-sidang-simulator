import type Database from "better-sqlite3";
import { setDossierReady } from "../../src/repos/documents.js";
import { DOSSIER_VERSION, type Dossier } from "../../src/dossier.js";

export const SAMPLE_DOSSIER: Dossier = {
  judul: "Perancangan Chatbot Skrining Kecemasan Mahasiswa",
  rumusan_masalah: ["Bagaimana merancang chatbot yang memvalidasi tingkat kecemasan mahasiswa?"],
  tujuan: ["Membangun chatbot skrining berbasis GAD-7."],
  batasan: ["Hanya mahasiswa satu program studi."],
  metode: { nama: "Prototyping", justifikasi: "Iterasi cepat dengan umpan balik pengguna." },
  instrumen: ["GAD-7", "Kuesioner SUS"],
  populasi_sampel: { deskripsi: "Mahasiswa dua angkatan, satu prodi", jumlah: 113 },
  hasil_kunci: [{ klaim: "Responden menganggap masalah tidak serius", angka: "71,7%", sumber: "Tabel IV-1" }],
  kesimpulan: ["Chatbot berhasil dibangun dan diuji dengan skor SUS 78."],
  keterbatasan: ["Tidak ada kelompok kontrol."],
  peta_bab: [{ judul: "BAB III METODOLOGI", halaman_mulai: 41 }],
  fakta_struktural: {
    jumlah_rumusan_masalah: 1,
    jumlah_kesimpulan: 1,
    rumusan_tanpa_kesimpulan: [],
    sitasi_bab2_tidak_di_daftar_pustaka: [],
    jumlah_tabel: 12,
    jumlah_gambar: 8,
  },
  modul_kritik_terpicu: ["sistem", "kuesioner", "ai", "domain_sensitif"],
  poin_serangan: ["Rumusan masalah menjanjikan validasi, tetapi Bab IV tidak menguji efektivitas."],
};

/** Menandai dokumen siap dipakai sidang. Tanpa ini rute turn menolak dengan 400. */
export function seedDossier(
  db: Database.Database,
  documentId: number,
  over: Partial<Dossier> = {},
): void {
  setDossierReady(
    db,
    documentId,
    JSON.stringify({ ...SAMPLE_DOSSIER, ...over }),
    DOSSIER_VERSION,
    "test/model",
  );
}
