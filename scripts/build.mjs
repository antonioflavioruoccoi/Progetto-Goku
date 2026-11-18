import fs from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { build } from "esbuild";
import { quizData } from "./quiz-data.mjs";
import { pokepriceData, PRICE_IMAGES } from "./pokeprice-data.mjs";
const [quiz, priceCards] = await Promise.all([quizData(), pokepriceData()]);
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
await fs.cp("assets/pokeindizi", "dist/assets/pokeindizi", {recursive:true});
await fs.mkdir("worker/generated", { recursive: true });
await fs.writeFile(
  "worker/generated/quiz.json",
  JSON.stringify({ ...quiz, priceCards }),
);
await build({
  entryPoints: ["web/app.js"],
  bundle: true,
  format: "esm",
  outfile: "dist/app.js",
  minify: true,
});
await fs.mkdir("dist/" + PRICE_IMAGES, { recursive: true });
for (const card of priceCards)
  await fs.copyFile("." + card.image, "dist" + card.image);
for (const c of quiz.cards)
  await fs.copyFile(c.image, "dist/" + c.opaque);
console.log("Built frontend assets and server quiz data.");

const commit = execFileSync('git', ['rev-parse', 'HEAD'], {encoding:'utf8'}).trim();
await fs.writeFile('dist/version.json', JSON.stringify({commit}));
await fs.writeFile('dist/_headers', '/*\n  Cache-Control: no-cache\n/version.json\n  Cache-Control: no-store\n');
