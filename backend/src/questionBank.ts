import { SIDANG_PHASES } from "./phases.js";
import { minQuestions } from "./sidang.js";

/**
 * Reservoir of examiner questions per sidang phase, ordered surface -> deep.
 * The model picks and rephrases from these; it must not read them verbatim.
 * Sources: taksonomi pertanyaan penguji (Widyantoro dkk. 2024, IJAL 14(2)) +
 * panduan viva + praktik penguji SI Indonesia.
 */
export const QUESTION_BANK: Record<string, string[]> = {
  Pembukaan: [
    "Silakan jelaskan penelitian Anda dalam 3–5 menit.",
    "Apa masalah utama yang Anda angkat dan mengapa penting?",
    "Mengapa Anda memilih judul dan topik ini?",
    "Apa yang melatarbelakangi pemilihan objek/domain penelitian ini?",
  ],
  "Latar Belakang & Rumusan Masalah": [
    "Apa bukti lapangan bahwa masalah ini nyata, bukan sekadar mengikuti tren?",
    "Coba sebutkan rumusan masalah Anda. Apakah semuanya sudah terjawab di kesimpulan?",
    "Kesimpulan nomor dua ini menjawab rumusan masalah yang mana?",
    "Batasan masalah Anda menyebut hal tertentu — mengapa Anda membatasinya di situ?",
    "Tunjukkan di halaman berapa data pendukung latar belakang itu dibahas.",
    "Apakah jumlah poin rumusan masalah sama dengan jumlah poin kesimpulan? Kalau tidak, mengapa?",
  ],
  "Tinjauan Pustaka": [
    "Penelitian terdahulu mana yang paling dekat dengan penelitian Anda, dan apa bedanya?",
    "Apakah semua referensi yang dikutip di Bab 2 ada di Daftar Pustaka?",
    "Teori mana yang Anda pakai sebagai landasan, dan mengapa teori itu yang dipilih?",
    "Kalau saya cari di Google Scholar, apakah sudah ada penelitian serupa? Di mana posisi Anda terhadap mereka?",
    "Referensi Anda banyak yang lama — apa perkembangan terbaru di bidang ini?",
  ],
  Metodologi: [
    "Mengapa Anda memilih metode ini, bukan alternatif lain yang lazim dipakai?",
    "Metode pengembangan perangkat lunak itu bukan metode penelitian. Di mana letak kontribusi penelitian dalam skripsi Anda?",
    "Berapa iterasi yang Anda lakukan? Apa yang berubah di tiap iterasi dan atas dasar apa?",
    "Bagaimana cara Anda mengumpulkan data, dan mengapa cara itu yang dipilih?",
    "Metodologi di Bab 3 menyebutkan satu hal, tetapi implementasi di Bab 4 menunjukkan yang lain. Coba jelaskan.",
    "Apa perbedaan skripsi Anda dengan proyek pembuatan aplikasi biasa?",
    "Bagaimana Anda memastikan instrumen yang dipakai valid dan reliabel?",
  ],
  "Hasil & Pembahasan": [
    "Berapa responden Anda? Bagaimana Anda memilih mereka? Apakah mereka mewakili pengguna sesungguhnya?",
    "Dengan sampel sekecil itu, seberapa valid kesimpulan Anda? Apakah Anda menghitung selang kepercayaan?",
    "Skor pengujian Anda sekian — apa artinya? Itu persentase atau bukan? Apa dasar interpretasinya?",
    "Mengapa tidak ada kelompok kontrol atau desain pre-test post-test?",
    "Bagaimana Anda tahu peningkatan ini disebabkan sistem Anda, bukan faktor lain seperti novelty effect?",
    "Pengujian fungsional hanya membuktikan fitur berjalan. Bagaimana Anda menguji bahwa isinya benar?",
    "Coba jelaskan langkah demi langkah bagaimana fitur inti Anda bekerja, termasuk saat input tidak valid.",
    "Tabel hasil ini angkanya dari mana? Tunjukkan perhitungannya.",
  ],
  "Kesimpulan & Kontribusi": [
    "Apa kontribusi penelitian Anda — kontribusi ilmiah atau sekadar produk teknis?",
    "Apa yang benar-benar baru: teknologinya, penerapannya, atau konteksnya?",
    "Sudah ada produk sejenis di pasar. Apa yang membedakan karya Anda?",
    "Kesimpulan Anda terlalu luas untuk data yang Anda punya. Apa dasarnya?",
    "Siapa yang akan memakai hasil penelitian ini, dan bagaimana bentuk manfaat konkretnya?",
  ],
  Penutup: [
    "Apa keterbatasan utama penelitian Anda?",
    "Jika mengulang, apa yang akan Anda ubah?",
    "Apa saran Anda untuk penelitian lanjutan?",
  ],
};

/**
 * Critique modules, keyed by trigger. Only the modules the dossier actually
 * flagged are sent — the dossier decides this by reading the whole naskah, so
 * there is no guessing involved. Sending all four costs 752 tokens every turn
 * and puts prompts about, say, sensitive-domain ethics in front of an examiner
 * grading a thesis about warehouse logistics.
 */
