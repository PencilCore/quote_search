// js/app.js — 全库版：启动即并行加载全部经文库，单一索引全搜，历史记录重做
import { loadSettings, saveSettings, pushHistory, defaults } from './settings.js';
import { copyText, buildCopyPayload, formatWithTemplate } from './clipboard.js';
import * as Refs from './refs.js';
import { highlightHtml, escapeHtml, normalize } from './text.js';

const $ = s => document.querySelector(s);
const els = {
  q: $('#q'), btnClear: $('#btnClear'), btnPaste: $('#btnPaste'), btnSettings: $('#btnSettings'),
  btnBilingual: $('#btnBilingual'), selSort: $('#selSort'),
  statusText: $('#statusText'), statusTime: $('#statusTime'),
  results: $('#results'), jumpCard: $('#jumpCard'), btnLoadMore: $('#btnLoadMore'), skeletons: $('#skeletons'),
  emptyState: $('#emptyState'), historyPanel: $('#historyPanel'), historyChips: $('#historyChips'), btnRandom: $('#btnRandom'), btnRandomBible: $('#btnRandomBible'),
  progressBar: $('#progressBar'),
  dlg: $('#dlgSettings'), btnCloseSettings: $('#btnCloseSettings'),
  toast: $('#toast'),
  pasteHint: $('#pasteHint'), pasteHintText: $('#pasteHintText'), btnUseClipboard: $('#btnUseClipboard'), btnDismissPaste: $('#btnDismissPaste'),
  brandMeta: $('#brandMeta'), corpusBadge: $('#corpusBadge'), corpusHint: $('#corpusHint'),
  selectPop: $('#selectPop'), selectInfo: $('#selectInfo'), btnCopySelect: $('#btnCopySelect'), btnCopySelectRef: $('#btnCopySelectRef'), btnCloseSelect: $('#btnCloseSelect'),
};

const CORPORA = {
  bible:    { id:'bible',    name:'圣经',   short:'圣经',   booksPath:'public/data/books.json',           dataPath:'public/data/cuv.json',               badge:'圣经·和合本' },
  quran:    { id:'quran',    name:'古兰经', short:'古兰经', booksPath:'public/data/quran/books.json',     dataPath:'public/data/quran/quran.json',       badge:'古兰经·马坚' },
  buddhist: { id:'buddhist', name:'佛经',   short:'佛经',   booksPath:'public/data/buddhist/books.json',  dataPath:'public/data/buddhist/buddhist.json', badge:'心经·金刚经' },
  dao:      { id:'dao',      name:'道德经', short:'道德经', booksPath:'public/data/dao/books.json',       dataPath:'public/data/dao/dao.json',           badge:'道德经·81章' },
  lunyu:    { id:'lunyu',    name:'论语',   short:'论语',   booksPath:'public/data/lunyu/books.json',     dataPath:'public/data/lunyu/lunyu.json',       badge:'论语·20篇' },
  zhuangzi: { id:'zhuangzi', name:'庄子',   short:'庄子',   booksPath:'public/data/zhuangzi/books.json',  dataPath:'public/data/zhuangzi/zhuangzi.json', badge:'庄子·内篇' },
  shijing:  { id:'shijing',  name:'诗经',   short:'诗经',   booksPath:'public/data/shijing/books.json',   dataPath:'public/data/shijing/shijing.json',   badge:'诗经·名篇' },
  liuzu:    { id:'liuzu',    name:'六祖坛经', short:'坛经', booksPath:'public/data/liuzu/books.json',     dataPath:'public/data/liuzu/liuzu.json',       badge:'六祖坛经·十品' },
};
const CORPUS_ORDER = ['bible','quran','buddhist','dao','lunyu','zhuangzi','shijing','liuzu'];
const CORPUS_COLOR = { bible:'#1a73e8', quran:'#0b7a4a', buddhist:'#b7791f', dao:'#7c3aed', lunyu:'#e11d48', zhuangzi:'#0891b2', shijing:'#ea580c', liuzu:'#a21caf' };

let settings = loadSettings();
let globalBooks = [];          // [{...book, corpusId, corpusName, short}]
let globalVerses = null;       // {v: [[gb,c,v,text], ...]} 合并后
let versesCorpus = [];         // parallel to globalVerses.v, corpusId per verse index
let corpusCounts = {};         // corpusId -> count
let corpusBookOffset = {};     // corpusId -> start gb index
let tradVerses = null;         // bible trad only
let tradMap = null;            // key b*1e6+c*1e3+v -> 繁体经文
let kjvMap = null;
let chapterIndex = new Map();  // `b|c` -> [verseIdx...]，供「原文（原章节）」整章展开
let worker = null;
let workerReady = false;
let useWorker = true;
let pendingQueryId = 0;
let lastResults = [];
let lastQuery = '';
let lastQWords = [];
let lastQNormSingle='';
let visibleCount = 0;
let selectedIdx = -1;
let debounceTimer = null;
let composing = false;
let t2cn = null;
let t2cnReady = false;
let clipboardPendingText = '';

function applyTheme(){
  const t = settings.theme;
  if (t==='auto') document.documentElement.removeAttribute('data-theme');
  else document.documentElement.setAttribute('data-theme', t);
}
function toast(msg){
  els.toast.textContent = msg;
  els.toast.classList.add('show');
  setTimeout(()=> els.toast.classList.remove('show'), 1600);
}
function fetchJSON(url){
  return new Promise((resolve, reject)=>{
    const xhr = new XMLHttpRequest();
    xhr.open('GET', url, true);
    xhr.responseType = 'text';
    xhr.onload = ()=>{
      if(xhr.status>=200 && xhr.status<300){
        try{ resolve(JSON.parse(xhr.responseText)); }catch(e){ reject(e); }
      } else reject(new Error(url+' '+xhr.status));
    };
    xhr.onerror = ()=> reject(new Error('network '+url));
    xhr.send();
  });
}
function save(){ saveSettings(settings); }
function loadScriptOnce(src){
  return new Promise((resolve, reject)=>{
    if(document.querySelector(`script[data-src="${src}"]`)) return resolve();
    const s=document.createElement('script');
    s.src=src; s.async=true; s.dataset.src=src;
    s.onload=resolve; s.onerror=reject;
    document.head.appendChild(s);
  });
}
async function ensureT2CN(){
  if(t2cn) return t2cn;
  if(t2cnReady) return t2cn;
  t2cnReady=true;
  try{ if(!window.OpenCC) await loadScriptOnce('vendor/opencc-t2cn.min.js'); if(window.OpenCC) t2cn = window.OpenCC.Converter({from:'tw',to:'cn'}); }catch{}
  return t2cn;
}
function t2cnConvert(s){ if(t2cn){ try{ return t2cn(s);}catch{} } return s; }

