import { buildApp } from "./app.js";
import { openDb } from "./db.js";
import { PORT, loadEncryptionKey } from "./env.js";

const db = openDb("data/sibiru.sqlite");
const app = buildApp(db, loadEncryptionKey());
app.listen(PORT, () => {
  console.log(`SiBiru backend listening on http://localhost:${PORT}`);
});
