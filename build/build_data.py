#!/usr/bin/env python3
"""
build_data.py — 按 PLAN.md §1 构建紧凑数据产物
输出到 public/data/ + 生成 .gz/.br + manifest.json + align_report.txt
"""
import json, gzip, hashlib, pathlib, urllib.request, sys, os

ROOT = pathlib.Path(__file__).resolve().parent.parent
DATA_DIR = ROOT / "public" / "data"
BUILD_DIR = pathlib.Path(__file__).resolve().parent

BASE = "https://raw.githubusercontent.com/midvash/bible-data/main/versions"

SOURCES = {
    "cuvs": f"{BASE}/zh/cuvs/cuvs.json",
    "cuv":  f"{BASE}/zh/cuv/cuv.json",
    "kjv":  f"{BASE}/en/kjv/kjv.json",
    "meta": f"{BASE}/zh/cuvs/metadata.json",
}

# 66 书卷完整信息（按 OSIS 顺序，PLAN 要求 abbr 含简/繁/英文）
BOOKS = [
    {"osis":"Gen","zh":"创世记","zht":"創世記","en":"Genesis","abbr":["创","創","Gen","Ge","Gn"],"testament":"OT","chapters":50},
    {"osis":"Exod","zh":"出埃及记","zht":"出埃及記","en":"Exodus","abbr":["出","Exod","Ex","Exo"],"testament":"OT","chapters":40},
    {"osis":"Lev","zh":"利未记","zht":"利未記","en":"Leviticus","abbr":["利","Lev","Le","Lv"],"testament":"OT","chapters":27},
    {"osis":"Num","zh":"民数记","zht":"民數記","en":"Numbers","abbr":["民","Num","Nu","Nm","Nb"],"testament":"OT","chapters":36},
    {"osis":"Deut","zh":"申命记","zht":"申命記","en":"Deuteronomy","abbr":["申","Deut","Dt"],"testament":"OT","chapters":34},
    {"osis":"Josh","zh":"约书亚记","zht":"約書亞記","en":"Joshua","abbr":["书","書","Josh","Jos","Jsh"],"testament":"OT","chapters":24},
    {"osis":"Judg","zh":"士师记","zht":"士師記","en":"Judges","abbr":["士","Judg","Jdg","Jd","Jds"],"testament":"OT","chapters":21},
    {"osis":"Ruth","zh":"路得记","zht":"路得記","en":"Ruth","abbr":["得","Ruth","Ru"],"testament":"OT","chapters":4},
    {"osis":"1Sam","zh":"撒母耳记上","zht":"撒母耳記上","en":"1 Samuel","abbr":["撒上","撒母耳上","1Sam","1Sa","1S"],"testament":"OT","chapters":31},
    {"osis":"2Sam","zh":"撒母耳记下","zht":"撒母耳記下","en":"2 Samuel","abbr":["撒下","撒母耳下","2Sam","2Sa","2S"],"testament":"OT","chapters":24},
    {"osis":"1Kgs","zh":"列王纪上","zht":"列王紀上","en":"1 Kings","abbr":["王上","列王上","1Kgs","1Ki","1K"],"testament":"OT","chapters":22},
    {"osis":"2Kgs","zh":"列王纪下","zht":"列王紀下","en":"2 Kings","abbr":["王下","列王下","2Kgs","2Ki","2K"],"testament":"OT","chapters":25},
    {"osis":"1Chr","zh":"历代志上","zht":"歷代志上","en":"1 Chronicles","abbr":["代上","历代上","1Chr","1Ch"],"testament":"OT","chapters":29},
    {"osis":"2Chr","zh":"历代志下","zht":"歷代志下","en":"2 Chronicles","abbr":["代下","历代下","2Chr","2Ch"],"testament":"OT","chapters":36},
    {"osis":"Ezra","zh":"以斯拉记","zht":"以斯拉記","en":"Ezra","abbr":["拉","Ezra","Ezr","Ez"],"testament":"OT","chapters":10},
    {"osis":"Neh","zh":"尼希米记","zht":"尼希米記","en":"Nehemiah","abbr":["尼","Neh","Ne"],"testament":"OT","chapters":13},
    {"osis":"Esth","zh":"以斯帖记","zht":"以斯帖記","en":"Esther","abbr":["斯","Esth","Est","Es"],"testament":"OT","chapters":10},
    {"osis":"Job","zh":"约伯记","zht":"約伯記","en":"Job","abbr":["伯","Job","Jb"],"testament":"OT","chapters":42},
    {"osis":"Ps","zh":"诗篇","zht":"詩篇","en":"Psalms","abbr":["诗","詩","Ps","Psa","Psm","Pss"],"testament":"OT","chapters":150},
    {"osis":"Prov","zh":"箴言","zht":"箴言","en":"Proverbs","abbr":["箴","Prov","Pro","Pr","Prv"],"testament":"OT","chapters":31},
    {"osis":"Eccl","zh":"传道书","zht":"傳道書","en":"Ecclesiastes","abbr":["传","傳","Eccl","Ecc","Qoh"],"testament":"OT","chapters":12},
    {"osis":"Song","zh":"雅歌","zht":"雅歌","en":"Song of Songs","abbr":["歌","Song","So","SOS","Cant"],"testament":"OT","chapters":8},
    {"osis":"Isa","zh":"以赛亚书","zht":"以賽亞書","en":"Isaiah","abbr":["赛","賽","Isa","Is"],"testament":"OT","chapters":66},
    {"osis":"Jer","zh":"耶利米书","zht":"耶利米書","en":"Jeremiah","abbr":["耶","Jer","Je","Jr"],"testament":"OT","chapters":52},
    {"osis":"Lam","zh":"耶利米哀歌","zht":"耶利米哀歌","en":"Lamentations","abbr":["哀","Lam","La"],"testament":"OT","chapters":5},
    {"osis":"Ezek","zh":"以西结书","zht":"以西結書","en":"Ezekiel","abbr":["结","結","Ezek","Eze","Ezk"],"testament":"OT","chapters":48},
    {"osis":"Dan","zh":"但以理书","zht":"但以理書","en":"Daniel","abbr":["但","Dan","Da","Dn"],"testament":"OT","chapters":12},
    {"osis":"Hos","zh":"何西阿书","zht":"何西阿書","en":"Hosea","abbr":["何","Hos","Ho"],"testament":"OT","chapters":14},
    {"osis":"Joel","zh":"约珥书","zht":"約珥書","en":"Joel","abbr":["珥","Joel","Jl"],"testament":"OT","chapters":3},
    {"osis":"Amos","zh":"阿摩司书","zht":"阿摩司書","en":"Amos","abbr":["摩","Amos","Am"],"testament":"OT","chapters":9},
    {"osis":"Obad","zh":"俄巴底亚书","zht":"俄巴底亞書","en":"Obadiah","abbr":["俄","Obad","Ob"],"testament":"OT","chapters":1},
    {"osis":"Jonah","zh":"约拿书","zht":"約拿書","en":"Jonah","abbr":["拿","Jonah","Jnh","Jon"],"testament":"OT","chapters":4},
    {"osis":"Mic","zh":"弥迦书","zht":"彌迦書","en":"Micah","abbr":["弥","彌","Mic","Mc"],"testament":"OT","chapters":7},
    {"osis":"Nah","zh":"那鸿书","zht":"那鴻書","en":"Nahum","abbr":["鸿","鴻","Nah","Na"],"testament":"OT","chapters":3},
    {"osis":"Hab","zh":"哈巴谷书","zht":"哈巴谷書","en":"Habakkuk","abbr":["哈","Hab","Hb"],"testament":"OT","chapters":3},
    {"osis":"Zeph","zh":"西番雅书","zht":"西番雅書","en":"Zephaniah","abbr":["番","Zeph","Zep","Zp"],"testament":"OT","chapters":3},
    {"osis":"Hag","zh":"哈该书","zht":"哈該書","en":"Haggai","abbr":["该","該","Hag","Hg"],"testament":"OT","chapters":2},
    {"osis":"Zech","zh":"撒迦利亚书","zht":"撒迦利亞書","en":"Zechariah","abbr":["亚","亞","Zech","Zec","Zc"],"testament":"OT","chapters":14},
    {"osis":"Mal","zh":"玛拉基书","zht":"瑪拉基書","en":"Malachi","abbr":["玛","瑪","Mal","Ml"],"testament":"OT","chapters":4},
    {"osis":"Matt","zh":"马太福音","zht":"馬太福音","en":"Matthew","abbr":["太","Matt","Mt"],"testament":"NT","chapters":28},
    {"osis":"Mark","zh":"马可福音","zht":"馬可福音","en":"Mark","abbr":["可","Mark","Mk","Mr"],"testament":"NT","chapters":16},
    {"osis":"Luke","zh":"路加福音","zht":"路加福音","en":"Luke","abbr":["路","Luke","Lk"],"testament":"NT","chapters":24},
    {"osis":"John","zh":"约翰福音","zht":"約翰福音","en":"John","abbr":["约","約","John","Jn","Jhn","Joh"],"testament":"NT","chapters":21},
    {"osis":"Acts","zh":"使徒行传","zht":"使徒行傳","en":"Acts","abbr":["徒","Acts","Ac"],"testament":"NT","chapters":28},
    {"osis":"Rom","zh":"罗马书","zht":"羅馬書","en":"Romans","abbr":["罗","羅","Rom","Ro","Rm"],"testament":"NT","chapters":16},
    {"osis":"1Cor","zh":"哥林多前书","zht":"哥林多前書","en":"1 Corinthians","abbr":["林前","哥林多前","1Cor","1Co"],"testament":"NT","chapters":16},
    {"osis":"2Cor","zh":"哥林多后书","zht":"哥林多後書","en":"2 Corinthians","abbr":["林后","哥林多后","2Cor","2Co"],"testament":"NT","chapters":13},
    {"osis":"Gal","zh":"加拉太书","zht":"加拉太書","en":"Galatians","abbr":["加","Gal","Ga"],"testament":"NT","chapters":6},
    {"osis":"Eph","zh":"以弗所书","zht":"以弗所書","en":"Ephesians","abbr":["弗","Eph","Ep"],"testament":"NT","chapters":6},
    {"osis":"Phil","zh":"腓立比书","zht":"腓立比書","en":"Philippians","abbr":["腓","Phil","Php","Pp"],"testament":"NT","chapters":4},
    {"osis":"Col","zh":"歌罗西书","zht":"歌羅西書","en":"Colossians","abbr":["西","Col","Co"],"testament":"NT","chapters":4},
    {"osis":"1Thess","zh":"帖撒罗尼迦前书","zht":"帖撒羅尼迦前書","en":"1 Thessalonians","abbr":["帖前","帖撒罗尼迦前","1Thess","1Th","1Thes"],"testament":"NT","chapters":5},
    {"osis":"2Thess","zh":"帖撒罗尼迦后书","zht":"帖撒羅尼迦後書","en":"2 Thessalonians","abbr":["帖后","帖撒罗尼迦后","2Thess","2Th","2Thes"],"testament":"NT","chapters":3},
    {"osis":"1Tim","zh":"提摩太前书","zht":"提摩太前書","en":"1 Timothy","abbr":["提前","提摩太前","1Tim","1Ti"],"testament":"NT","chapters":6},
    {"osis":"2Tim","zh":"提摩太后书","zht":"提摩太後書","en":"2 Timothy","abbr":["提后","提摩太后","2Tim","2Ti"],"testament":"NT","chapters":4},
    {"osis":"Titus","zh":"提多书","zht":"提多書","en":"Titus","abbr":["多","Titus","Tit","Ti"],"testament":"NT","chapters":3},
    {"osis":"Phlm","zh":"腓利门书","zht":"腓利門書","en":"Philemon","abbr":["门","門","Phlm","Phm","Pm"],"testament":"NT","chapters":1},
    {"osis":"Heb","zh":"希伯来书","zht":"希伯來書","en":"Hebrews","abbr":["来","來","Heb","He"],"testament":"NT","chapters":13},
    {"osis":"Jas","zh":"雅各书","zht":"雅各書","en":"James","abbr":["雅","Jas","Jm","Jas"],"testament":"NT","chapters":5},
    {"osis":"1Pet","zh":"彼得前书","zht":"彼得前書","en":"1 Peter","abbr":["彼前","彼得前","1Pet","1Pe","1P"],"testament":"NT","chapters":5},
    {"osis":"2Pet","zh":"彼得后书","zht":"彼得後書","en":"2 Peter","abbr":["彼后","彼得后","2Pet","2Pe","2P"],"testament":"NT","chapters":3},
    {"osis":"1John","zh":"约翰一书","zht":"約翰一書","en":"1 John","abbr":["约一","約一","约翰一","1John","1Jn","1J"],"testament":"NT","chapters":5},
    {"osis":"2John","zh":"约翰二书","zht":"約翰二書","en":"2 John","abbr":["约二","約二","约翰二","2John","2Jn","2J"],"testament":"NT","chapters":1},
    {"osis":"3John","zh":"约翰三书","zht":"約翰三書","en":"3 John","abbr":["约三","約三","约翰三","3John","3Jn","3J"],"testament":"NT","chapters":1},
    {"osis":"Jude","zh":"犹大书","zht":"猶大書","en":"Jude","abbr":["犹","猶","Jude","Jud","Jd"],"testament":"NT","chapters":1},
    {"osis":"Rev","zh":"启示录","zht":"啟示錄","en":"Revelation","abbr":["启","啟","Rev","Re","Rv"],"testament":"NT","chapters":22},
]