export const CRITIQUE_MODULES: Record<string, string> = {
  sistem: `- Pemicu: skripsi membangun sistem/aplikasi (prototyping, waterfall, RAD, SDLC).
  Kejar: mengapa model itu dipilih dibanding alternatif; pemisahan metode rekayasa (cara sistem dibangun) dari metode penelitian (cara klaim diuji); jumlah dan isi iterasi; beda skripsi vs proyek pembuatan aplikasi biasa; kecukupan pengujian di luar black-box.`,

  kuesioner: `- Pemicu: evaluasi memakai kuesioner (UAT, SUS, TAM, kepuasan pengguna).
  Kejar: jumlah dan cara pemilihan responden; bias responden (assumption bias, ingin menyenangkan peneliti); tidak adanya skenario kasus tepi; batas generalisasi. Khusus SUS: skor SUS BUKAN persentase — rata-rata industri 68 (SD 12,5) dan interpretasi memakai curved grading scale Sauro-Lewis; responden di bawah 15–20 orang menghasilkan estimasi tidak presisi sehingga perlu selang kepercayaan.`,

  ai: `- Pemicu: skripsi memakai AI/LLM/chatbot/model bahasa.
  Kejar: halusinasi dan inkonsistensi output; cara menjamin keandalan jawaban; ketergantungan pada API pihak ketiga dan risiko model berubah; apakah yang diuji sistemnya atau kemampuan model dasarnya; biaya dan latensi.`,

  domain_sensitif: `- Pemicu: domain sensitif (kesehatan, kesehatan mental, hukum, keuangan, anak).
  Kejar: alur penanganan situasi darurat/krisis; tanggung jawab hukum dan etis bila sistem memberi saran salah; ada tidaknya validasi ahli/profesional atas isi; keamanan dan privasi data pengguna serta lokasi penyimpanannya; status instrumen (skrining vs diagnosis), kewenangan interpretasi skor, lisensi, dan apakah validasi instrumen itu memang untuk populasi target Anda; ada tidaknya disclaimer bahwa sistem bukan pengganti tenaga profesional; risiko empati semu yang menyesatkan pengguna.`,
};

/** Satu-satunya sumber kebenaran nama modul; dossier memvalidasi terhadap ini. */
export const CRITIQUE_TRIGGERS = Object.keys(CRITIQUE_MODULES);

/**
 * ponytail: fase ditaksir dari jumlah giliran penguji, bukan diketahui.
 * Tidak ada sumber kebenaran — model menjalankan agendanya sendiri dan tidak
 * melaporkan posisinya. Karena itu yang dikirim adalah JENDELA tiga fase, dan
 * agenda lengkap tetap ada di persona: taksiran yang meleset satu fase hanya
 * membuat contoh pertanyaan kurang pas, bukan membuat penguji kehilangan arah.
 * Upgrade bila terbukti kurang: minta model menempelkan penanda fase seperti
 * CLOSE_MARKER, lalu baca posisinya alih-alih menaksir.
 *
 * Lajunya diikat ke MIN_EXAMINER_QUESTIONS, bukan konstanta terpisah. Dulu 2
 * pertanyaan per fase: jendela mentok di [Kesimpulan, Penutup] pada giliran 12
 * padahal sidang belum boleh tutup sebelum 15, sehingga tiga giliran terakhir
 * hanya punya bahan fase penutup — dan model merangkum sebelum waktunya karena
 * memang kehabisan agenda. Sekarang fase terakhir baru tiba tepat di ambang.
 */
export function phaseWindow(
  examinerCount: number,
  phases: string[] = SIDANG_PHASES,
  min = minQuestions(phases),
): string[] {
  const last = phases.length - 1;
  const center = Math.min(last, Math.floor((examinerCount * last) / min));
  const from = Math.max(0, center - 1);
  return phases.slice(from, Math.min(last, center + 1) + 1);
}

/**
 * System blok 2: contoh pertanyaan untuk fase di sekitar posisi sekarang, plus
 * modul kritik yang dipicu skripsi ini. Berubah beberapa kali per sesi, jadi ia
 * duduk SESUDAH blok persona+dossier yang di-cache.
 */
export function buildPhaseBlock(
  examinerCount: number,
  triggered: string[],
  bank: Record<string, string[]> = QUESTION_BANK,
  agenda: string[] = SIDANG_PHASES,
): string {
  const phases = phaseWindow(examinerCount, agenda).filter((p) => bank[p]?.length);
  const blocks = phases.map((p) => `${p}:\n${bank[p].map((q) => `- ${q}`).join("\n")}`);
  const modules = triggered
    .filter((t) => CRITIQUE_MODULES[t])
    .map((t) => CRITIQUE_MODULES[t]);

  const parts = [
    `BANK PERTANYAAN (bahan, bukan naskah) — fase di sekitar posisi sidang sekarang:
Ambil dari daftar ini, lalu SESUAIKAN dengan isi skripsi mahasiswa — sebut angka, bab, tabel, atau istilah yang benar-benar ada di naskah. Jangan membacakan pertanyaan apa adanya dan jangan mengulang pertanyaan yang sudah diajukan. Agenda lengkap ada di atas; daftar ini hanya contoh untuk fase terdekat.

${blocks.join("\n\n")}`,
  ];
  if (modules.length) {
    parts.push(
      `MODUL KRITIK (skripsi ini memicunya — wajib disentuh minimal sekali):\n\n${modules.join("\n\n")}`,
    );
  }
  return parts.join("\n\n");
}
