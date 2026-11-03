// js/clipboard.js
export async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    try {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      ta.style.left = '-9999px';
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand('copy');
      ta.remove();
      return ok;
    } catch { return false; }
  }
}

export function formatWithTemplate(template, ctx) {
  // ctx: { text, ref, enText, pureRef } => $1,$2,$3,$4 ; \$ => $
  let s = template.replace(/\\\$/g, '\u0000');
  s = s.replace(/\$1/g, ctx.text ?? '')
       .replace(/\$2/g, ctx.ref ?? '')
       .replace(/\$3/g, ctx.enText ?? '')
       .replace(/\$4/g, ctx.pureRef ?? '');
  s = s.replace(/\u0000/g, '$');
  // 未识别 $n 原样保留（不处理）
  return s;
}

export function buildCopyPayload(item, settings, books, enMap) {
  // item: { b,c,v,text }
  const bk = books[item.b];
  const zhRef = `《${bk.zh}》${item.c}:${item.v}`;
  const pureRef = `${bk.zh} ${item.c}:${item.v}`;
  const enText = enMap ? (enMap.get(item.b*1000000+item.c*1000+item.v) || '') : '';
  const tpl = settings.customTemplate || '「$1」——$2';
  if (settings.copyFormat === 'plain') return item.text;
  if (settings.copyFormat === 'withRef') return `${item.text}\n——${zhRef}`;
  // custom
  return formatWithTemplate(tpl, { text: item.text, ref: zhRef, enText, pureRef });
}
