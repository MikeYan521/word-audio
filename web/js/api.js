// API 入口：自动选择后端实现。
//
//   * 本地运行（python run.py）→ 探测到 /api/health，走 api.server.js（Python + SQLite）
//   * Netlify 静态部署        → 探测失败，走 api.static.js（浏览器内解析 + IndexedDB）
//
// 两种实现的对外方法完全一致，页面代码无需感知差异。

let implPromise = null;

async function detectImplementation() {
  try {
    const res = await fetch("/api/health", { cache: "no-store" });
    if (res.ok) {
      const mod = await import("./api.server.js");
      return mod.serverApi;
    }
  } catch { /* 静态模式：没有 /api/health */ }
  const mod = await import("./api.static.js");
  return mod.staticApi;
}

export function backend() {
  if (!implPromise) implPromise = detectImplementation();
  return implPromise;
}

/** 发音 URL（同步）：两种后端都支持按 word 查询，因此可以直接拼接。 */
export function audioUrlFor(word, accent, refresh = false) {
  const lemma = word && typeof word === "object" ? (word.lemma || word.display || "") : String(word || "");
  const suffix = refresh ? "&refresh=1" : "";
  return `/api/audio?word=${encodeURIComponent(lemma)}&accent=${accent}${suffix}`;
}

export const api = new Proxy({}, {
  get(_target, name) {
    if (name === "audioUrl") {
      return (wordId, accent, refresh) => audioUrlFor({ lemma: String(wordId) }, accent, refresh);
    }
    if (name === "audioByWord") {
      return (word, accent, refresh) => audioUrlFor(word, accent, refresh);
    }
    return (...args) => backend().then((impl) => {
      const fn = impl[name];
      if (typeof fn !== "function") throw new Error(`此后端未实现方法：${String(name)}`);
      return fn.apply(impl, args);
    });
  },
});
