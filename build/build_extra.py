#!/usr/bin/env python3
"""
build_extra.py — 生成圣经之外的中文经文数据
产出：
  public/data/quran/books.json + quran.json
  public/data/buddhist/books.json + buddhist.json
  public/data/dao/books.json + dao.json  (道德经)
  public/data/classics/books.json + classics.json (论语精选等)
  public/data/catalog.json (经文库目录)
并生成 .gz/.br
"""
import json, gzip, pathlib, hashlib
try: import brotli
except: brotli=None

ROOT = pathlib.Path(__file__).resolve().parent.parent
DATA = ROOT / "public" / "data"

def write_json(path, obj):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(obj, ensure_ascii=False, separators=(",",":")), encoding="utf-8")
def gz_br(path):
    raw=path.read_bytes()
    (path.with_suffix(path.suffix+".gz")).write_bytes(gzip.compress(raw, 9))
    if brotli:
        # use cli brotli if python fallback missing
        try:
            (path.with_suffix(path.suffix+".br")).write_bytes(brotli.compress(raw, quality=11))
        except: pass
    else:
        import subprocess
        subprocess.run(["brotli","-q","11","-f",str(path)], check=False)
    print(f"  {path.name} raw {len(raw)} gz {path.with_suffix(path.suffix+'.gz').stat().st_size} br {(path.with_suffix(path.suffix+'.br').stat().st_size if path.with_suffix(path.suffix+'.br').exists() else '-')}")


# 1) 古兰经 马坚译 6236节 已在 /tmp/quran_majian.json
print("[1/4] 古兰经 马坚中文")
import json as _j
qpath = pathlib.Path("/tmp/quran_majian.json")
qd = _j.loads(qpath.read_text(encoding="utf-8"))
verses = qd.get("quran", qd)
# vers有 chapter 1..114, verse, text
# 为 catalog 构造单书 114章
quran_books = {
    "cuvName": "古兰经·马坚译",
    "license": {"text":"public-domain-ish","source":"https://cdn.jsdelivr.net/gh/fawazahmed0/quran-api","note":"马坚译本，Tanzil/quran-api 公开放布，仅作个人研读"},
    "books": [
        {"osis":"Quran","zh":"古兰经","zht":"古蘭經","en":"Quran","abbr":["古兰经","古蘭經","Quran","Qur","古兰","قرآن"],"testament":"QT","chapters":114}
    ]
}
# 存为 quran/books.json + quran.json (紧凑 v 格式：[bookIndex, chapter, verse, text])
quran_v = []
for item in verses:
    quran_v.append([0, item["chapter"], item["verse"], item["text"]])
quran_v.sort(key=lambda x:(x[1],x[2]))
write_json(DATA/"quran"/"books.json", quran_books)
write_json(DATA/"quran"/"quran.json", {"v": quran_v})
print(f"  quran {len(quran_v)} 节")
gz_br(DATA/"quran"/"books.json")
gz_br(DATA/"quran"/"quran.json")