function createWorker(){
  try{ worker=new Worker('js/worker.js'); }catch(e){ useWorker=false; worker=null; return; }
  worker.onmessage=(e)=>{
    const msg=e.data;
    if(msg.type==='ready'){
      workerReady=true;
      const n=msg.n;
      els.statusText.textContent=`就绪 · 全库 ${n.toLocaleString()} 节`;
      if(els.brandMeta) els.brandMeta.textContent=`全库 · ${n.toLocaleString()} 节`;
      if(els.corpusHint){
        const parts=CORPUS_ORDER.map(id=> `${CORPORA[id].short}${(corpusCounts[id]||0).toLocaleString()}`).join(' · ');
        els.corpusHint.textContent=parts;
      }
      els.progressBar.style.width='100%';
      setTimeout(()=> els.progressBar.style.width='0', 500);
      const q=els.q.value.trim();
      if(q) doSearch(q,true); else renderHistory();
    }else if(msg.type==='result'){
      if(msg.queryId!==pendingQueryId) return;
      handleSearchResult(msg);
    }else if(msg.type==='error'){
      console.warn('worker error',msg.message);
      els.statusText.textContent='搜索出错，已降级';
    }
  };
  worker.onerror=()=>{
    useWorker=false; worker=null;
    els.statusText.textContent='Worker 不可用，已降级到主线程';
    settings.debounce=Math.max(settings.debounce,400); save();
  };
}

// ——— 全量加载 ———
async function loadAll(){
  els.statusText.textContent='正在加载全库…';
  els.progressBar.style.width='8%';
  if(els.brandMeta) els.brandMeta.textContent='全库加载中…';

  const tasks = CORPUS_ORDER.map(async (id, idx)=>{
    const meta=CORPORA[id];
    const [bData, vData] = await Promise.all([ fetchJSON(meta.booksPath), fetchJSON(meta.dataPath) ]);
    return { id, meta, bData, vData };
  });

  // 串行进度更好看，实际并行
  const results = await Promise.all(tasks);

  globalBooks=[];
  const mergedV=[];
  versesCorpus=[];
  corpusCounts={};
  corpusBookOffset={};

  for(const {id, meta, bData, vData} of results){
    const offset = globalBooks.length;
    corpusBookOffset[id]=offset;
    corpusCounts[id]=vData.v.length;
    for(const bk of bData.books){
      globalBooks.push({ ...bk, corpusId:id, corpusName:meta.name, short:meta.short, badge:meta.badge });
    }
    for(const [b,c,v,t] of vData.v){
      mergedV.push([b+offset, c, v, t]);
      versesCorpus.push(id);
    }
  }
  globalVerses={ v: mergedV };
  // 整章索引：供结果卡「原文（原章节）」一键展开整章
  chapterIndex=new Map();
  for(let i=0;i<mergedV.length;i++){
    const k=mergedV[i][0]+'|'+mergedV[i][1];
    let arr=chapterIndex.get(k);
    if(!arr){ arr=[]; chapterIndex.set(k,arr); }
    arr.push(i);
  }
  // 全局 books 供引用解析：合并后仍可用（abbr 含各库）
  Refs.setBooks(globalBooks);

  // 同步工具条
  els.selSort.value=settings.sort;
  if(els.btnBilingual) els.btnBilingual.classList.toggle('active', !!settings.bilingual);
  els.progressBar.style.width='42%';
  els.statusText.textContent='正在构建全库索引…';

  if(useWorker && worker){
    worker.postMessage({ type:'init', verses: globalVerses });
  }else{
    const mod=await import('./search.js');
    mod.buildIndex(globalVerses);
    workerReady=true;
    const n=mergedV.length;
    els.statusText.textContent=`就绪 · 全库 ${n.toLocaleString()} 节（主线程）`;
    if(els.brandMeta) els.brandMeta.textContent=`全库 · ${n.toLocaleString()} 节`;
    els.progressBar.style.width='100%';
    setTimeout(()=> els.progressBar.style.width='0',500);
    renderHistory();
  }

  // 按需加载圣经增强
  if(settings.bilingual) loadKJV(false);
  if(settings.script==='trad') loadTrad(false);

  // 品牌徽标
  if(els.corpusBadge){
    els.corpusBadge.textContent=CORPUS_ORDER.length+' 库全搜';
    els.corpusBadge.style.display='';
  }
}

async function loadKJV(showToast=true){
  if(kjvMap) return;
  try{
    els.statusText.textContent='正在加载 KJV…';
    const j=await fetchJSON('public/data/kjv.json');
    const m=new Map();
    // KJV 的 b 是相对圣经的 0..65，与 globalBooks 中 bible 区的偏移一致（0）
    for(const [b,c,v,t] of j.v){ m.set(b*1000000+c*1000+v, t); }
    kjvMap=m;
    if(showToast) toast('KJV 已加载');
    if(globalVerses) els.statusText.textContent=`就绪 · 全库 ${globalVerses.v.length.toLocaleString()} 节`;
    if(lastResults.length) renderResults(lastResults.slice(0, visibleCount||settings.maxResults), lastQWords, lastQNormSingle);
  }catch(e){
    settings.bilingual=false;
    if(els.btnBilingual) els.btnBilingual.classList.remove('active');
    const chk=document.getElementById('chkBilingual'); if(chk) chk.checked=false;
    save(); toast('KJV 加载失败，已关闭中英对照');
  }
}
async function loadTrad(showToast=true){
  if(tradVerses) return;
  try{
    const j=await fetchJSON('public/data/cuv_trad.json');
    tradVerses=j;
    // 建映射，避免每次渲染线性扫描 3 万节
    tradMap=new Map();
    for(const [b,c,v,t] of j.v){ tradMap.set(b*1000000+c*1000+v, t); }
    if(showToast) toast('繁体已加载');
    if(lastResults.length) renderResults(lastResults.slice(0, visibleCount||settings.maxResults), lastQWords, lastQNormSingle);
  }catch(e){
    settings.script='simp';
    const sel=document.getElementById('selScript'); if(sel) sel.value='simp';
    save(); toast('繁体加载失败，已回退简体');
  }
}

