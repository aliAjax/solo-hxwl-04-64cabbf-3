// UI 渲染冒烟验证：用 react-dom/server 挂载全部页签（StoreProvider 以演示数据初始化），
// 捕获渲染期异常并校验关键内容。无浏览器/后端依赖。运行：node scripts/verify-ui.mjs
import { build } from "esbuild";
import { pathToFileURL } from "node:url";
import { mkdirSync } from "node:fs";
import { join } from "node:path";

const outDir = join(process.cwd(), "node_modules", ".verify");
mkdirSync(outDir, { recursive: true });
const entry = join(outDir, "ssr.mjs");

const source = `
import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { StoreProvider } from "../src/store";
import Dashboard from "../src/views/Dashboard";
import Packages from "../src/views/Packages";
import Wash from "../src/views/Wash";
import Sterilization from "../src/views/Sterilization";
import Issue from "../src/views/Issue";
import Recall from "../src/views/Recall";
import Trace from "../src/views/Trace";

export const views = [
  ["总览", Dashboard, ["清洗中批次内器械包", "STER-0005", "已召回"]],
  ["器械包登记", Packages, ["新增器械包", "PKG-0013", "口腔检查基础包"]],
  ["清洗批次", Wash, ["新建清洗批次", "WASH-0004", "未结束"]],
  ["灭菌与监测", Sterilization, ["物理 / 化学 / 生物监测", "STER-0004", "隔离影响范围", "待录入"]],
  ["放行发放", Issue, ["器械包发放登记", "椅位", "PKG-0012"]],
  ["召回追踪", Recall, ["灭菌锅次召回", "待追踪发放", "ISS-0003"]],
  ["追溯查询", Trace, ["器械包追溯链查询", "追溯链"]],
];

export function renderAll() {
  return views.map(([name, Comp]) => {
    const html = renderToString(createElement(StoreProvider, null, createElement(Comp)));
    return { name, html };
  });
}

export function renderTracePreselected() {
  // 模拟浏览器地址 ?pkg=PKG-0010（召回锅次、待追踪发放）
  globalThis.window = { location: { search: "?pkg=PKG-0010" } };
  const html = renderToString(createElement(StoreProvider, null, createElement(Trace)));
  delete globalThis.window;
  return html;
}
`;

await build({
  stdin: { contents: source, resolveDir: join(process.cwd(), "scripts"), loader: "tsx", sourcefile: "ssr-entry.tsx" },
  bundle: true,
  format: "esm",
  platform: "node",
  outfile: entry,
  logLevel: "silent",
  banner: { js: "import { createRequire } from 'module'; const require = createRequire(import.meta.url);" },
});

const mod = await import(pathToFileURL(entry).href);

let passed = 0;
let failed = 0;
for (const [name, , needles] of mod.views) {
  const { html } = mod.renderAll().find((r) => r.name === name);
  // 追溯页初始为空选择态，完整时间线由预选场景单独验证
  const expect = name === "追溯查询" ? ["器械包追溯链查询", "选择一个器械包查看完整追溯链"] : needles;
  const missing = expect.filter((n) => !html.includes(n));
  if (missing.length === 0 && html.length > (name === "追溯查询" ? 200 : 800)) {
    passed++;
    console.log(`  ✓ ${name} 渲染正常（${html.length} 字符，关键内容齐全）`);
  } else {
    failed++;
    console.error(`  ✗ ${name} 渲染异常：缺失 ${missing.join("、") || "内容过少"}（${html.length} 字符）`);
  }
}

// 预选 PKG-0010：召回锅次 + 待追踪发放，完整追溯链必须渲染出来
{
  const html = mod.renderTracePreselected();
  const needles = ["牙髓活力测试包", "清洗批次", "灭菌锅次", "STER-0005", "生物监测", "院感紧急召回", "发放去向", "1 号椅位", "待追踪"];
  const missing = needles.filter((n) => !html.includes(n));
  if (missing.length === 0) {
    passed++;
    console.log(`  ✓ 追溯查询（?pkg=PKG-0010 预选）完整追溯链渲染正常（${html.length} 字符）`);
  } else {
    failed++;
    console.error(`  ✗ 追溯查询预选渲染缺失：${missing.join("、")}`);
  }
}

if (failed > 0) {
  console.error(`UI 验证失败：${failed} 项`);
  process.exit(1);
}
console.log(`\n全部通过：${passed} 个页签渲染与关键内容验证`);
