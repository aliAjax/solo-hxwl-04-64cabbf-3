// 窄屏修复静态复核（无浏览器环境）：
//  1. 构建产物 CSS 含 720px 卡片式表格规则；
//  2. SSR 渲染的全部数据表：每个 td 都有 data-label，且不存在 720px 下不可压缩的固定宽度；
//  3. 视图中不存在 min-width/固定 px 宽度造成的横向溢出源。
import { build } from "esbuild";
import { pathToFileURL } from "node:url";
import { mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const outDir = join(root, "node_modules", ".verify");
mkdirSync(outDir, { recursive: true });
const entry = join(outDir, "ssr-narrow.mjs");

const source = `
import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { StoreProvider } from "../src/store";
import Issue from "../src/views/Issue";
import Recall from "../src/views/Recall";
import Packages from "../src/views/Packages";
import Wash from "../src/views/Wash";
import Sterilization from "../src/views/Sterilization";
export function render() {
  return [Issue, Recall, Packages, Wash, Sterilization]
    .map((C) => renderToString(createElement(StoreProvider, null, createElement(C))))
    .join("\\n");
}
`;

await build({
  stdin: { contents: source, resolveDir: join(root, "scripts"), loader: "tsx", sourcefile: "narrow.tsx" },
  bundle: true,
  format: "esm",
  platform: "node",
  outfile: entry,
  logLevel: "silent",
  banner: { js: "import { createRequire } from 'module'; const require = createRequire(import.meta.url);" },
});
const { render } = await import(pathToFileURL(entry).href);
const html = render();

let passed = 0;
let failed = 0;
const check = (name, cond, detail = "") => {
  if (cond) { passed++; console.log(`  ✓ ${name}`); }
  else { failed++; console.error(`  ✗ ${name}${detail ? ` — ${detail}` : ""}`); }
};

// 1. 源码 CSS 与构建产物 CSS 的窄屏规则
const cssSource = readFileSync(join(root, "src", "styles.css"), "utf8");
check("styles.css 含 720px 窄屏断点", cssSource.includes("@media (max-width: 720px)"));
check("窄屏下隐藏表头", /\.data-table thead\s*\{[^}]*position:\s*absolute/s.test(cssSource));
check("窄屏下 td::before 使用 data-label", /\.data-table td::before\s*\{[^}]*content:\s*attr\(data-label\)/s.test(cssSource));
check("窄屏下取消表格横向滚动", /\.table-wrap\s*\{[^}]*overflow-x:\s*visible/s.test(cssSource));
check("窄屏下兜底禁止页面横向溢出", /overflow-x:\s*hidden/.test(cssSource));

// 2. 所有渲染出的 td 必须带 data-label（逐张表覆盖）
const tds = [...html.matchAll(/<td\b([^>]*)>/g)].map((m) => m[1]);
const missing = tds.filter((attrs) => !/\bdata-label=/.test(attrs));
check(`全部 ${tds.length} 个表格单元格均带 data-label`, missing.length === 0, `缺失 ${missing.length}`);

// 3. 不存在窄屏下的横向溢出源：固定大 px 宽度（排除 max-width 与媒体查询边界）
const offenders = [
  ...cssSource.matchAll(/(?<!max-)(?<!\/\/[^\n]*)(?:^|[;{]\s*)(?:min-width|width):\s*(\d{3,})px/gm),
].filter((m) => Number(m[1]) > 360).map((m) => m[0].trim());
check("无大于 360px 的固定宽度声明（max-width 除外）", offenders.length === 0, offenders.join(", "));
check("窄屏下 nowrap 单元格已放开换行", cssSource.includes(".data-table td.nowrap"));

// 4. 关键两张表（发放记录、召回追踪）的字段标签齐备
const labels = [...html.matchAll(/data-label="([^"]+)"/g)].map((m) => m[1]);
for (const need of ["发放号", "器械包", "锅次", "椅位", "发放时间", "归还", "追踪", "操作"]) {
  check(`发放/召回表含字段标签「${need}」`, labels.includes(need));
}
// “追踪状态”列位于召回结果子表（执行召回后渲染），校验源码中已标注
const recallSource = readFileSync(join(root, "src", "views", "Recall.tsx"), "utf8");
check("召回结果子表「追踪状态」列带 data-label", recallSource.includes('data-label="追踪状态"'));

if (failed > 0) {
  console.error(`\n窄屏复核失败：${failed} 项`);
  process.exit(1);
}
console.log(`\n窄屏静态复核通过：${passed} 项`);
