// js/text.js — 全应用唯一 normalize 实现，顺序不可变
export const PUNCT_RE = /[。，、；：？！“”‘’「」『』（）《》〈〉…—－·,.!?;:'"()\[\]{}<>\/\\|~`@#$%^&*+=_\-]/g;

export function normalize(s) {
  return s
    .normalize('NFKC')
    .replace(/[\u3000\s]+/g, '')
    .replace(PUNCT_RE, '')
    .replace(/[A-Z]/g, m => m.toLowerCase());
}

// 仅对查询串把繁体转简体：若 OpenCC 可用则调用，否则返回原串（构建期已由 build 保证数据为简体）
let t2cn = null;
let t2cnReady = false;
export async function ensureT2CN() {
  if (t2cnReady) return t2cn;
  t2cnReady = true;
  try {
    // vendor/opencc-t2cn.min.js 暴露 global.OpenCC
    if (typeof window !== 'undefined' && window.OpenCC) {
      t2cn = window.OpenCC.Converter({ from: 'tw', to: 'cn' });
      // opencc 已包含台湾、香港等变体，繁体查询可转简；失败则忽略
    }
  } catch {}
  return t2cn;
}
export function t2cnConvert(s) {
  if (t2cn) {
    try { return t2cn(s); } catch {}
  }
  return s;
}

// 别名表（仅同义扩展时使用，现阶段保留供后续扩展）
export const aliasMap = {
  '耶和华': 'yhwh',
  '上帝': 'god',
  '神': 'god',
  'lord': 'yhwh',
};

// 将查询按空白切词后逐个 normalize（保留多词 AND 语义，normalize 会去空白故先切词）
export function splitAndNormalizeQuery(raw) {
  const t = raw.trim();
  if (!t) return [];
  // 先做繁简转换（若可用），再切词
  const converted = t2cn ? t2cnConvert(t) : t;
  const parts = converted.split(/\s+/).filter(Boolean);
  const words = parts.map(p => normalize(p)).filter(Boolean);
  return words;
}

// 为高亮计算原字到 norm 的映射，返回 ranges：[{start,end}] 在原文中的字符区间（包含被跳过的标点与空白）
// wordsNorm: 已 normalize 的查询词数组（单/多词均取并集高亮）
export function getHighlightRanges(text, wordsNorm) {
  if (!wordsNorm || !wordsNorm.length) return [];
  // 构建 norm 串与 mapping：normChars[i] 来自 text[origIndices[i]]
  const orig = [...text]; // 按 codepoint 展开，避免 emoji 截断（虽圣经无 emoji，但保持正确）
  let norm = '';
  const map = []; // norm index -> orig index
  for (let oi = 0; oi < orig.length; oi++) {
    const ch = orig[oi];
    // 逐字符应用 normalize 规则的子集：NFKC + 去空白/标点 + 小写
    let c = ch.normalize('NFKC');
    if (/[\u3000\s]/.test(c)) continue;
    // 去标点：检查单字符是否命中 PUNCT_RE
    // 使用重置 lastIndex 避免 g 标记影响
    PUNCT_RE.lastIndex = 0;
    if (PUNCT_RE.test(c)) { PUNCT_RE.lastIndex = 0; continue; }
    PUNCT_RE.lastIndex = 0;
    if (/[A-Z]/.test(c)) c = c.toLowerCase();
    // c 可能为多字符（如 ﬁ -> fi）；若长度>1，需逐字符映射到同一 orig 索引
    for (const cc of c) {
      norm += cc;
      map.push(oi);
    }
  }
  if (!norm) return [];
  const ranges = [];
  for (const w of wordsNorm) {
    if (!w) continue;
    let pos = 0;
    while (true) {
      const idx = norm.indexOf(w, pos);
      if (idx === -1) break;
      const startOrig = map[idx];
      const endOrig = map[idx + w.length - 1];
      // 区间为 [startOrig, endOrig] 在 orig 中的闭区间，转为 [start,end) 的字符切片区间（包含中间标点）
      // end 需 +1 且包含中间被跳过的标点字符
      ranges.push([startOrig, endOrig + 1]);
      pos = idx + 1; // 允许重叠
      if (ranges.length > 20) break; // 单节最多高亮 20 处，避免异常
    }
  }
  if (!ranges.length) return [];
  // 合并重叠区间
  ranges.sort((a,b)=>a[0]-b[0]);
  const merged = [ranges[0]];
  for (let i=1;i<ranges.length;i++) {
    const last = merged[merged.length-1];
    const cur = ranges[i];
    if (cur[0] <= last[1]) last[1] = Math.max(last[1], cur[1]);
    else merged.push(cur);
  }
  return merged;
}

// 对外：直接返回带 <mark> 的 HTML（已转义）
export function escapeHtml(s) {
  return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
export function highlightHtml(text, wordsNorm) {
  if (!wordsNorm || !wordsNorm.length) return escapeHtml(text);
  const ranges = getHighlightRanges(text, wordsNorm);
  if (!ranges.length) return escapeHtml(text);
  const chars = [...text];
  let out = '';
  let cur = 0;
  for (const [s,e] of ranges) {
    if (cur < s) out += escapeHtml(chars.slice(cur,s).join(''));
    out += '<mark>' + escapeHtml(chars.slice(s,e).join('')) + '</mark>';
    cur = e;
  }
  if (cur < chars.length) out += escapeHtml(chars.slice(cur).join(''));
  return out;
}