// ——— 搜索 ———
function scheduleSearch(q, immediate=false){
  if(composing) return;
  if(debounceTimer) clearTimeout(debounceTimer);
  const d = immediate ? 0 : settings.debounce;
  if(!q.trim()){
    clearResults(true);
    renderHistory();
    const n=globalVerses? globalVerses.v.length.toLocaleString() : '';
    els.statusText.textContent=`就绪 · 全库 ${n} 节`;
    els.statusTime.textContent='';
    if(els.emptyState) els.emptyState.classList.remove('hidden');
    return;
  }
  if(q.length>200){ q=q.slice(0,200); els.q.value=q; toast('已截断到 200 字'); }
  debounceTimer=setTimeout(()=> doSearch(q), d);
}

function doSearch(raw){
  if(!globalVerses) return;
  const q=String(raw).trim();
  if(!q) return;
  lastQuery=q;

  // 引用直达：对全库 books 尝试
  const ref=Refs.parseRef(q, globalBooks);
  if(ref){
    handleRefJump(ref, q);
  }else{
    els.jumpCard.classList.add('hidden');
    els.jumpCard.innerHTML='';
  }

  let qForSearch=q;
  if(t2cn) qForSearch=t2cnConvert(q);
  else if(/[\u3400-\u9FFF]/.test(q)) ensureT2CN();

  pendingQueryId++;
  const qid=pendingQueryId;
  const opts={ maxResults: settings.maxResults, sort: settings.sort, fuzzy: settings.fuzzy };
  els.statusText.textContent='全库搜索中…';
  els.skeletons.classList.remove('hidden');
  els.results.innerHTML='';
  els.btnLoadMore.classList.add('hidden');
  selectedIdx=-1;

  if(!normalize(qForSearch)){
    clearResults(true);
    els.skeletons.classList.add('hidden');
    els.statusText.textContent='请输入关键词';
    return;
  }

  if(useWorker && worker && workerReady){
    worker.postMessage({ type:'search', query:qForSearch, opts, queryId:qid });
  }else{
    import('./search.js').then(mod=>{
      if(!mod.isReady()) mod.buildIndex(globalVerses);
      const res=mod.search(qForSearch, opts);
      handleSearchResult({ ...res, queryId:qid, query:qForSearch, qWords:res.qWords, qNormSingle:res.qNormSingle, timeMs:res.timeMs, fuzzyUsed:res.fuzzyUsed, results:res.results });
    });
  }
}

function handleSearchResult(msg){
  els.skeletons.classList.add('hidden');
  const { results, timeMs, fuzzyUsed, qWords, qNormSingle }=msg;
  lastResults=results;
  lastQWords=qWords||[];
  lastQNormSingle=qNormSingle||'';
  visibleCount=Math.min(settings.maxResults, results.length);
  pushHistory(settings, lastQuery);

  if(!results.length){
    els.results.innerHTML=`<div class="empty"><div class="big">没找到「${escapeHtml(lastQuery)}」</div><div class="mono" style="margin:8px 0 10px">已全库检索，试试更短的关键词</div><button id="btnTryFuzzy" class="btn small">试试模糊搜索</button></div>`;
    const b=document.getElementById('btnTryFuzzy');
    if(b) b.onclick=()=>{
      const prev=settings.fuzzy;
      settings.fuzzy=true; save();
      const chk=document.getElementById('chkFuzzy'); if(chk) chk.checked=true;
      doSearch(lastQuery); settings.fuzzy=prev;
    };
    els.statusText.textContent='无结果 · 全库';
    els.statusTime.textContent='';
    renderHistory();
    return;
  }
  els.statusText.textContent=`全库结果 ${results.length} 条${fuzzyUsed?' · 近似':''} · 用时 ${timeMs}ms`;
  els.statusTime.textContent='';
  if(fuzzyUsed){
    const tip=document.createElement('div');
    tip.className='card'; tip.style.cursor='default';
    tip.innerHTML=`<div class="mono" style="color:var(--muted)">未找到完全匹配，以下为全库近似结果</div>`;
    els.results.appendChild(tip);
  }
  renderResults(results.slice(0, visibleCount), lastQWords, lastQNormSingle);
  if(results.length>visibleCount) els.btnLoadMore.classList.remove('hidden');
  else els.btnLoadMore.classList.add('hidden');
  if(els.emptyState) els.emptyState.classList.add('hidden');
  renderHistory();
}

function renderResults(list, qWords, qNormSingle){
  els.results.innerHTML='';
  for(let i=0;i<list.length;i++){
    const r=list[i];
    els.results.appendChild(buildCard(r, qWords, qNormSingle, i));
  }
  updateSelection();
}

function getCorpusOf(idx, b){
  // 优先用 verse 索引，其次用 book
  const cid = versesCorpus[idx] || (globalBooks[b] && globalBooks[b].corpusId) || 'bible';
  return CORPORA[cid] || CORPORA.bible;
}

