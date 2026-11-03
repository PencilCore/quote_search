// js/search.js — 跑在 Worker 内（亦可在主线程降级调用）
// haystack + offsets 二分 + 多词 AND + 正典/相关度排序 + uFuzzy 兜底

import { normalize } from './text.js';

let texts = null;
let norm = null;
let haystack = '';
let offsets = null; // Uint32Array(length+1)
let bookChVers = null; // Array<[bookIndex, chapter, verse]>
let ready = false;

// 构建索引（Worker 内一次性，100-200ms）
export function buildIndex(verses) {
  // verses: { v: [ [bookIndex, chapter, verse, text], ... ] }
  const n = verses.v.length;
  texts = new Array(n);
  norm = new Array(n);
  bookChVers = new Array(n);
  let off = 0;
  offsets = new Uint32Array(n + 1);
  let hs = '';
  for (let i = 0; i < n; i++) {
    const [b, c, v, t] = verses.v[i];
    texts[i] = t;
    bookChVers[i] = [b, c, v];
    const nn = normalize(t);
    norm[i] = nn;
    offsets[i] = hs.length;
    hs += nn;
    offsets[i + 1] = hs.length;
  }
  haystack = hs;
  ready = true;
  return { n, haystackLen: hs.length };
}

function findVerseIndexByPos(pos) {
  // offsets 单调递增，二分查找最后一个 offsets[i] <= pos
  let lo = 0, hi = offsets.length - 2, ans = 0;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (offsets[mid] <= pos) { ans = mid; lo = mid + 1; }
    else hi = mid - 1;
  }
  return ans;
}

export function isReady() { return ready; }

// 相关度打分：用于 sort=relevance
function scoreVerse(normText, queryNorm, hitCount, bookIndex, chapter, verse) {
  let s = 0;
  if (normText === queryNorm) s += 1000;
  s += hitCount * 30;
  s -= normText.length / 10;
  // 正典序作为同分 tie-breaker，需保留小量权重，不计入 score，主排序后再按正典排
  return s;
}