def fetch_json(url, path):
    if path.exists() and path.stat().st_size > 1000:
        print(f"  已存在 {path.name} {path.stat().st_size/1e6:.2f}MB，跳过下载")
        return json.loads(path.read_text(encoding="utf-8"))
    print(f"  下载 {url} ...")
    req = urllib.request.Request(url, headers={"User-Agent":"bible-app-build/1.0"})
    with urllib.request.urlopen(req, timeout=60) as r:
        data = r.read()
        path.write_bytes(data)
        print(f"    -> {path.name} {len(data)/1e6:.2f}MB")
        return json.loads(data)

def compress_outputs(data_dir):
    try:
        import brotli
        has_brotli = True
    except ImportError:
        has_brotli = False
        print("  [warn] brotli 未安装，仅生成 gzip")
    for f in data_dir.glob("*.json"):
        raw = f.read_bytes()
        gz = gzip.compress(raw, compresslevel=9)
        (f.with_suffix(f.suffix + ".gz")).write_bytes(gz)
        print(f"  {f.name}: raw {len(raw)/1024:.1f}KB  gzip {len(gz)/1024:.1f}KB", end="")
        if has_brotli:
            br = brotli.compress(raw, quality=11)
            (f.with_suffix(f.suffix + ".br")).write_bytes(br)
            print(f"  brotli {len(br)/1024:.1f}KB")
        else:
            print()

