// js/refs.js — 引用直达，纯函数，不依赖 DOM
// 支持： 约3:16 约 3:16 约翰福音3:16 詩23 创1:1-5 Gen 1:1-5 Jn 3:16 jhn3.16 等
// 分隔符接受 : . ： 冒号全角；区间用 - – —
// 返回 { bookIndex, chapter, verseStart, verseEnd, chapterOnly } 或 null

let booksCache = null;
// books: 来自 books.json 的 books 数组
export function setBooks(books) { booksCache = books; }

// 构建 abbr -> bookIndex 的最长匹配表（大小写不敏感）
function buildAbbrMap(books) {
  const entries = [];
  books.forEach((b, bi) => {
    const names = [...(b.abbr||[]), b.zh, b.zht||'', b.en, b.osis];
    names.filter(Boolean).forEach(n => {
      entries.push({ key: n.toLowerCase(), bi, len: n.length });
    });
    // 兼容把全角书名去掉空格后的形态
    // 也加入去空白小写的 zh（如 "约翰福音" / "約翰福音"）
  });
  // 最长优先，其次按书写顺序（更早的 book 优先，避免约翰/约翰一书冲突时取更长的）
  entries.sort((a,b)=> b.len - a.len || a.bi - b.bi);
  return entries;
}

const SEP_RE = /[:.：]/; // 章节分隔符
const RANGE_SEP_RE = /[-–—]/;

export function parseRef(raw, books) {
  const bs = books || booksCache;
  if (!bs) return null;
  let s = String(raw).trim();
  if (!s) return null;

  // 允许书名与章之间无空格： "约3:16" -> 需切分
  // 策略：按最长 abbr 前缀匹配切出书名，其余为引用部分
  const abbrMap = buildAbbrMap(bs);
  // 归一化待匹配前缀：去空白、转小写、全角转半角（NFKC），但保留中文字符
  const normForMatch = (x)=> x.normalize('NFKC').replace(/\s+/g,'').toLowerCase();
  const sNorm = normForMatch(s);
  let bookIndex = -1;
  let matchedLenNorm = 0; // 在 norm 串上的匹配长度
  let matchedRawEnd = 0;  // 在原串上的结束位置（用于截取剩余部分）
  // 需在原串上精确定位：对每个候选 abbr，按 NFKC+去空白 的规范化去比对前缀
  // 暴力：对 abbr 按长度排序，首个满足 sNorm 以 abbrNorm 开头的即为命中
  for (const e of abbrMap) {
    const abbrNorm = normForMatch(e.key);
    if (!abbrNorm) continue;
    if (sNorm.startsWith(abbrNorm)) {
      // 将 norm 长度反推到 raw 的切割点：遍历 raw 累积其 NFKC(去空白) 后的长度直至匹配长
      let acc = 0;
      let cut = 0;
      for (let i=0; i<s.length && acc < abbrNorm.length; i++) {
        const ch = s[i];
        if (/\s/.test(ch)) continue; // 空白不计入 norm
        const nk = ch.normalize('NFKC').toLowerCase();
        // nk 可能长于 1（如 ﬁ），按其长度累加
        acc += [...nk].length; // 近似：按字符计
        cut = i+1;
        if (acc >= abbrNorm.length) break;
      }
      // 对于多字符中文，上述近似已足够，因为 NFKC 对中文不变
      // 为兼容 "约翰福音" 等完整书名，acc==abbrNorm 长度即正确
      bookIndex = e.bi;
      matchedLenNorm = abbrNorm.length;
      matchedRawEnd = cut;
      // 跳过 abbr 后的空白
      while (matchedRawEnd < s.length && /\s/.test(s[matchedRawEnd])) matchedRawEnd++;
      break;
    }
  }
  if (bookIndex === -1) return null;

  let rest = s.slice(matchedRawEnd).trim();
  if (!rest) return null;

  // rest 预期为： 章  或 章:节  或 章:节-节  或 章:节-章:节（最后一种不支持，仅取尾节为同一章内）
  // 先抽取所有数字
  // 将全角数字也 NFKC 归一，方便匹配
  rest = rest.normalize('NFKC');
  // 提取数字序列与分隔符：容忍空格
  // 用正则匹配主要模式
  // chap:verseStart(-verseEnd)?   或 chap(-chapEnd)?
  // 另外 chap 单独 => 全章
  const rangeNorm = rest.replace(/[-–—]/g,'-').replace(/：/g,':').replace(/\s+/g,'');
  // 模式1： 章:节-节   例 1:1-5
  let m = rangeNorm.match(/^(\d+)[:.](\d+)(?:-(\d+))?$/);
  if (m) {
    const chap = parseInt(m[1],10);
    const vStart = parseInt(m[2],10);
    const vEnd = m[3] ? parseInt(m[3],10) : vStart;
    if (chap < 1 || vStart < 1) return null;
    const chapMax = bs[bookIndex].chapters;
    if (chap <1 || chap > chapMax) return null;
    const vs = Math.min(vStart, vEnd), ve = Math.max(vStart, vEnd);
    return { bookIndex, chapter: chap, verseStart: vs, verseEnd: ve, chapterOnly: false };
  }
  // 模式2： 章:节-章:节 的简化：如 1:1-2:3 取首章首节到末节（跨章，当前简化为仅同章内，取末节数字作为 verseEnd，忽略中间章）
  m = rangeNorm.match(/^(\d+)[:.](\d+)-(\d+)[:.](\d+)$/);
  if (m) {
    const chap = parseInt(m[1],10);
    const vStart = parseInt(m[2],10);
    const chap2 = parseInt(m[3],10);
    const vEnd = parseInt(m[4],10);
    // 实现为：若 chap===chap2 则同章区间，否则展开为多章？按 PLAN §7 区间为同一章内，故此处仅支持同章
    if (chap === chap2) return { bookIndex, chapter: chap, verseStart: vStart, verseEnd: vEnd, chapterOnly: false };
    // 跨章：退化为首节（至少保证不报错）
    return { bookIndex, chapter: chap, verseStart: vStart, verseEnd: vStart, chapterOnly: false };
  }
  // 模式3： 全章  例 23
  m = rangeNorm.match(/^(\d+)$/);
  if (m) {
    const chap = parseInt(m[1],10);
    const chapMax = bs[bookIndex].chapters;
    if (chap <1 || chap > chapMax) return null;
    return { bookIndex, chapter: chap, verseStart: 1, verseEnd: 999, chapterOnly: true };
  }
  return null;
}

// 将解析结果展开为 verseKey 列表（需结合实际 verses 判断全章的上界）
export function expandToKeys(parsed, books) {
  if (!parsed) return [];
  const { bookIndex, chapter, verseStart, verseEnd, chapterOnly } = parsed;
  if (chapterOnly) {
    // 调用方根据真实数据截断 verseEnd，此处先返回标记；由 app.js 在数据到达后展开
    return [{ bookIndex, chapter, verseStart: 1, verseEnd: 999, chapterOnly: true }];
  }
  return [{ bookIndex, chapter, verseStart, verseEnd, chapterOnly: false }];
}

export function formatRef(bookZh, chapter, verse) {
  return `${bookZh} ${chapter}:${verse}`;
}
export function formatRefRange(bookZh, chapter, vStart, vEnd) {
  if (vStart === vEnd) return `${bookZh} ${chapter}:${vStart}`;
  return `${bookZh} ${chapter}:${vStart}-${vEnd}`;
}
