// js/worker.js — classic Worker（非 module），自包含搜索内核
// 避免 ESM 在 Worker 中的兼容问题，逻辑与 js/search.js 保持一致

const PUNCT_RE = /[。，、；：？！“”‘’「」『』（）《》〈〉…—－·,.!?;:'"()\[\]{}<>\/\\|~`@#$%^&*+=_\-]/g;
function normalize(s) {
  return s.normalize('NFKC').replace(/[\u3000\s]+/g,'').replace(PUNCT_RE,'').replace(/[A-Z]/g, m=>m.toLowerCase());
}

let texts=null, norm=null, haystack='', offsets=null, bookChVers=null, ready=false;
let hasUFuzzy=false;
try { importScripts('../vendor/ufuzzy.min.js'); if (typeof uFuzzy !== 'undefined') hasUFuzzy=true; } catch(e) {}

function buildIndex(verses) {
  const n = verses.v.length;
  texts = new Array(n);
  norm = new Array(n);
  bookChVers = new Array(n);
  offsets = new Uint32Array(n+1);
  let hs='';
  for (let i=0;i<n;i++) {
    const [b,c,v,t]=verses.v[i];
    texts[i]=t; bookChVers[i]=[b,c,v];
    const nn=normalize(t);
    norm[i]=nn;
    offsets[i]=hs.length;
    hs+=nn;
    offsets[i+1]=hs.length;
  }
  haystack=hs; ready=true;
  return { n, haystackLen: hs.length };
}
function findVerseIndexByPos(pos){
  let lo=0, hi=offsets.length-2, ans=0;
  while(lo<=hi){ const mid=(lo+hi)>>1; if(offsets[mid]<=pos){ans=mid; lo=mid+1;} else hi=mid-1; }
  return ans;
}
function scoreVerse(normText,qNorm,hitCount){ let s=0; if(normText===qNorm) s+=1000; s+=hitCount*30; s-=normText.length/10; return s; }

function search(queryRaw, opts){
  const maxResults = opts.maxResults||50;
  const sort = opts.sort||'canon';
  const fuzzy = opts.fuzzy!==false;
  const qNormSingle = normalize(queryRaw);
  const wordsRaw = queryRaw.trim().split(/\s+/).filter(Boolean);
  const words = wordsRaw.map(w=>normalize(w)).filter(Boolean);
  if(!words.length || !ready) return { results:[], timeMs:0, fuzzyUsed:false, qWords:words, qNormSingle };
  const t0 = performance.now();
  let shortest=words[0], si=0;
  for(let i=1;i<words.length;i++) if(words[i].length<shortest.length){shortest=words[i]; si=i;}
  const otherWords = words.filter((_,i)=>i!==si);
  const hitPos=[];
  let p=haystack.indexOf(shortest);
  while(p!==-1){ hitPos.push(p); p=haystack.indexOf(shortest,p+1); if(hitPos.length>50000) break; }
  const verseSet=new Map();
  for(const pos of hitPos){
    const vi=findVerseIndexByPos(pos);
    let ok=true;
    for(const w of otherWords){ if(!norm[vi].includes(w)){ ok=false; break; } }
    if(!ok) continue;
    verseSet.set(vi,(verseSet.get(vi)||0)+1);
  }
  let candidates=[...verseSet.entries()];
  if(candidates.length>=3 || !fuzzy || words.length>1){
    let out=candidates.map(([idx,cnt])=>{ const [b,c,v]=bookChVers[idx]; return { idx,b,c,v,text:texts[idx], score: scoreVerse(norm[idx],qNormSingle,cnt), hitCount:cnt }; });
    if(sort==='canon') out.sort((a,b)=>a.b!==b.b? a.b-b.b : a.c!==b.c? a.c-b.c : a.v-b.v);
    else out.sort((a,b)=> b.score-a.score || a.b-b.b || a.c-b.c || a.v-b.v);
    out=out.slice(0,maxResults);
    return { results:out, timeMs: Math.round(performance.now()-t0), fuzzyUsed:false, qWords:words, qNormSingle };
  }
  if(fuzzy && qNormSingle.length>=2 && hasUFuzzy){
    try{
      const uf=new uFuzzy({ intraMode:1, intraIns:1 });
      let idxs=uf.filter(norm, qNormSingle);
      if(idxs && idxs.length){
        const info=uf.info(norm, idxs, qNormSingle);
        uf.sort(norm, idxs, info);
        const exactSet=new Set(candidates.map(([i])=>i));
        const fuzzyIdxs=idxs.filter(i=>!exactSet.has(i)).slice(0,20);
        let out=candidates.map(([idx,cnt])=>{ const [b,c,v]=bookChVers[idx]; return { idx,b,c,v,text:texts[idx], score: scoreVerse(norm[idx],qNormSingle,cnt), hitCount:cnt, fuzzy:false }; });
        for(const fi of fuzzyIdxs){ const [b,c,v]=bookChVers[fi]; out.push({ idx:fi,b,c,v,text:texts[fi], score:-1000, hitCount:0, fuzzy:true }); }
        out=out.slice(0,maxResults);
        return { results:out, timeMs: Math.round(performance.now()-t0), fuzzyUsed: fuzzyIdxs.length>0, qWords:words, qNormSingle };
      }
    }catch(e){}
  }
  let out=candidates.map(([idx,cnt])=>{ const [b,c,v]=bookChVers[idx]; return { idx,b,c,v,text:texts[idx], score: scoreVerse(norm[idx],qNormSingle,cnt), hitCount:cnt, fuzzy:false }; });
  if(sort==='canon') out.sort((a,b)=>a.b!==b.b? a.b-b.b : a.c!==b.c? a.c-b.c : a.v-b.v);
  else out.sort((a,b)=>b.score-a.score || a.b-b.b || a.c-b.c || a.v-b.v);
  out=out.slice(0,maxResults);
  return { results:out, timeMs: Math.round(performance.now()-t0), fuzzyUsed:false, qWords:words, qNormSingle };
}

function getVersesByChapter(bookIndex, chapter){
  if(!ready) return [];
  const out=[];
  for(let i=0;i<bookChVers.length;i++){ const [b,c,v]=bookChVers[i]; if(b===bookIndex && c===chapter) out.push({ idx:i,b,c,v,text:texts[i]}); }
  return out;
}

self.onmessage = function(e){
  const msg=e.data;
  try{
    if(msg.type==='init'){
      const r=buildIndex(msg.verses);
      self.postMessage({ type:'ready', n: r.n, haystackLen: r.haystackLen });
    } else if(msg.type==='search'){
      const { query, opts, queryId } = msg;
      const res=search(query, opts||{});
      self.postMessage({ type:'result', queryId, query, ...res });
    } else if(msg.type==='getChapter'){
      const arr=getVersesByChapter(msg.bookIndex, msg.chapter);
      self.postMessage({ type:'chapter', queryId: msg.queryId, verses: arr });
    } else if(msg.type==='getVerse'){
      let found=null;
      for(let i=0;i<bookChVers.length;i++){ const [b,c,v]=bookChVers[i]; if(b===msg.bookIndex && c===msg.chapter && v===msg.verse){ found={ idx:i, text:texts[i]}; break; } }
      self.postMessage({ type:'verse', queryId: msg.queryId, found });
    }
  }catch(err){
    self.postMessage({ type:'error', message: String(err && err.message || err) });
  }
};