def sha256_file(p):
    return hashlib.sha256(p.read_bytes()).hexdigest()

def main():
    print("== M1 构建管线 ==")
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    tmp = BUILD_DIR / "_src"
    tmp.mkdir(exist_ok=True)

    # 1. 下载
    print("[1/5] 下载源文件")
    src_cuvs = fetch_json(SOURCES["cuvs"], tmp / "src_cuvs.json")
    src_cuv  = fetch_json(SOURCES["cuv"],  tmp / "src_cuv.json")
    src_kjv  = fetch_json(SOURCES["kjv"],  tmp / "src_kjv.json")
    src_meta = fetch_json(SOURCES["meta"], tmp / "src_meta.json")

    # 2. 校验
    print("[2/5] 校验")
    assert src_cuvs["version"] == "cuvs", f"cuvs version mismatch {src_cuvs['version']}"
    assert src_cuv["version"] == "cuv", f"cuv version mismatch"
    assert src_kjv["version"] == "kjv", f"kjv version mismatch"
    # books 顺序一致
    books_cuvs = [b["book"] for b in src_cuvs["books"]]
    books_cuv  = [b["book"] for b in src_cuv["books"]]
    books_kjv  = [b["book"] for b in src_kjv["books"]]
    assert books_cuvs == books_cuv == books_kjv, "books 顺序不一致"
    assert len(books_cuvs) == 66, f"books 数量 {len(books_cuvs)}"
    # 节数校验
    def count_verses(j):
        return sum(len(ch["verses"]) for b in j["books"] for ch in b["chapters"])
    n_cuvs = count_verses(src_cuvs)
    n_cuv  = count_verses(src_cuv)
    n_kjv  = count_verses(src_kjv)
    print(f"  cuvs {n_cuvs}  cuv {n_cuv}  kjv {n_kjv}")
    assert n_cuvs == 31021, f"cuvs 节数 {n_cuvs} != 31021"
    assert n_cuv  == 31021, f"cuv 节数 {n_cuv} != 31021"
    assert n_kjv  == 31102, f"kjv 节数 {n_kjv} != 31102"
    print("  校验通过")

    # 3. 生成 books.json
    print("[3/5] 生成 books.json")
    books_out = {
        "cuvName": "和合本（简体）",
        "license": {
            "text": src_meta.get("license","public-domain"),
            "source": src_meta.get("sourceUrl","https://ebible.org/find/details.php?id=cmn-cu89s"),
            "note": "港台部分机构主张权利，本应用仅作个人查考用途"
        },
        "books": BOOKS
    }
    (DATA_DIR / "books.json").write_text(json.dumps(books_out, ensure_ascii=False, separators=(",",":")), encoding="utf-8")

    def to_compact(src):
        v = []
        for bi, book in enumerate(src["books"]):
            for ch in book["chapters"]:
                c = ch["chapter"]
                for vs in ch["verses"]:
                    v.append([bi, c, vs["number"], vs["text"]])
        return {"v": v}

    print("[4/5] 生成紧凑 JSON")
    cuv_compact = to_compact(src_cuvs)
    cuv_trad_compact = to_compact(src_cuv)
    kjv_compact = to_compact(src_kjv)

    (DATA_DIR / "cuv.json").write_text(json.dumps(cuv_compact, ensure_ascii=False, separators=(",",":")), encoding="utf-8")
    (DATA_DIR / "cuv_trad.json").write_text(json.dumps(cuv_trad_compact, ensure_ascii=False, separators=(",",":")), encoding="utf-8")
    (DATA_DIR / "kjv.json").write_text(json.dumps(kjv_compact, ensure_ascii=False, separators=(",",":")), encoding="utf-8")
    print(f"  cuv.json {len(cuv_compact['v'])} 节")
    print(f"  cuv_trad.json {len(cuv_trad_compact['v'])} 节")
    print(f"  kjv.json {len(kjv_compact['v'])} 节")

    # 4. 节号对齐报告
    print("[5/5] 节号对齐报告")
    def key_set(compact):
        return { f"{b*1000000+c*1000+v}" for b,c,v,_ in compact["v"] }
    # 也用数值 key
    def num_keys(compact):
        return { b*1000000+c*1000+v for b,c,v,_ in compact["v"] }
    cuv_keys = num_keys(cuv_compact)
    kjv_keys = num_keys(kjv_compact)
    only_kjv = sorted(kjv_keys - cuv_keys)
    only_cuv = sorted(cuv_keys - kjv_keys)
    # 映射回引用
    def key_to_ref(k):
        b = k // 1000000
        c = (k % 1000000)//1000
        v = k % 1000
        bk = BOOKS[b]["osis"] if 0 <= b < 66 else "?"
        return f"{bk} {c}:{v}"
    report_lines = []
    report_lines.append(f"CUV 节数: {len(cuv_keys)}  KJV 节数: {len(kjv_keys)}")
    report_lines.append(f"KJV 有而 CUV 无: {len(only_kjv)} 节")
    for k in only_kjv[:30]:
        report_lines.append(f"  + {key_to_ref(k)}  key={k}")
    if len(only_kjv) > 30:
        report_lines.append(f"  ... 还有 {len(only_kjv)-30} 节")
    report_lines.append(f"CUV 有而 KJV 无: {len(only_cuv)} 节")
    for k in only_cuv:
        report_lines.append(f"  - {key_to_ref(k)}  key={k}")
    report_lines.append("")
    report_lines.append("verseKey = b*1000000 + c*1000 + v  (b 为 books.json 下标)")
    (BUILD_DIR / "align_report.txt").write_text("\n".join(report_lines), encoding="utf-8")
    print("\n".join(report_lines))

    # 压缩
    print("\n[压缩]")
    compress_outputs(DATA_DIR)

    # manifest
    print("\n[manifest]")
    manifest = {}
    entries = []
    for f in sorted(DATA_DIR.glob("*.json")):
        raw = f.read_bytes()
        gz_p = f.with_suffix(f.suffix + ".gz")
        br_p = f.with_suffix(f.suffix + ".br")
        e = {"file": f.name, "raw": len(raw), "sha256": sha256_file(f)}
        if gz_p.exists():
            e["gzip"] = gz_p.stat().st_size
        if br_p.exists():
            e["brotli"] = br_p.stat().st_size
        entries.append(e)
        print(f"  {f.name}: raw {len(raw)}  gzip {e.get('gzip','-')}  br {e.get('brotli','-')}")

    # 体积预算警告
    cuvgz = next((e["gzip"] for e in entries if e["file"]=="cuv.json"), 0)
    if cuvgz > 1.3*1024*1024*1.1:
        print(f"  [WARN] cuv.json gzip {cuvgz} 超预算 1.3MB +10%")
    manifest = {"files": entries}
    (DATA_DIR / "manifest.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8")
    print("\n构建完成。产物在 public/data/")
    # 体积表
    print("\n体积报告 raw/gzip/brotli (KB):")
    for e in entries:
        print(f"  {e['file']:15s} {e['raw']/1024:7.1f}  {e.get('gzip',0)/1024:7.1f}  {e.get('brotli',0)/1024:7.1f}")

if __name__ == "__main__":
    main()