// 繁体 / KJV 查找（仅圣经区），b 为全局书号
function tradFor(b,c,v){
  if(!(settings.script==='trad' && tradMap)) return null;
  return tradMap.get((b-(corpusBookOffset['bible']||0))*1000000 + c*1000 + v) || null;
}
function kjvFor(b,c,v){
  if(!(settings.bilingual && kjvMap)) return null;
  return kjvMap.get((b-(corpusBookOffset['bible']||0))*1000000 + c*1000 + v) || null;
}

function buildCard(r, qWords, qNormSingle, idx){
  const bk=globalBooks[r.b];
  const cid = versesCorpus[r.idx] || bk.corpusId;
  const corpus = CORPORA[cid] || CORPORA.bible;
  const zhRef=`《${bk.zh}》${r.c}:${r.v}`;
  const tagColor=CORPUS_COLOR[cid]||'var(--muted)';

  let displayText=r.text;
  if(cid==='bible'){ const t=tradFor(r.b,r.c,r.v); if(t) displayText=t; }
  const enText = (cid==='bible' && settings.bilingual && kjvMap) ? (kjvFor(r.b,r.c,r.v) || '—') : '';

  const card=document.createElement('div');
  card.className='card';
  card.dataset.idx=String(idx);
  let verseHtml = (settings.highlight && qWords && qWords.length) ? highlightHtml(displayText, qWords) : escapeHtml(displayText);
  const needFold=[...displayText].length>42;
  card.innerHTML=`
    <div class="verse verse-main" style="font-size:${settings.fontSize}px">${verseHtml}</div>
    ${ (cid==='bible' && settings.bilingual) ? `<div class="en">${escapeHtml(enText)}</div>` : ``}
    <div class="meta">
      <span class="ref"><span class="corpus-tag" style="border-color:${tagColor};color:${tagColor}">${corpus.short}</span>${zhRef}</span>
      <span class="actions">${needFold ? `<button class="btn small btn-expand">展开</button>` : ``}<button class="btn small btn-chapter">原文（原章节）</button><button class="btn small btn-copy">复制整节</button></span>
    </div>
    <div class="ctx mono"></div>
  `;
  const verseEl=card.querySelector('.verse-main');
  verseEl.style.fontSize=settings.fontSize+'px';
  if(needFold){
    const chars=[...displayText];
    const shortText=chars.slice(0,42).join('')+'…';
    const shortH=(settings.highlight && qWords && qWords.length) ? highlightHtml(shortText, qWords) : escapeHtml(shortText);
    verseEl.innerHTML=shortH;
    verseEl.dataset.full=verseHtml;
    verseEl.dataset.short=shortH;
    verseEl.dataset.fold='1';
    const btnExpand=card.querySelector('.btn-expand');
    const toggleFold=(ev)=>{ if(ev) ev.stopPropagation(); const folded=verseEl.dataset.fold==='1'; verseEl.innerHTML=folded? verseEl.dataset.full:verseEl.dataset.short; verseEl.dataset.fold=folded?'0':'1'; if(btnExpand) btnExpand.textContent=folded?'收起':'展开'; };
    if(btnExpand) btnExpand.addEventListener('click', toggleFold);
    verseEl.addEventListener('click',(e)=>{ if(window.getSelection().toString().trim()) return; toggleFold(e); });
    verseEl.style.cursor='pointer'; verseEl.title='点此展开/收起，长按拖选可只复制选中文字';
  }
  card.addEventListener('click',(e)=>{
    if(e.target.closest('.btn-copy')||e.target.closest('.btn-expand')||e.target.closest('.btn-chapter')) return;
    if(e.target.closest('.ref')){ toggleContext(card,r); return; }
    if(needFold && e.target.closest('.verse-main')) return;
    if(window.getSelection().toString().trim()) return;
    doCopy(r);
  });
  card.querySelector('.btn-copy').addEventListener('click',(e)=>{ e.stopPropagation(); doCopy(r); });
  const btnChapter=card.querySelector('.btn-chapter');
  if(btnChapter) btnChapter.addEventListener('click',(e)=>{ e.stopPropagation(); toggleChapter(card,r); });
  const refEl=card.querySelector('.ref');
  refEl.style.cursor='pointer'; refEl.title='点击查看上下文';
  refEl.addEventListener('click',(e)=>{ e.stopPropagation(); toggleContext(card,r); });
  return card;
}

async function doCopy(item){
  // item 来自 worker：{b,c,v,text,idx}
  const payload=buildCopyPayload(item, settings, globalBooks, kjvMap);
  const ok=await copyText(payload);
  toast(ok?'已复制':'复制失败，请长按选择文字');
}

function renderChapterLines(idxs, r, cid){
  return idxs.map(i=>{
    const [b,c,v,t]=globalVerses.v[i];
    let text=t;
    if(cid==='bible'){ const tr=tradFor(b,c,v); if(tr) text=tr; }
    const en=(cid==='bible' && settings.bilingual && kjvMap) ? (kjvFor(b,c,v)||'') : '';
    const cur = i===r.idx ? ' current' : '';
    return `<div class="ctx-line${cur}"><span class="ctx-v">${v}</span><span class="ctx-t">${escapeHtml(text)}</span>${en?`<div class="ctx-en">${escapeHtml(en)}</div>`:``}</div>`;
  }).join('');
}
function clearCtx(card){
  card.classList.remove('expanded','chapter-open');
  const ctxEl=card.querySelector('.ctx');
  if(ctxEl) ctxEl.innerHTML='';
}
// 邻近经文（±2 节）
function toggleContext(card, r){
  const wasOpen=card.classList.contains('expanded');
  clearCtx(card);
  if(wasOpen) return;
  const cid = versesCorpus[r.idx] || (globalBooks[r.b] && globalBooks[r.b].corpusId);
  const idxs=(chapterIndex.get(r.b+'|'+r.c) || []).filter(i=>{
    const v=globalVerses.v[i][2]; return v>=r.v-2 && v<=r.v+2;
  });
  const ctxEl=card.querySelector('.ctx');
  ctxEl.innerHTML=renderChapterLines(idxs, r, cid);
  card.classList.add('expanded');
}
// 原文（原章节）：展开该节所在整章原文
function toggleChapter(card, r){
  const wasOpen=card.classList.contains('chapter-open');
  clearCtx(card);
  if(wasOpen) return;
  const cid = versesCorpus[r.idx] || (globalBooks[r.b] && globalBooks[r.b].corpusId);
  const idxs=chapterIndex.get(r.b+'|'+r.c) || [];
  const bk=globalBooks[r.b];
  const ctxEl=card.querySelector('.ctx');
  ctxEl.innerHTML=`<div class="ctx-head">《${escapeHtml(bk.zh)}》第 ${r.c} 章 · 共 ${idxs.length} 节</div>`+renderChapterLines(idxs, r, cid);
  card.classList.add('chapter-open');
}