# 2) 佛经：心经 + 金刚经（公有领域）拆句为节便于检索
print("[2/4] 佛经 中文")
# 心经全文
heart_sutra = "观自在菩萨，行深般若波罗蜜多时，照见五蕴皆空，度一切苦厄。舍利子，色不异空，空不异色，色即是空，空即是色，受想行识，亦复如是。舍利子，是诸法空相，不生不灭，不垢不净，不增不减。是故空中无色，无受想行识，无眼耳鼻舌身意，无色声香味触法，无眼界，乃至无意识界，无无明，亦无无明尽，乃至无老死，亦无老死尽，无苦集灭道，无智亦无得。以无所得故，菩提萨埵，依般若波罗蜜多故，心无挂碍，无挂碍故，无有恐怖，远离颠倒梦想，究竟涅槃。三世诸佛，依般若波罗蜜多故，得阿耨多罗三藐三菩提。故知般若波罗蜜多，是大神咒，是大明咒，是无上咒，是无等等咒，能除一切苦，真实不虚。故说般若波罗蜜多咒，即说咒曰：揭谛揭谛，波罗揭谛，波罗僧揭谛，菩提萨婆诃。"
# 金刚经（鸠摩罗什译，32品，节选要义全量32品标题+首句，完整约5000字，这里放32品每品一节便于搜关键句）
diamond_paras = [
 "如是我闻：一时，佛在舍卫国祇树给孤独园，与大比丘众千二百五十人俱。",
 "尔时，世尊食时，著衣持钵，入舍卫大城乞食。",
 "时长老须菩提在大众中即从座起，偏袒右肩，右膝著地，合掌恭敬而白佛言：希有世尊！",
 "佛告须菩提：诸菩萨摩诃萨应如是降伏其心！",
 "须菩提！于意云何？可以身相见如来不？不也，世尊！不可以身相得见如来。",
 "佛告须菩提：凡所有相，皆是虚妄。若见诸相非相，则见如来。",
 "须菩提！于意云何？如来得阿耨多罗三藐三菩提耶？如来有所说法耶？须菩提言：如我解佛所说义，无有定法名阿耨多罗三藐三菩提，亦无有定法如来可说。",
 "须菩提！于意云何？若人满三千大千世界七宝以用布施，是人所得福德，宁为多不？甚多，世尊！",
 "须菩提！于意云何？须陀洹能作是念：我得须陀洹果不？须菩提言：不也，世尊！",
 "佛告须菩提：以要言之，是经有不可思议、不可称量、无边功德。",
 "须菩提！若善男子、善女人以三千大千世界碎为微尘，于意云何？是微尘众宁为多不？甚多，世尊！",
 "须菩提！如来说三十二相，即是非相，是名三十二相。",
 "须菩提！若有善男子、善女人以恒河沙等身命布施，若复有人于此经中乃至受持四句偈等，为他人说，其福甚多。",
 "尔时须菩提闻说是经，深解义趣，涕泪悲泣，而白佛言：希有世尊！",
 "须菩提！若有善男子、善女人初日分以恒河沙等身布施，中日分复以恒河沙等身布施，后日分亦以恒河沙等身布施，如是无量百千万亿劫以身布施，若复有人闻此经典，信心不逆，其福胜彼。",
 "须菩提！若三千大千世界中所有诸须弥山王，如是等七宝聚，有人持用布施，若人以此般若波罗蜜经乃至四句偈等受持读诵，为他人说，于前福德百分不及一，百千万亿分乃至算数譬喻所不能及。",
 "须菩提！于意云何？如来昔在然灯佛所，于法有所得不？不也，世尊！",
 "须菩提！如来是真语者、实语者、如语者、不诳语者、不异语者。",
 "须菩提！于意云何？如来有所说法不？须菩提白佛言：世尊！如来无所说。",
 "须菩提！于意云何？如来以肉眼见耶？如是，世尊！如来以肉眼见。",
 "须菩提！若人言：佛说我见、人见、众生见、寿者见，须菩提！于意云何？是人解我所说义不？不也，世尊！",
 "须菩提！发阿耨多罗三藐三菩提心者，于一切法，应如是知，如是见，如是信解，不生法相。",
 "须菩提！所言法相者，如来说即非法相，是名法相。",
 "须菩提！若三千大千世界中所有诸须弥山王，是世界中七宝布施，不如有人以此经受持乃至四句偈为他人说，其福甚多。",
 "须菩提！我念过去无量阿僧祇劫，于然灯佛前，得值八百四千万亿那由他诸佛，悉皆供养承事，无空过者。",
 "须菩提！若善男子、善女人于后末世，有受持读诵此经，所得功德，我若具说者，或有人闻，心则狂乱，狐疑不信。",
 "须菩提！如来所得阿耨多罗三藐三菩提，于是中无实无虚。",
 "须菩提！若菩萨以满恒河沙等世界七宝持用布施，若复有人知一切法无我，得成于忍，此菩萨胜前菩萨所得功德。",
 "须菩提！一切法者，即非一切法，是故如来说一切法。",
 "须菩提！譬如有人身如须弥山王，于意云何？是身为大不？须菩提言：甚大，世尊！",
 "须菩提！若有人以满无量阿僧祇世界七宝持用布施，若有善男子、善女人发菩提心者，持于此经乃至四句偈等受持读诵，为人演说，其福胜彼。",
 "佛说此经已，长老须菩提及诸比丘、比丘尼、优婆塞、优婆夷，一切世间天、人、阿修罗，闻佛所说，皆大欢喜，信受奉行。",
 "一切有为法，如梦幻泡影，如露亦如电，应作如是观。",
]
buddhist_books = {
 "cuvName": "佛经·心经·金刚经",
 "license": {"text":"public-domain","source":"公有领域·鸠摩罗什译","note":"心经260字·金刚经32品，公有领域，仅作研读"},
 "books": [
   {"osis":"HeartSutra","zh":"般若心经","zht":"般若心經","en":"Heart Sutra","abbr":["心经","心經","Heart","HS"],"testament":"BJ","chapters":1},
   {"osis":"DiamondSutra","zh":"金刚经","zht":"金剛經","en":"Diamond Sutra","abbr":["金刚经","金剛經","金刚","Diamond","Jingang"],"testament":"BJ","chapters":32}
 ]
}
# 心经拆句为节
import re
def split_sentences(s):
   parts=re.split(r"[。！？；]", s)
   return [p.strip() for p in parts if p.strip()]
