// sw.js — 缓存外壳与数据，离线可用
const CACHE = 'quote-search-v2';
const SHELL = [
  './',
  './index.html',
  './css/app.css',
  './js/app.js',
  './js/text.js',
  './js/refs.js',
  './js/clipboard.js',
  './js/settings.js',
  './js/search.js',
  './js/worker.js',
  './vendor/ufuzzy.min.js',
  './vendor/opencc-t2cn.min.js',
  './public/data/books.json',
  './public/data/cuv.json',
  './manifest.webmanifest'
];

self.addEventListener('install', e=>{
  e.waitUntil(caches.open(CACHE).then(c=> c.addAll(SHELL)).then(()=> self.skipWaiting()));
});
self.addEventListener('activate', e=>{
  e.waitUntil(caches.keys().then(keys=> Promise.all(keys.filter(k=>k!==CACHE).map(k=> caches.delete(k)))).then(()=> self.clients.claim()));
});
self.addEventListener('fetch', e=>{
  const url=new URL(e.request.url);
  // 仅同源 GET 进缓存
  if(e.request.method!=='GET' || url.origin!==location.origin) return;
  // 数据文件：优先缓存，失败回源
  e.respondWith(caches.match(e.request).then(hit=>{
    if(hit) {
      // 后台更新
      fetch(e.request).then(r=>{ if(r.ok) caches.open(CACHE).then(c=> c.put(e.request, r)); }).catch(()=>{});
      return hit;
    }
    return fetch(e.request).then(r=>{
      if(r.ok) caches.open(CACHE).then(c=> c.put(e.request, r.clone()));
      return r;
    }).catch(()=> hit);
  }));
});
