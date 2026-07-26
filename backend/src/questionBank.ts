import { SIDANG_PHASES } from "./phases.js";

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
 * Critique modules that only activate when the skripsi actually matches the
 * trigger. Keeps the simulator generic while still hitting the hard spots for
 * system-development / AI / sensitive-domain theses.
 */
export const CRITIQUE_MODULES = `MODUL KRITIK (aktifkan HANYA jika isi skripsi memenuhi pemicunya):

- Pemicu: skripsi membangun sistem/aplikasi (prototyping, waterfall, RAD, SDLC).
  Kejar: mengapa model itu dipilih dibanding alternatif; pemisahan metode rekayasa (cara sistem dibangun) dari metode penelitian (cara klaim diuji); jumlah dan isi iterasi; beda skripsi vs proyek pembuatan aplikasi biasa; kecukupan pengujian di luar black-box.

- Pemicu: evaluasi memakai kuesioner (UAT, SUS, TAM, kepuasan pengguna).
  Kejar: jumlah dan cara pemilihan responden; bias responden (assumption bias, ingin menyenangkan peneliti); tidak adanya skenario kasus tepi; batas generalisasi. Khusus SUS: skor SUS BUKAN persentase — rata-rata industri 68 (SD 12,5) dan interpretasi memakai curved grading scale Sauro-Lewis; responden di bawah 15–20 orang menghasilkan estimasi tidak presisi sehingga perlu selang kepercayaan.

- Pemicu: skripsi memakai AI/LLM/chatbot/model bahasa.
  Kejar: halusinasi dan inkonsistensi output; cara menjamin keandalan jawaban; ketergantungan pada API pihak ketiga dan risiko model berubah; apakah yang diuji sistemnya atau kemampuan model dasarnya; biaya dan latensi.

- Pemicu: domain sensitif (kesehatan, kesehatan mental, hukum, keuangan, anak).
  Kejar: alur penanganan situasi darurat/krisis; tanggung jawab hukum dan etis bila sistem memberi saran salah; ada tidaknya validasi ahli/profesional atas isi; keamanan dan privasi data pengguna serta lokasi penyimpanannya; status instrumen (skrining vs diagnosis), kewenangan interpretasi skor, lisensi, dan apakah validasi instrumen itu memang untuk populasi target Anda; ada tidaknya disclaimer bahwa sistem bukan pengganti tenaga profesional; risiko empati semu yang menyesatkan pengguna.`;

export function buildQuestionBankBlock(): string {
  const blocks = SIDANG_PHASES.filter((p) => QUESTION_BANK[p]?.length).map(
    (p) => `${p}:\n${QUESTION_BANK[p].map((q) => `- ${q}`).join("\n")}`,
  );
  return `BANK PERTANYAAN (bahan, bukan naskah):
Ambil dari daftar ini sesuai fase yang sedang berjalan, lalu SESUAIKAN dengan isi skripsi mahasiswa — sebut angka, bab, tabel, atau istilah yang benar-benar ada di naskah. Jangan membacakan pertanyaan apa adanya dan jangan mengulang pertanyaan yang sudah diajukan.

${blocks.join("\n\n")}

${CRITIQUE_MODULES}`;
}
