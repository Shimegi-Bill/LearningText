"""拆字小偵探：整每隻字嘅「解釋 ＋ 詞語例子 ＋ 讀音」（char-puzzle/levels/dict.js）

輸入：
  --moe      dict-revised.json        教育部《重編國語辭典修訂本》（g0v/moedict-data，CC BY-ND 3.0 TW：解釋原文照用，唔改字）
  --concised dict-concised.audio.json 《國語辭典簡編本》詞目清單（用嚟揀學生常見詞語）
  --jieba    dict.txt.big             jieba 繁體詞頻（MIT）
  --rime     rime-cantonese 資料夾     jyut6ping3.words.dict.yaml、jyut6ping3.chars.dict.yaml（CC BY 4.0）
  --unihan   unihan.json              tools/export_unihan.py 匯出
  --chars    char-puzzle/levels/chars.txt（build_levels.mjs 寫）
輸出：char-puzzle/levels/dict.js   window.LV_DICT = {字: [粵拼, 拼音, 解釋, 詞語, 詞語粵拼, 詞語拼音]}

用法：python3 -I tools/build_dict.py --moe … --concised … --jieba … --rime … --unihan … --chars … --out …
"""
import argparse
import json
import math
import re
import unicodedata

ap = argparse.ArgumentParser()
for k in ('moe', 'concised', 'jieba', 'rime', 'unihan', 'chars', 'out'):
    ap.add_argument('--' + k, required=True)
A = ap.parse_args()

U = json.load(open(A.unihan, encoding='utf8'))
MOE = {}
for e in json.load(open(A.moe, encoding='utf8')):
    MOE.setdefault(e['title'], e)
CONCISED = set(k.split('.')[0] for k in json.load(open(A.concised, encoding='utf8')))
FREQ = {}
for line in open(A.jieba, encoding='utf8'):
    p = line.split()
    if len(p) >= 2 and p[1].isdigit():
        FREQ[p[0]] = max(FREQ.get(p[0], 0), int(p[1]))


def rime_read(path):
    out = {}
    body = False
    for line in open(path, encoding='utf8'):
        line = line.rstrip('\n')
        if line == '...':
            body = True
            continue
        if not body or not line or line.startswith('#'):
            continue
        p = line.split('\t')
        if len(p) < 2:
            continue
        w = 0.0
        if len(p) >= 3 and p[2].endswith('%'):
            try:
                w = float(p[2][:-1])
            except ValueError:
                w = 0.0
        else:
            w = 100.0
        out.setdefault(p[0], []).append((p[1], w))
    return out


RW = rime_read(A.rime + '/jyut6ping3.words.dict.yaml')
RC = rime_read(A.rime + '/jyut6ping3.chars.dict.yaml')

isHK = lambda c: bool(U.get(c, {}).get('kHKGlyph'))


def simp(c):
    # 簡體字：有繁體對應、唔喺 Big5、唔喺香港字表（同遊戲一樣嘅判斷）
    u = U.get(c, {})
    return bool(u.get('kTraditionalVariant')) and not u.get('kBigFive') and not u.get('kHKGlyph')


has_simp = lambda t: any(simp(ch) for ch in t)
grade = lambda c: int(U.get(c, {}).get('kGradeLevel', 7))


def char_jp(c):
    r = RC.get(c)
    if r:
        return max(r, key=lambda x: x[1])[0]
    return (U.get(c, {}).get('kCantonese') or '').split(' ')[0]


def strip_tone(s):
    return ''.join(ch for ch in unicodedata.normalize('NFD', s) if unicodedata.category(ch) != 'Mn')


BAD_DEF = re.compile(r'\{\[|^姓|部首之一|^參見|之讀音|之語音|之又音|的語音|的讀音|的異體字|又音|人名用字|地名用字|^見「|^\(一\)|^（一）|^[0-9０-９]')
BLOCK = set('姦淫妓嫖娼屌屄屍尿屎屁')


def excerpt(d):
    """解釋原文只會「截取」唔會改字：有 (1)(2) 就攞 (1) 嗰段；「如：」之後嘅例子另外顯示；太長就攞頭一兩句"""
    m = re.search(r'\(1\)(.*?)(?:\(2\)|$)', d)
    if m:
        d = m.group(1)
    d = re.split(r'如：', d)[0].strip()
    # 古書引文（《爾雅》：「…」）小朋友睇唔明，截走
    cut = re.split(r'《', d)[0].strip()
    if len(cut) >= 4:
        d = cut
    if len(d) > 60:
        sents = re.findall(r'[^。；]+[。；]', d)
        acc = ''
        for x in sents:
            if len(acc) + len(x) > 60:
                break
            acc += x
        if len(acc) >= 6:
            d = acc
    return d