function clearResults(hideLoadMore=true){
  els.results.innerHTML='';
  if(hideLoadMore) els.btnLoadMore.classList.add('hidden');
  els.jumpCard.classList.add('hidden');
  els.jumpCard.innerHTML='';
  hideSelPop();
}

// ——— 节选复制（选中 verse 内文字即浮出工具条） ———
let _selR=null;
let _selHideTimer=null;
function selInsideResults(sel){
  if(!sel || sel.rangeCount===0) return false;
  const anc=sel.anchorNode, foc=sel.focusNode;
  const inR = (n)=> n && (n.nodeType===1 ? n.closest('#results') : n.parentElement && n.parentElement.closest('#results'));
  return !!(inR(anc) || inR(foc));
}
function getSelCard(sel){
  try{
    const r=sel.getRangeAt(0);
    let n=r.commonAncestorContainer;
    const el=n.nodeType===1 ? n : n.parentElement;
    return el ? el.closest('.card') : null;
  }catch{ return null; }
}
function showSelPop(text, r){
  if(!els.selectPop) return;
  const len=[...text].length;
  if(els.selectInfo) els.selectInfo.textContent=`已选 ${len} 字`;
  els.selectPop.classList.remove('hidden');
  requestAnimationFrame(()=> els.selectPop.classList.add('show'));
  _selR=r;
  clearTimeout(_selHideTimer);
}
function hideSelPop(){
  if(!els.selectPop) return;
  els.selectPop.classList.remove('show');
  _selHideTimer=setTimeout(()=> els.selectPop.classList.add('hidden'), 240);
  _selR=null;
}
function refreshSelPop(){
  const sel=window.getSelection();
  const txt=(sel? sel.toString().trim(): '');
  if(!txt || txt.length<1 || !selInsideResults(sel)){ hideSelPop(); return; }
  const ae=document.activeElement;
  if(ae && ae.id==='q'){ hideSelPop(); return; }
  if(txt.length>500){ hideSelPop(); return; }
  const card=getSelCard(sel);
  let r=null;
  if(card && card.dataset.idx!==undefined){
    const idx=parseInt(card.dataset.idx,10);
    r=lastResults[idx] || null;
  }
  if(!r && lastResults.length) r=lastResults[0];
  showSelPop(txt, r);
}
let _selDebounce=null;
function scheduleSelRefresh(){ clearTimeout(_selDebounce); _selDebounce=setTimeout(refreshSelPop, 90); }
function buildSelPayload(selected, r, withRef){
  if(!r) return selected;
  const bk=globalBooks[r.b];
  const zhRef=`《${bk.zh}》${r.c}:${r.v}`;
  const pureRef=`${bk.zh} ${r.c}:${r.v}`;
  const cid = (r && r.idx!==undefined ? (versesCorpus[r.idx]||bk.corpusId) : bk.corpusId);
  const enMap=(cid==='bible'? kjvMap : null);
  const enText=enMap? (enMap.get((r.b-(corpusBookOffset['bible']||0))*1000000 + r.c*1000 + r.v)||'') : '';
  if(!withRef) return selected;
  if(settings.copyFormat==='plain') return selected;
  if(settings.copyFormat==='withRef') return `${selected}\n——${zhRef}`;
  return formatWithTemplate(settings.customTemplate, { text:selected, ref:zhRef, enText, pureRef });
}
async function doSelCopy(withRef){
  const sel=window.getSelection();
  const txt=(sel? sel.toString().trim(): '');
  if(!txt){ toast('请先选中文字'); return; }
  const payload=buildSelPayload(txt, _selR, withRef);
  const ok=await copyText(payload);
  toast(ok? (withRef?'已复制选中+出处':'已复制选中') : '复制失败，请长按复制');
  // 复制后不清选区，方便再次操作
}

function renderHistory(){
  const h=settings.history||[];
  const panel=els.historyPanel;
  const chips=els.historyChips;
  if(!chips) return;
  if(!h.length){
    if(panel) panel.classList.add('hidden');
    chips.innerHTML='';
    return;
  }
  if(panel) panel.classList.remove('hidden');
  chips.innerHTML='';
  h.forEach(q=>{
    const chip=document.createElement('button');
    chip.className='chip';
    chip.type='button';
    // 使用 CSS 截断，避免文本过长撑破布局
    chip.style.maxWidth='100%';
    chip.innerHTML=`<span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:18ch;display:inline-block;vertical-align:bottom">${escapeHtml(q)}</span><span class="chip-del" role="button" aria-label="删除" title="删除">×</span>`;
    const del=chip.querySelector('.chip-del');
    del.addEventListener('click',(e)=>{
      e.stopPropagation();
      settings.history=settings.history.filter(x=>x!==q);
      save(); renderHistory();
    });
    chip.addEventListener('click',()=>{
      els.q.value=q;
      els.btnClear.classList.remove('hidden');
      if(els.emptyState) els.emptyState.classList.add('hidden');
      scheduleSearch(q,true);
      els.q.focus();
    });
    chips.appendChild(chip);
  });
}

