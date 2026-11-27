// 画面テスト用：CDN から読むライブラリを node_modules の同じファイルで返す（ネットにつながらない環境でも動くように）
const path = require("node:path");

const ROOT = path.join(__dirname, "..");
const MAP = [
  ["pdf-lib@1.17.1/dist/pdf-lib.min.js", "node_modules/pdf-lib/dist/pdf-lib.min.js"],
  ["@pdf-lib/fontkit@1.1.1/dist/fontkit.umd.min.js", "node_modules/@pdf-lib/fontkit/dist/fontkit.umd.min.js"],
  ["jszip/3.10.1/jszip.min.js", "node_modules/jszip/dist/jszip.min.js"],
];

async function routeCdn(ctx) {
  const handler = (route) => {
    const hit = MAP.find(([url]) => route.request().url().endsWith(url));
    if (!hit) return route.abort();
    return route.fulfill({ path: path.join(ROOT, hit[1]), contentType: "application/javascript" });
  };
  await ctx.route("https://cdn.jsdelivr.net/**", handler);
  await ctx.route("https://cdnjs.cloudflare.com/**", handler);
}

module.exports = { routeCdn };
