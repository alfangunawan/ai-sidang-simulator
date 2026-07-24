import { buildApp } from "./app.js";
import { openDb } from "./db.js";
import { PORT, loadEncryptionKey } from "./env.js";

const db = openDb("data/sibiru.sqlite");
const app = buildApp(db, loadEncryptionKey());
app.listen(PORT, "127.0.0.1", () => {
  console.log(`SiBiru backend listening on http://localhost:${PORT}`);
});