function handleRefJump(ref, raw){
  let items=[];
  if(ref.chapterOnly){
    for(let i=0;i<globalVerses.v.length;i++){
      const [b,c,v,t]=globalVerses.v[i];
      if(b===ref.bookIndex && c===ref.chapter) items.push({ idx:i, b,c,v, text:t });
    }
  }else{
    for(let v=ref.verseStart; v<=ref.verseEnd; v++){
      for(let i=0;i<globalVerses.v.length;i++){
        const [b,c,vv,t]=globalVerses.v[i];
        if(b===ref.bookIndex && c===ref.chapter && vv===v){ items.push({ idx:i,b,c,v:vv,text:t }); break; }
      }
    }
  }
  if(!items.length){ els.jumpCard.classList.add('hidden'); return; }
  const bk=globalBooks[ref.bookIndex];
  const title = ref.chapterOnly ? `《${bk.zh}》${ref.chapter}章 · 跳转` : `《${bk.zh}》${ref.chapter}:${ref.verseStart}${ref.verseEnd!==ref.verseStart?'-'+ref.verseEnd:''} · 跳转`;
  const cid=bk.corpusId;
  const jump=document.createElement('div');
  jump.className='card jump';
  jump.innerHTML=`<div style="display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap"><strong>${title}</strong><span style="display:flex;gap:6px"><button class="btn small primary btn-jump-copy">复制本段</button></span></div>
  <div style="margin-top:8px;display:grid;gap:6px">${items.map(it=>{
    const t=(cid==='bible' && tradFor(it.b,it.c,it.v)) || it.text;
    const en=(cid==='bible'&&settings.bilingual&&kjvMap)?(kjvFor(it.b,it.c,it.v)||'—'):'';
    return `<div class="mono" style="line-height:1.7"><span class="corpus-tag" style="border-color:${CORPUS_COLOR[cid]||'var(--border)'};color:${CORPUS_COLOR[cid]||'var(--muted)'}">${CORPORA[cid].short}</span><span class="ref">${globalBooks[it.b].zh} ${it.c}:${it.v}</span> ${escapeHtml(t)}${(cid==='bible'&&settings.bilingual)? `<br><span style="color:var(--muted)">${escapeHtml(en)}</span>`:''}</div>`;
  }).join('')}</div>`;
  jump.querySelector('.btn-jump-copy').onclick=async()=>{
    const lines=items.map(it=>{
      const t=(cid==='bible' && tradFor(it.b,it.c,it.v)) || it.text;
      const zhRef=`《${globalBooks[it.b].zh}》${it.c}:${it.v}`;
      if(settings.copyFormat==='plain') return t;
      if(settings.copyFormat==='withRef') return `${t}\n——${zhRef}`;
      const en=kjvFor(it.b,it.c,it.v) || '';
      return formatWithTemplate(settings.customTemplate, { text:t, ref:zhRef, enText:en, pureRef:`${globalBooks[it.b].zh} ${it.c}:${it.v}` });
    });
    const ok=await copyText(lines.join('\n'));
    toast(ok?'已复制':'复制失败');
  };
  els.jumpCard.innerHTML='';
  els.jumpCard.appendChild(jump);
  els.jumpCard.classList.remove('hidden');
}
function handleChapterResult(){}