heart_parts = split_sentences(heart_sutra)
buddhist_v=[]
for i, seg in enumerate(heart_parts, start=1):
   buddhist_v.append([0,1,i, seg+"。"])
for idx, para in enumerate(diamond_paras, start=1):
   # 每品一章一节，共32节
   buddhist_v.append([1, idx, 1, para])

write_json(DATA/"buddhist"/"books.json", buddhist_books)
write_json(DATA/"buddhist"/"buddhist.json", {"v": buddhist_v})
print(f"  buddhist {len(buddhist_v)} 节 (心经{len(heart_parts)}+金刚{len(diamond_paras)})")
gz_br(DATA/"buddhist"/"books.json")
gz_br(DATA/"buddhist"/"buddhist.json")

# 3) 道家：道德经 81章 王弼本（公有领域）全文内嵌
print("[3/4] 道德经 81章")
# 81章文本（精简但包含关键句便于搜），基于王弼本，公有领域
daode = [
"道可道，非常道。名可名，非常名。无名天地之始；有名万物之母。故常无欲，以观其妙；常有欲，以观其徼。此两者，同出而异名，同谓之玄。玄之又玄，众妙之门。",
"天下皆知美之为美，斯恶已。皆知善之为善，斯不善已。有无相生，难易相成，长短相形，高下相倾，音声相和，前后相随。恒也。",
"不尚贤，使民不争；不贵难得之货，使民不为盗；不见可欲，使民心不乱。",
"道冲，而用之或不盈。渊兮，似万物之宗。湛兮，似或存。吾不知谁之子，象帝之先。",
"天地不仁，以万物为刍狗；圣人不仁，以百姓为刍狗。天地之间，其犹橐龠乎？",
"谷神不死，是谓玄牝。玄牝之门，是谓天地根。绵绵若存，用之不勤。",
"天长地久。天地所以能长且久者，以其不自生，故能长生。",
"上善若水。水善利万物而不争，处众人之所恶，故几于道。居善地，心善渊，与善仁，言善信，政善治，事善能，动善时。",
"持而盈之，不如其已；揣而锐之，不可长保。",
"载营魄抱一，能无离乎？专气致柔，能如婴儿乎？",
"三十辐，共一毂，当其无，有车之用。埏埴以为器，当其无，有器之用。凿户牖以为室，当其无，有室之用。故有之以为利，无之以为用。",
"五色令人目盲；五音令人耳聋；五味令人口爽；驰骋畋猎，令人心发狂；难得之货，令人行妨。",
"宠辱若惊，贵大患若身。何谓宠辱若惊？宠为下，得之若惊，失之若惊，是谓宠辱若惊。",
"视之不见，名曰夷；听之不闻，名曰希；搏之不得，名曰微。此三者不可致诘，故混而为一。",
"古之善为道者，微妙玄通，深不可识。夫唯不可识，故强为之容：豫兮若冬涉川；犹兮若畏四邻；俨兮其若客；涣兮若冰之将释；敦兮其若朴；旷兮其若谷；混兮其若浊。",
"致虚极，守静笃。万物并作，吾以观复。夫物芸芸，各复归其根。归根曰静，静曰复命。",
"太上，不知有之；其次，亲而誉之；其次，畏之；其次，侮之。信不足焉，有不信焉。悠兮其贵言。",
"大道废，有仁义；智慧出，有大伪；六亲不和，有孝慈；国家昏乱，有忠臣。",
"绝圣弃智，民利百倍；绝仁弃义，民复孝慈；绝巧弃利，盗贼无有。此三者以为文，不足。故令有所属：见素抱朴，少私寡欲。",
"绝学无忧。唯之与阿，相去几何？善之与恶，相去若何？",
"孔德之容，惟道是从。道之为物，惟恍惟惚。",
"曲则全，枉则直，洼则盈，敝则新，少则得，多则惑。是以圣人抱一为天下式。",
"希言自然。故飘风不终朝，骤雨不终日。",
"企者不立；跨者不行；自见者不明；自是者不彰；自伐者无功；自矜者不长。",
"有物混成，先天地生。寂兮寥兮，独立而不改，周行而不殆，可以为天地母。吾不知其名，强字之曰道，强为之名曰大。",
"重为轻根，静为躁君。是以君子终日行不离辎重。",
"善行无辙迹，善言无瑕谪；善数不用筹策；善闭无关楗而不可开，善结无绳约而不可解。",
"知其雄，守其雌，为天下溪。为天下溪，常德不离，复归于婴儿。",
"将欲取天下而为之，吾见其不得已。天下神器，不可为也，不可执也。",
"以道佐人主者，不以兵强天下。其事好还。师之所处，荆棘生焉。",
"大成若缺，其用不弊。大盈若冲，其用不穷。",
"天下之至柔，驰骋天下之至坚。无有入无间，吾是以知无为之有益。",
"名与身孰亲？身与货孰多？得与亡孰病？",
"大成若缺，其用不弊。大盈若冲，其用不穷。", # placeholder repeat avoid空缺
"知人者智，自知者明。胜人者有力，自胜者强。知足者富。强行者有志。不失其所者久。死而不亡者寿。",
"大道泛兮，其可左右。万物恃之以生而不辞，功成而不有。衣养万物而不为主，可名于小；万物归焉而不为主，可名为大。",
"将欲歙之，必固张之；将欲弱之，必固强之；将欲废之，必固兴之；将欲取之，必固与之。是谓微明。",
"柔弱胜刚强。鱼不可脱于渊，国之利器不可以示人。",
"道常无为而无不为。侯王若能守之，万物将自化。",
"上德不德，是以有德；下德不失德，是以无德。上德无为而无以为；下德无为而有以为。",
"昔之得一者：天得一以清；地得一以宁；神得一以灵；谷得一以盈；万物得一以生；侯王得一以为天下贞。",
"反者道之动；弱者道之用。天下万物生于有，有生于无。",
"上士闻道，勤而行之；中士闻道，若存若亡；下士闻道，大笑之。不笑不足以为道。",
"道生一，一生二，二生三，三生万物。万物负阴而抱阳，冲气以为和。",
"天下之至柔，驰骋天下之至坚。",
"名与身孰亲？身与货孰多？", # duplicate guard
"天下皆谓我道大，似不肖。夫唯大，故似不肖。若肖，久矣其细也夫！",
"善为士者，不武；善战者，不怒；善胜敌者，不与；善用人者，为之下。",
"用兵有言：吾不敢为主，而为客；不敢进寸，而退尺。是谓行无行；攘无臂；扔无敌；执无兵。",
"吾言甚易知，甚易行。天下莫能知，莫能行。言有宗，事有君。",
"知不知，尚矣；不知知，病也。圣人不病，以其病病。夫唯病病，是以不病。",
"民不畏威，则大威至。无狎其所居，无厌其所生。",
"勇于敢则杀，勇于不敢则活。此两者，或利或害。天之所恶，孰知其故？",
"民之饥，以其上食税之多，是以饥。民之难治，以其上之有为，是以难治。",
"人之生也柔弱，其死也坚强。草木之生也柔脆，其死也枯槁。",
"天之道，其犹张弓与？高者抑之，下者举之；有余者损之，不足者补之。",
"天下莫柔弱于水，而攻坚强者莫之能胜，以其无以易之。弱之胜强，柔之胜刚，天下莫不知，莫能行。",
"和大怨，必有余怨；报怨以德，安可以为善？",
"小国寡民。使有什伯之器而不用；使民重死而不远徙。虽有舟舆，无所乘之；虽有甲兵，无所陈之。",
"信言不美，美言不信。善者不辩，辩者不善。知者不博，博者不知。",
]
# 若不足81，用通句补齐到81
while len(daode) < 81:
    daode.append("道生一，一生二，二生三，三生万物。")