def quotes(dobj):
    q = re.findall(r'「([^」]+)」', dobj.get('def', ''))
    for ex in dobj.get('example', []) or []:
        q += re.findall(r'「([^」]+)」', ex)
    return q


def word_score(w, c):
    if any(ch in BLOCK and ch != c for ch in w):
        return None
    others = [ch for ch in w if ch != c]
    f = FREQ.get(w, 0)
    sc = math.log(f + 1)
    sc += 2.0 if w in CONCISED else 0
    sc += 0.6 * sum(1 for ch in others if grade(ch) <= 3)
    sc -= 0.8 * sum(1 for ch in others if grade(ch) >= 7)
    return sc


def heteronyms_in_order(c, e):
    hs = [h for h in e.get('heteronyms', []) if h.get('definitions')]
    want = (U.get(c, {}).get('kMandarin') or '').split(' ')[0]
    first = [h for h in hs if (h.get('pinyin') or '').split('（')[0].strip() == want]
    if not first and want:
        first = [h for h in hs if strip_tone(h.get('pinyin') or '') == strip_tone(want)]
    rest = sorted([h for h in hs if h not in first], key=lambda h: -len(h['definitions']))
    return first + rest


# 小朋友未必啱嘅解釋（古代、地支、量詞…）排後
TECH = re.compile(r'地支|天干|時辰|古代|古時|古稱|古人|舊時|文言|書信|中醫|佛教|道教|八卦|卦名|星名|國名|朝代|樂律|姓|量詞|助詞|詞尾|詞綴|語氣|通「|同「')


def variants(c):
    u = U.get(c, {})
    out = []
    for k in ('kTraditionalVariant', 'kSemanticVariant', 'kZVariant', 'kSpecializedSemanticVariant'):
        for m in re.findall(r'U\+([0-9A-F]+)', u.get(k, '')):
            v = chr(int(m, 16))
            if v != c and v not in out:
                out.append(v)
    return out


def char_entry(c, depth=0):
    """回傳 (解釋, 詞語)：用主要解釋（第一個，小朋友啱嘅先），詞語盡量揀同一個解釋入面「如：「…」」嘅例子"""
    e = MOE.get(c)
    if not e:
        # 香港寫法教育部辭典冇（温、户、着、盃）：用台灣寫法查，詞語換返香港寫法
        if depth == 0:
            for v in variants(c):
                if v in MOE:
                    d, w = char_entry(v, 1)
                    if not w and v in needset:
                        w = pick_word(v)
                    elif not w:
                        w = pick_word_any(v)
                    return d, w.replace(v, c)
        return '', ''
    if depth > 3:
        return '', ''
    hs = heteronyms_in_order(c, e)
    alld = [d.get('def', '') for h in hs for d in h['definitions']]
    if alld and all('的異體字' in d for d in alld if d):
        m = re.search(r'「(.)」的異體字', alld[0])
        if m:
            d, w = char_entry(m.group(1), depth + 1)
            return d, w.replace(m.group(1), c)
    good, refs = [], []
    for h in hs:
        for dobj in h['definitions']:
            d = dobj.get('def', '')
            if not d:
                continue
            r = re.match(r'^參見「([^」]+)」', d)
            if r and c in r.group(1):
                refs.append(r.group(1))
            if BAD_DEF.search(d):
                continue
            t = excerpt(d)
            if t and len(t) <= 60 and len(t) >= 3 and not BAD_DEF.search(t) and not has_simp(t):
                good.append((t, dobj, d))
    if not good and refs:
        # 「蝴：參見「蝴蝶」條」→ 用「蝴蝶」嘅解釋，詞語就係「蝴蝶」
        w = refs[0]
        we = MOE.get(w)
        if we:
            for h in we.get('heteronyms', []):
                for dobj in h.get('definitions', []):
                    t = excerpt(dobj.get('def', ''))
                    if t and len(t) <= 60 and not BAD_DEF.search(t) and not has_simp(t):
                        return t, w
    if not good:
        return '', ''
    good = [g for g in good if not TECH.search(g[2])] + [g for g in good if TECH.search(g[2])]

    def ex_words(dobj):
        out = []
        for k, q in enumerate(quotes(dobj)):
            if len(q) == 2 and c in q and all(isHK(ch) for ch in q):
                sc = word_score(q, c)
                if sc is not None:
                    out.append((sc + max(0, 1.5 - 0.5 * k), q))  # 辭典第一個例子最典型
        return out

    # 主要解釋冇例子：用主要解釋 ＋ 常見詞語；除非後面解釋有差唔多常見嘅例子（「期」：時、日 ＋ 日期）
    if not ex_words(good[0][1]):
        general = pick_word(c)
        gs = (word_score(general, c) or 0) + (1.0 if general.startswith(c) else 0) if general else 0
        alt = None
        for k, (t, dobj, _) in enumerate(good[1:4], start=1):
            for sc, q in ex_words(dobj):
                sc -= 1.0 * k
                if alt is None or sc > alt[0]:
                    alt = (sc, t, q)
        if alt and alt[0] >= gs - 1:
            return alt[1], alt[2]
        return good[0][0], general
    # 頭四個解釋入面，揀例子詞語最常見嗰個（「謝」：表示感激 ＋ 感謝），後面嘅解釋扣少少分
    best = None
    for k, (t, dobj, _) in enumerate(good[:4]):
        for sc, q in ex_words(dobj):
            sc -= 1.0 * k
            if best is None or sc > best[0]:
                best = (sc, t, q)
    return best[1], best[2]


