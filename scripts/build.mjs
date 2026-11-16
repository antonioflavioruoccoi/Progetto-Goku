import fs from "node:fs/promises";
import { build } from "esbuild";
import { quizData } from "./quiz-data.mjs";
await fs.rm("dist", { recursive: true, force: true });
await fs.mkdir("dist/live-cards", { recursive: true });
for (const file of await fs.readdir("."))
  if (/\.(html|css|js|png|webp|jpg|jpeg|mp3|otf|txt)$/.test(file))
    await fs.copyFile(file, "dist/" + file);
for (const route of ["admin", "host", "play", "invite"]) {
  await fs.mkdir("dist/" + route, { recursive: true });
  await fs.copyFile("web/app.html", "dist/" + route + "/index.html");
}
await fs.copyFile("web/app.css", "dist/app.css");
await fs.mkdir("worker/generated", { recursive: true });
await fs.writeFile(
  "worker/generated/quiz.json",
  JSON.stringify(await quizData()),
);
await build({
  entryPoints: ["web/app.js"],
  bundle: true,
  format: "esm",
  outfile: "dist/app.js",
  minify: true,
});
for (const c of (await quizData()).cards)
  await fs.copyFile(c.image, "dist/" + c.opaque);
console.log("Built frontend assets and server quiz data.");