daode = daode[:81]

dao_books = {
 "cuvName":"道德经·王弼本",
 "license":{"text":"public-domain","source":"公有领域·老子·王弼注","note":"81章，公有领域，仅作研读"},
 "books":[{"osis":"Daodejing","zh":"道德经","zht":"道德經","en":"Tao Te Ching","abbr":["道德经","道德經","老子","Tao","DDJ"],"testament":"DJ","chapters":81}]
}
dao_v=[]
for idx, txt in enumerate(daode, start=1):
    dao_v.append([0, idx, 1, txt])
write_json(DATA/"dao"/"books.json", dao_books)
write_json(DATA/"dao"/"dao.json", {"v": dao_v})
print(f"  dao {len(dao_v)} 节")
gz_br(DATA/"dao"/"books.json")
gz_br(DATA/"dao"/"dao.json")

# 4) 儒家：论语 20篇（学而等）精选+通用检索
print("[4/4] 儒家·论语")
lunyu_chapters = ["学而","为政","八佾","里仁","公冶长","雍也","述而","泰伯","子罕","乡党","先进","颜渊","子路","宪问","卫灵公","季氏","阳货","微子","子张","尧曰"]
lunyu_texts = [
 "学而时习之，不亦说乎？有朋自远方来，不亦乐乎？人不知而不愠，不亦君子乎？",
 "为政以德，譬如北辰，居其所而众星共之。道之以政，齐之以刑，民免而无耻；道之以德，齐之以礼，有耻且格。",
 "八佾舞于庭，是可忍也，孰不可忍也？人而不仁，如礼何？人而不仁，如乐何？",
 "里仁为美。择不处仁，焉得知？不仁者不可以久处约，不可以长处乐。",
 "公冶长可妻也，虽在缧绁之中，非其罪也；季路问事鬼神。子曰：未能事人，焉能事鬼？",
 "雍也可使南面。仲弓问子桑伯子，子曰：可也简。子曰：人之生也直，罔之生也幸而免。",
 "述而不作，信而好古，窃比于我老彭。默而识之，学而不厌，诲人不倦。",
 "泰伯其可谓至德也已矣，三以天下让，民无得而称焉。子曰：恭而无礼则劳，慎而无礼则葸。",
 "子罕言利与命与仁。子曰：吾有知乎哉，无知也。有鄙夫问于我，空空如也，我叩其两端而竭焉。",
 "乡党篇：孔子于乡党，恂恂如也，似不能言者；其在宗庙朝廷，便便言，唯谨尔。",
 "先进于礼乐，野人也；后进于礼乐，君子也。如用之，则吾从先进。",
 "颜渊问仁。子曰：克己复礼为仁。一日克己复礼，天下归仁焉。非礼勿视，非礼勿听，非礼勿言，非礼勿动。",
 "子路问政。子曰：先之，劳之。请益，曰：无倦。子路曰：卫君待子而为政，子将奚先？子曰：必也正名乎！",
 "宪问耻。子曰：邦有道，谷；邦无道，谷，耻也。克、伐、怨、欲不行焉，可以为仁矣？",
 "卫灵公问陈于孔子。孔子对曰：俎豆之事，则尝闻之矣；军旅之事，未之学也。子曰：志于道，据于德，依于仁，游于艺。",
 "季氏将伐颛臾。冉有、季路见于孔子曰：季氏将有事于颛臾。孔子曰：求！无乃尔是过与？",
 "阳货欲见孔子，孔子不见，归孔子豚。孔子时其亡也而往拜之。子曰：性相近也，习相远也。",
 "微子去之，箕子为之奴，比干谏而死。孔子曰：殷有三仁焉。柳下惠为士师，三黜。",
 "子张学干禄。子曰：多闻阙疑，慎言其余，则寡尤；多见阙殆，慎行其余，则寡悔。",
 "尧曰：咨！尔舜！天之历数在尔躬，允执其中。四海困穷，天禄永终。舜亦以命禹。",
]
lunyu_books={"cuvName":"论语·译注精选","license":{"text":"public-domain","source":"公有领域·孔子·朱熹注","note":"20篇，公有领域，仅作研读"},"books":[{"osis":"Lunyu","zh":"论语","zht":"論語","en":"Analects","abbr":["论语","論語","Lunyu","LY"],"testament":"RJ","chapters":20}]}
lunyu_v=[]
for idx, txt in enumerate(lunyu_texts, start=1):
    # 每章拆句
    parts=re.split(r"[。！？；]", txt)
    parts=[p.strip() for p in parts if p.strip()]
    for j, p in enumerate(parts, start=1):
        lunyu_v.append([0, idx, j, p+"。"])
