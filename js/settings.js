// js/settings.js
const KEY = 'bible-app-v1';
export const defaults = {
  copyFormat: 'withRef', // plain | withRef | custom
  customTemplate: '「$1」——$2',
  maxResults: 50,
  bilingual: false,
  highlight: true,
  sort: 'canon', // canon | relevance
  script: 'simp', // simp | trad
  pinyin: false,
  fuzzy: true,
  debounce: 250,
  fontSize: 17,
  theme: 'auto', // auto | light | dark
  corpus: 'bible', // bible | quran | buddhist | dao | lunyu
  history: []
};

export function loadSettings() {
  let raw = null;
  try { raw = localStorage.getItem(KEY); } catch { return { ...defaults, history: [] }; }
  if (!raw) return { ...defaults, history: [] };
  try {
    const j = JSON.parse(raw);
    // deep merge defaults
    const out = { ...defaults };
    for (const k of Object.keys(defaults)) {
      if (k in j) out[k] = j[k];
    }
    // 兼容旧版本缺失 history
    if (!Array.isArray(out.history)) out.history = [];
    return out;
  } catch {
    return { ...defaults, history: [] };
  }
}

export function saveSettings(s) {
  try { localStorage.setItem(KEY, JSON.stringify(s)); return true; } catch { return false; }
}

export function pushHistory(s, query) {
  query = String(query).trim();
  if (!query) return s;
  // 去重并置顶，最多 10 条
  const h = [query, ...s.history.filter(x=>x!==query)].slice(0,10);
  s.history = h;
  saveSettings(s);
  return s;
}
