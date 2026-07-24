import { buildApp } from "./app.js";
import { PORT } from "./env.js";

const app = buildApp();
app.listen(PORT, () => {
  console.log(`SiBiru backend listening on http://localhost:${PORT}`);
});