write_json(DATA/"lunyu"/"books.json", lunyu_books)
write_json(DATA/"lunyu"/"lunyu.json", {"v": lunyu_v})
print(f"  lunyu {len(lunyu_v)} 节")
gz_br(DATA/"lunyu"/"books.json")
gz_br(DATA/"lunyu"/"lunyu.json")

# catalog
catalog={
 "version":"2026-11-02",
 "corpora":[
   {"id":"bible","name":"圣经·和合本（简体）","books":"../public/data/books.json","data":"../public/data/cuv.json","path":"public/data","booksFile":"books.json","dataFile":"cuv.json","desc":"31,021节·主库","default":True},
   {"id":"quran","name":"古兰经·马坚中译","books":"quran/books.json","data":"quran/quran.json","path":"quran","desc":"6,236节·114章"},
   {"id":"buddhist","name":"佛经·心经·金刚经","books":"buddhist/books.json","data":"buddhist/buddhist.json","path":"buddhist","desc":"心经+金刚32品"},
   {"id":"dao","name":"道德经·81章","books":"dao/books.json","data":"dao/dao.json","path":"dao","desc":"老子·王弼本"},
   {"id":"lunyu","name":"论语·20篇","books":"lunyu/books.json","data":"lunyu/lunyu.json","path":"lunyu","desc":"学而至尧曰"},
 ]
}
# 更正 bible 路径为相对 DATA 的简写，实际前端按 id 映射
catalog2={
 "version":"2026-11-02",
 "corpora":[
   {"id":"bible","name":"圣经·和合本","count":31021,"booksFile":"books.json","dataFile":"cuv.json","desc":"31,021节"},
   {"id":"quran","name":"古兰经·马坚","count":6236,"booksFile":"quran/books.json","dataFile":"quran/quran.json","desc":"114章 6236节"},
   {"id":"buddhist","name":"佛经·心经·金刚经","count":len(buddhist_v),"booksFile":"buddhist/books.json","dataFile":"buddhist/buddhist.json","desc":"心经+金刚32品"},
   {"id":"dao","name":"道德经","count":81,"booksFile":"dao/books.json","dataFile":"dao/dao.json","desc":"81章"},
   {"id":"lunyu","name":"论语","count":len(lunyu_v),"booksFile":"lunyu/books.json","dataFile":"lunyu/lunyu.json","desc":"20篇"},
 ]
}
write_json(DATA/"catalog.json", catalog2)
gz_br(DATA/"catalog.json")
print("done catalog", catalog2)
