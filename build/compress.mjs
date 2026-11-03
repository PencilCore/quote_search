// build/compress.mjs — 为 public/data 下所有 .json 生成 .gz/.br 并重写 manifest.json
// 同时校验每个 .json 可被解析，避免写入坏数据。
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DATA = path.join(ROOT, 'public', 'data');
const MANIFEST = 'manifest.json';

function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (e.name.endsWith('.json')) out.push(p);
  }
  return out;
}

const files = walk(DATA)
  .filter((f) => path.basename(f) !== MANIFEST)
  .sort((a, b) => a.localeCompare(b));

const gzip = (buf) => zlib.gzipSync(buf, { level: 9 });
const brotli = (buf) => zlib.brotliCompressSync(buf, {
  params: { [zlib.constants.BROTLI_PARAM_QUALITY]: 11 },
});

const manifest = { generatedAt: new Date().toISOString(), files: [] };
let totalRaw = 0;

for (const abs of files) {
  const raw = fs.readFileSync(abs);
  JSON.parse(raw.toString('utf8')); // 校验：坏 JSON 直接抛错
  const gz = gzip(raw);
  const br = brotli(raw);
  fs.writeFileSync(abs + '.gz', gz);
  fs.writeFileSync(abs + '.br', br);
  const rel = path.relative(DATA, abs).split(path.sep).join('/');
  manifest.files.push({
    file: rel,
    raw: raw.length,
    sha256: crypto.createHash('sha256').update(raw).digest('hex'),
    gzip: gz.length,
    brotli: br.length,
  });
  totalRaw += raw.length;
  console.log(`${rel.padEnd(34)} raw ${String(raw.length).padStart(9)}  gz ${String(gz.length).padStart(9)}  br ${String(br.length).padStart(9)}`);
}

const abs = path.join(DATA, MANIFEST);
fs.writeFileSync(abs, JSON.stringify(manifest, null, 2));
const mraw = fs.readFileSync(abs);
fs.writeFileSync(abs + '.gz', gzip(mraw));
fs.writeFileSync(abs + '.br', brotli(mraw));
console.log(`\n${manifest.files.length} files · raw total ${totalRaw.toLocaleString()} bytes · manifest.json written`);