def pick_word_any(c):
    # 唔喺 chars.txt 嘅字（例如台灣寫法「杯」）：臨時搵詞語
    best = None
    for t in MOE:
        if len(t) == 2 and c in t and all(isHK(ch) or ch == c for ch in t):
            sc = word_score(t, c)
            if sc is not None and (best is None or sc > best[0]):
                best = (sc, t)
    return best[1] if best else ''


def pick_word(c):
    best = None
    for w, wf in candidates.get(c, []):
        sc = word_score(w, c)
        if sc is None:
            continue
        sc += 1.0 if w.startswith(c) else 0
        if best is None or sc > best[0]:
            best = (sc, w)
    return best[1] if best else ''


def word_readings(w):
    r = RW.get(w)
    jp = r[0][0] if r else ' '.join(char_jp(ch) for ch in w)
    e = MOE.get(w)
    sy = []
    if e and e.get('heteronyms'):
        sy = (e['heteronyms'][0].get('pinyin') or '').split('（')[0].split()
    out = []
    for i, ch in enumerate(w):
        km = (U.get(ch, {}).get('kMandarin') or '').split(' ')[0]
        if i < len(sy) and len(sy) == len(w):
            # 同內地讀音一樣（唔計聲調）就用內地聲調（「時期」qí → qī）；唔同（多音字，例如「音樂」yuè）就跟辭典
            out.append(km if km and strip_tone(sy[i]) == strip_tone(km) else sy[i])
        else:
            out.append(km)
    return jp, ' '.join(out)


need = [c for c in open(A.chars, encoding='utf8').read().strip()]
needset = set(need)
# 兩個字嘅詞語：兩隻字都係香港常用字，教育部辭典有
candidates = {}
for t in MOE:
    if len(t) != 2 or not all(isHK(ch) for ch in t) or '{' in t:
        continue
    f = FREQ.get(t, 0)
    if f < 5 and t not in CONCISED:
        continue
    for ch in set(t):
        if ch in needset:
            candidates.setdefault(ch, []).append((t, f))
# 教育部辭典冇詞語嘅字（「很」）：用 jieba 常見詞
for t, f in FREQ.items():
    if len(t) == 2 and f >= 200 and all(isHK(ch) for ch in t):
        for ch in set(t):
            if ch in needset and not candidates.get(ch):
                candidates.setdefault('~' + ch, []).append((t, f))
for k in [k for k in candidates if k.startswith('~')]:
    candidates[k[1:]] = candidates.pop(k)

out = {}
miss_def = []
miss_word = []
# 幾隻最基本嘅字：指定小朋友熟悉嘅詞語
WORD_OVERRIDE = {'八': '八月', '五': '五月', '為': '因為', '丐': '乞丐', '身': '身體', '目': '目光', '盃': '獎盃'}
for c in need:
    d, w = char_entry(c)
    if not w:
        w = pick_word(c)
    if c in WORD_OVERRIDE:
        w = WORD_OVERRIDE[c]
    py = (U.get(c, {}).get('kMandarin') or '').split(' ')[0]
    wjp, wpy = word_readings(w) if w else ('', '')
    out[c] = [char_jp(c), py, d, w, wjp, wpy]
    if not d:
        miss_def.append(c)
    if not w:
        miss_word.append(c)

head = ('// 由 tools/build_dict.py 自動產生，唔好人手改\n'
        '// 解釋、詞語、拼音：教育部《重編國語辭典修訂本》（CC BY-ND 3.0 TW，原文照用）；'
        '粵拼：rime-cantonese（CC BY 4.0）、Unicode Unihan；詞頻：jieba（MIT）\n')
with open(A.out, 'w', encoding='utf8') as f:
    f.write(head + 'window.LV_DICT=' + json.dumps(out, ensure_ascii=False, separators=(',', ':')) + ';\n')
print(len(out), 'chars; no def', len(miss_def), ''.join(miss_def[:60]), '; no word', len(miss_word), ''.join(miss_word[:60]))
for c in '一人大木口日目十八天友夫王謝討言寸身射白午五丐綫裏着為衛行樂子父媽們場期兔蛇冬蝴蝶很温户盃':
    if c in out:
        print(c, out[c])