function bindEvents(){
  els.q.addEventListener('compositionstart',()=> composing=true);
  els.q.addEventListener('compositionend',()=>{ composing=false; scheduleSearch(els.q.value); });
  els.q.addEventListener('input',()=>{
    const v=els.q.value;
    els.btnClear.classList.toggle('hidden', !v);
    if(v.trim()){
      if(els.emptyState) els.emptyState.classList.add('hidden');
    }else{
      if(els.emptyState) els.emptyState.classList.remove('hidden');
      clearResults(); renderHistory();
    }
    scheduleSearch(v);
  });
  els.q.addEventListener('keydown',(e)=>{
    const cards=[...els.results.querySelectorAll('.results > .card')].filter(c=> !c.classList.contains('jump'));
    // 兼容旧选择器
    const allCards=[...els.results.querySelectorAll('.card')];
    if(e.key==='ArrowDown'){
      e.preventDefault();
      selectedIdx=Math.min(selectedIdx+1, allCards.length-1);
      if(selectedIdx<0 && allCards.length) selectedIdx=0;
      updateSelection(); allCards[selectedIdx]?.scrollIntoView({block:'nearest'});
    }else if(e.key==='ArrowUp'){
      e.preventDefault();
      selectedIdx=Math.max(selectedIdx-1,0);
      updateSelection(); allCards[selectedIdx]?.scrollIntoView({block:'nearest'});
    }else if(e.key==='Enter'){
      if(selectedIdx>=0){ const it=lastResults[selectedIdx]; if(it) doCopy(it); }
      else if(lastResults[0]) doCopy(lastResults[0]);
    }else if(e.key==='Escape'){
      e.preventDefault(); els.q.value=''; els.btnClear.classList.add('hidden'); clearResults(); if(els.emptyState) els.emptyState.classList.remove('hidden'); renderHistory(); els.q.focus();
    }
  });
  document.addEventListener('keydown',(e)=>{ if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='k'){ e.preventDefault(); els.q.focus(); els.q.select(); }});
  els.btnClear.onclick=()=>{
    els.q.value=''; els.btnClear.classList.add('hidden'); clearResults(); if(els.emptyState) els.emptyState.classList.remove('hidden'); const n=globalVerses? globalVerses.v.length.toLocaleString():''; els.statusText.textContent=`就绪 · 全库 ${n} 节`; renderHistory(); els.q.focus();
  };
  els.btnPaste.onclick=handlePasteClick;
  els.btnRandom.onclick=()=>{
    if(!globalVerses) return;
    const i=Math.floor(Math.random()*globalVerses.v.length);
    const [b,c,v,t]=globalVerses.v[i];
    const item={ idx:i, b,c,v, text:t };
    els.jumpCard.innerHTML=''; els.jumpCard.classList.add('hidden');
    lastResults=[item]; lastQWords=[]; lastQNormSingle=''; visibleCount=1;
    els.results.innerHTML='';
    const card=buildCard(item, [], '', 0);
    card.classList.add('jump');
    const badge=document.createElement('span'); badge.className='badge'; badge.textContent='随便读一节 · 全库';
    card.querySelector('.ref').appendChild(badge);
    els.results.appendChild(card);
    if(els.emptyState) els.emptyState.classList.add('hidden');
    els.statusText.textContent='随机一节 · 全库';
    els.btnLoadMore.classList.add('hidden');
  };
  if(els.btnRandomBible) els.btnRandomBible.onclick=()=>{
    if(!globalVerses) return;
    // 仅圣经区随机
    const bibleCount=corpusCounts['bible']||0;
    if(!bibleCount) return;
    const i=Math.floor(Math.random()*bibleCount);
    const [b,c,v,t]=globalVerses.v[i];
    const item={ idx:i, b,c,v, text:t };
    els.jumpCard.innerHTML=''; els.jumpCard.classList.add('hidden');
    lastResults=[item]; lastQWords=[]; lastQNormSingle=''; visibleCount=1;
    els.results.innerHTML='';
    const card=buildCard(item, [], '', 0);
    card.classList.add('jump');
    const badge=document.createElement('span'); badge.className='badge'; badge.textContent='随便读一节 · 圣经';
    card.querySelector('.ref').appendChild(badge);
    els.results.appendChild(card);
    if(els.emptyState) els.emptyState.classList.add('hidden');
    els.statusText.textContent='随机一节 · 圣经';
    els.btnLoadMore.classList.add('hidden');
  };
  els.btnLoadMore.onclick=()=>{
    const nextEnd=Math.min(lastResults.length, visibleCount+50);
    const slice=lastResults.slice(visibleCount, nextEnd);
    for(const r of slice){
      els.results.appendChild(buildCard(r, lastQWords, lastQNormSingle, visibleCount));
      visibleCount++;
    }
    updateSelection();
    if(visibleCount>=lastResults.length) els.btnLoadMore.classList.add('hidden');
  };
  if(els.btnBilingual) els.btnBilingual.onclick=async()=>{
    settings.bilingual=!settings.bilingual;
    els.btnBilingual.classList.toggle('active', settings.bilingual);
    const chk=document.getElementById('chkBilingual'); if(chk) chk.checked=settings.bilingual;
    save();
    if(settings.bilingual) await loadKJV();
    else if(lastResults.length) renderResults(lastResults.slice(0,visibleCount), lastQWords, lastQNormSingle);
  };
  els.selSort.onchange=()=>{ settings.sort=els.selSort.value; save(); const sp=document.getElementById('selSortPanel'); if(sp) sp.value=settings.sort; if(lastQuery) doSearch(lastQuery); };
  els.btnSettings.onclick=()=> els.dlg.showModal();
  els.btnCloseSettings.onclick=()=> els.dlg.close();
  els.dlg.addEventListener('click',(e)=>{
    const r=els.dlg.getBoundingClientRect();
    if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom) els.dlg.close();
  });
  bindSettingsPanel();
  // 节选浮条：监听选区变化 + 点击按钮
  document.addEventListener('selectionchange', scheduleSelRefresh);
  document.addEventListener('mouseup', scheduleSelRefresh);
  document.addEventListener('touchend', scheduleSelRefresh);
  document.addEventListener('keydown',(e)=>{ if(e.key==='Escape') hideSelPop(); });
  if(els.btnCopySelect) els.btnCopySelect.onclick=()=> doSelCopy(false);
  if(els.btnCopySelectRef) els.btnCopySelectRef.onclick=()=> doSelCopy(true);
  if(els.btnCloseSelect) els.btnCloseSelect.onclick=()=> hideSelPop();
  // 点其他区域（非浮条/非选区）自动隐藏
  document.addEventListener('mousedown',(e)=>{
    if(els.selectPop && !els.selectPop.contains(e.target) && !e.target.closest('.card')){
      // 延迟一下，让 selectionchange 先跑
      setTimeout(()=>{ const s=window.getSelection()?.toString().trim(); if(!s) hideSelPop(); }, 160);
    }
  });
  window.addEventListener('focus', tryReadClipboardOnFocus);
  els.btnDismissPaste.onclick=()=> els.pasteHint.classList.add('hidden');
  els.btnUseClipboard.onclick=()=>{
    const t=clipboardPendingText;
    els.pasteHint.classList.add('hidden');
    if(t){ els.q.value=t; els.btnClear.classList.remove('hidden'); if(els.emptyState) els.emptyState.classList.add('hidden'); scheduleSearch(t,true); els.q.focus(); }
  };
  const btnClearHistory2=document.getElementById('btnClearHistory2');
  if(btnClearHistory2) btnClearHistory2.onclick=(e)=>{ e.preventDefault(); settings.history=[]; save(); renderHistory(); toast('已清空历史'); };
}
function updateSelection(){
  const cards=[...els.results.querySelectorAll('.card')];
  cards.forEach((c,i)=> c.classList.toggle('selected', i===selectedIdx));
}
async function handlePasteClick(){
  try{
    const t=await navigator.clipboard.readText();
    if(t && t.trim()){
      els.q.value=t.trim().slice(0,200);
      els.btnClear.classList.remove('hidden');
      if(els.emptyState) els.emptyState.classList.add('hidden');
      scheduleSearch(els.q.value, true); els.q.focus(); return;
    }
  }catch{}
  toast('请长按输入框粘贴'); els.q.focus();
}
let lastClipboardCheck=0;
async function tryReadClipboardOnFocus(){
  const now=Date.now();
  if(now-lastClipboardCheck<3000) return;
  lastClipboardCheck=now;
  try{
    const t=await navigator.clipboard.readText();
    if(!t) return;
    const tt=t.trim();
    if(tt.length<8||tt.length>200) return;
    if(/https?:\/\//i.test(tt)) return;
    if(tt===els.q.value.trim()) return;
    clipboardPendingText=tt;
    els.pasteHintText.textContent=`检测到「${tt.slice(0,24)}${tt.length>24?'…':''}」，粘贴搜索？`;
    els.pasteHint.classList.remove('hidden');
    setTimeout(()=> els.pasteHint.classList.add('hidden'),6000);
  }catch{}
}
function bindSettingsPanel(){
  const byId=id=> document.getElementById(id);
  const rCopy=[...document.querySelectorAll('input[name="copyFormat"]')];
  const inpTpl=byId('inpTemplate'), tplPrev=byId('tplPreview');
  const rangeFont=byId('rangeFont'), fontVal=byId('fontVal'), chkHl=byId('chkHighlight'), selScript=byId('selScript');
  const selMax=byId('selMax'), selDeb=byId('selDebounce'), chkFuzzy=byId('chkFuzzy'), chkBil=byId('chkBilingual'), selTheme=byId('selTheme'), selSortPanel=byId('selSortPanel');
  function refreshTplPreview(){
    const tpl=inpTpl.value||'「$1」——$2';
    const sampleText='起初，神创造天地。';
    const sampleRef='《创世记》1:1';
    const sampleEn='In the beginning God created the heaven and the earth.';
    const samplePure='创世记 1:1';
    tplPrev.textContent=formatWithTemplate(tpl, {text:sampleText, ref:sampleRef, enText:sampleEn, pureRef:samplePure});
  }
  function sync(){
    rCopy.forEach(r=> r.checked=r.value===settings.copyFormat);
    inpTpl.value=settings.customTemplate;
    inpTpl.disabled=settings.copyFormat!=='custom';
    rangeFont.value=String(settings.fontSize);
    fontVal.textContent=settings.fontSize+'px';
    chkHl.checked=!!settings.highlight;
    selScript.value=settings.script;
    selMax.value=String(settings.maxResults);
    selDeb.value=String(settings.debounce);
    chkFuzzy.checked=!!settings.fuzzy;
    if(chkBil) chkBil.checked=!!settings.bilingual;
    selTheme.value=settings.theme;
    if(selSortPanel) selSortPanel.value=settings.sort;
    refreshTplPreview();
  }
  sync();
  rCopy.forEach(r=> r.addEventListener('change',()=>{
    settings.copyFormat=r.value; inpTpl.disabled=settings.copyFormat!=='custom'; save(); refreshTplPreview();
    if(lastResults.length) renderResults(lastResults.slice(0,visibleCount), lastQWords, lastQNormSingle);
  }));
  inpTpl.addEventListener('input',()=>{ settings.customTemplate=inpTpl.value; save(); refreshTplPreview(); });
  rangeFont.addEventListener('input',()=>{
    settings.fontSize=parseInt(rangeFont.value,10);
    fontVal.textContent=settings.fontSize+'px'; save();
    if(lastResults.length) renderResults(lastResults.slice(0,visibleCount), lastQWords, lastQNormSingle);
  });
  chkHl.addEventListener('change',()=>{ settings.highlight=chkHl.checked; save(); if(lastResults.length) renderResults(lastResults.slice(0,visibleCount), lastQWords, lastQNormSingle); });
  selScript.addEventListener('change', async()=>{
    settings.script=selScript.value; save();
    if(settings.script==='trad') await loadTrad();
    if(lastResults.length) renderResults(lastResults.slice(0,visibleCount), lastQWords, lastQNormSingle);
    if(!els.jumpCard.classList.contains('hidden') && lastQuery){
      const ref=Refs.parseRef(lastQuery, globalBooks);
      if(ref) handleRefJump(ref, lastQuery);
    }
  });
  selMax.addEventListener('change',()=>{ settings.maxResults=parseInt(selMax.value,10); save(); if(lastQuery) doSearch(lastQuery); });
  selDeb.addEventListener('change',()=>{ settings.debounce=parseInt(selDeb.value,10); save(); });
  if(selSortPanel) selSortPanel.addEventListener('change',()=>{ settings.sort=selSortPanel.value; els.selSort.value=settings.sort; save(); if(lastQuery) doSearch(lastQuery); });
  chkFuzzy.addEventListener('change',()=>{ settings.fuzzy=chkFuzzy.checked; save(); if(lastQuery) doSearch(lastQuery); });
  if(chkBil) chkBil.addEventListener('change', async()=>{
    settings.bilingual=chkBil.checked; if(els.btnBilingual) els.btnBilingual.classList.toggle('active', settings.bilingual); save();
    if(settings.bilingual) await loadKJV(); else if(lastResults.length) renderResults(lastResults.slice(0,visibleCount), lastQWords, lastQNormSingle);
  });
  selTheme.addEventListener('change',()=>{ settings.theme=selTheme.value; save(); applyTheme(); });
  const btnReset=byId('btnResetSettings');
  if(btnReset) btnReset.onclick=(e)=>{
    e.preventDefault();
    const keepHistory=settings.history;
    settings={ ...defaults, history: keepHistory };
    save(); applyTheme(); sync();
    els.selSort.value=settings.sort;
    if(els.btnBilingual) els.btnBilingual.classList.toggle('active', !!settings.bilingual);
    if(settings.bilingual) loadKJV(false);
    if(settings.script==='trad') loadTrad(false);
    if(lastQuery) doSearch(lastQuery); else { clearResults(); renderHistory(); }
    toast('已恢复默认设置');
  };
  byId('btnClearHistory').onclick=(e)=>{ e.preventDefault(); settings.history=[]; save(); renderHistory(); toast('已清空历史'); };
  byId('btnClearCache').onclick=async(e)=>{
    e.preventDefault(); try{ localStorage.removeItem('bible-app-v1'); }catch{}
    if('caches' in window){ const ks=await caches.keys(); for(const k of ks) await caches.delete(k); }
    toast('已清除，刷新后生效');
  };
}

// ——— 启动 ———
applyTheme();
createWorker();
bindEvents();
if('serviceWorker' in navigator){ navigator.serviceWorker.register('sw.js').catch(()=>{}); }
loadAll().catch(err=>{
  els.statusText.textContent='数据加载失败：'+(err.message||err);
  els.statusText.style.color='#c00';
  const retry=document.createElement('button'); retry.className='btn small'; retry.textContent='重试'; retry.onclick=()=> location.reload();
  els.statusText.appendChild(retry);
  console.error(err);
});
