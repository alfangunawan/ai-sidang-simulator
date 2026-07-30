// sastrawijs mengirim dist/index.d.ts tetapi tidak memetakannya di field
// "exports" package.json, sehingga TypeScript tidak bisa menemukannya.
// Hanya Stemmer yang dipakai; tokenizer bawaannya membuang angka, padahal
// angka justru bahan penguji menuntut bukti.
declare module "sastrawijs" {
  export class Stemmer {
    stem(word: string): string;
  }
  export class Tokenizer {
    tokenize(text: string): string[];
  }
}