export function search(queryRaw, opts = {}) {
  const { maxResults = 50, sort = 'canon', fuzzy = true } = opts;
  const qNormSingle = normalize(queryRaw);
  // 切词（多词 AND）
  const wordsRaw = queryRaw.trim().split(/\s+/).filter(Boolean);
  const words = wordsRaw.map(w => normalize(w)).filter(Boolean);
  if (!words.length || !ready) return { results: [], timeMs: 0, fuzzyUsed: false };

  const t0 = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();

  // 选最短词做 haystack 全扫描以缩小候选
  let shortest = words[0], si = 0;
  for (let i = 1; i < words.length; i++) if (words[i].length < shortest.length) { shortest = words[i]; si = i; }
  const otherWords = words.filter((_, i) => i !== si);

  // 扫描 haystack
  const hitPos = [];
  let p = haystack.indexOf(shortest);
  while (p !== -1) {
    hitPos.push(p);
    p = haystack.indexOf(shortest, p + 1);
    if (hitPos.length > 50000) break; // 防止 '神' 等高频词过度
  }
  // 映射到 verse 索引并去重，同时 AND 验证其余词
  const verseSet = new Map(); // idx -> hitCount(for scoring)
  for (const pos of hitPos) {
    const vi = findVerseIndexByPos(pos);
    // AND 验证：检查该节的 norm 是否包含所有 otherWords
    let ok = true;
    for (const w of otherWords) {
      if (!norm[vi].includes(w)) { ok = false; break; }
    }
    if (!ok) continue;
    // 额外验证：对于单字词以上的 shortest，haystack 命中即有效；对于多词已 via includes 验证 completeness
    // 计数：该节内命中次数（至少 1），用于 relevance
    verseSet.set(vi, (verseSet.get(vi) || 0) + 1);
  }

  let candidates = [...verseSet.entries()]; // [idx, hitCount]

  // 精确结果足够则直接排序截断
  if (candidates.length >= 3 || !fuzzy || words.length > 1) {
    let out = candidates.map(([idx, cnt]) => {
      const [b,c,v] = bookChVers[idx];
      const sc = scoreVerse(norm[idx], qNormSingle, cnt, b,c,v);
      return { idx, b, c, v, text: texts[idx], score: sc, hitCount: cnt };
    });
    if (sort === 'canon') {
      out.sort((a,b)=> a.b!==b.b ? a.b-b.b : a.c!==b.c ? a.c-b.c : a.v-b.v);
    } else {
      out.sort((a,b)=> b.score - a.score || a.b-b.b || a.c-b.c || a.v-b.v);
    }
    out = out.slice(0, maxResults);
    const t1 = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
    return { results: out, timeMs: Math.round(t1 - t0), fuzzyUsed: false, qWords: words, qNormSingle };
  }

  // 模糊兜底：仅当精确 <3 且开启模糊且 query 长度>=2
  if (fuzzy && qNormSingle.length >= 2 && typeof self !== 'undefined' && self.uFuzzy) {
    // uFuzzy 仅在 Worker 且已加载 vendor 时可用
    try {
      const uf = new self.uFuzzy({ intraMode: 1, intraIns: 1 });
      let idxs = uf.filter(norm, qNormSingle);
      if (idxs && idxs.length) {
        const info = uf.info(norm, idxs, qNormSingle);
        uf.sort(norm, idxs, info);
        // 去掉已被精确命中的
        const exactSet = new Set(candidates.map(([i])=>i));
        const fuzzyIdxs = idxs.filter(i => !exactSet.has(i)).slice(0, 20);
        // 合并（精确在前，模糊在后）
        let out = candidates.map(([idx,cnt])=>{
          const [b,c,v]=bookChVers[idx];
          return { idx,b,c,v,text:texts[idx], score: scoreVerse(norm[idx], qNormSingle, cnt,b,c,v), hitCount:cnt, fuzzy:false };
        });
        for (const fi of fuzzyIdxs) {
          const [b,c,v]=bookChVers[fi];
          out.push({ idx:fi, b,c,v, text:texts[fi], score: -1000, hitCount:0, fuzzy:true });
        }
        // 截断
        out = out.slice(0, maxResults);
        const t1 = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
        return { results: out, timeMs: Math.round(t1-t0), fuzzyUsed: fuzzyIdxs.length>0, qWords: words, qNormSingle };
      }
    } catch (e) {
      // 模糊失败回退到精确
    }
  }

  // 否则返回精确结果（可能为空）
  let out = candidates.map(([idx,cnt])=>{
    const [b,c,v]=bookChVers[idx];
    return { idx,b,c,v,text:texts[idx], score: scoreVerse(norm[idx], qNormSingle, cnt,b,c,v), hitCount:cnt, fuzzy:false };
  });
  if (sort==='canon') out.sort((a,b)=> a.b!==b.b? a.b-b.b : a.c!==b.c? a.c-b.c : a.v-b.v);
  else out.sort((a,b)=> b.score-a.score || a.b-b.b || a.c-b.c || a.v-b.v);
  out = out.slice(0, maxResults);
  const t1 = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
  return { results: out, timeMs: Math.round(t1-t0), fuzzyUsed: false, qWords: words, qNormSingle };
}

// 暴露给主线程按 verseKey 取节（用于上下文展开 / 双语对齐）
export function getVerseByKey(bookIndex, chapter, verse) {
  if (!ready) return null;
  // 线性扫描较慢，但上下文展开仅数节；也可建 Map，Worker 内 lazy 建
  for (let i=0;i<bookChVers.length;i++) {
    const [b,c,v]=bookChVers[i];
    if (b===bookIndex && c===chapter && v===verse) return { idx:i, text:texts[i], norm:norm[i] };
  }
  return null;
}
// 全章
export function getVersesByChapter(bookIndex, chapter, limitVerses) {
  if (!ready) return [];
  const out=[];
  for (let i=0;i<bookChVers.length;i++) {
    const [b,c,v]=bookChVers[i];
    if (b===bookIndex && c===chapter) {
      if (limitVerses && (v < limitVerses[0] || v > limitVerses[1])) continue;
      out.push({ idx:i, b,c, v, text:texts[i] });
    }
  }
  return out;
}
