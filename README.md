# LearningText 學字遊戲

由 Bill Chiu 開發。俾小朋友玩嘅繁體中文學字網頁遊戲，放 GitHub Pages，iPhone 可以「加至主畫面」。

| 遊戲 | 位置 | 網址（開咗 GitHub Pages 之後） |
|---|---|---|
| 拆字小偵探 | `char-puzzle/` | `https://shimegi-bill.github.io/LearningText/char-puzzle/` |

## 拆字小偵探

### 首頁
開遊戲先見首頁：完成關卡、識嘅字、⭐ 星星；「▶ 開始／繼續 第 N 關」；🔢 揀關卡、📖 我嘅紀錄、⚙️ 設定；「溫習一隻字」（隨機一隻識咗嘅字，撳睇字卡）。遊戲頂部 🏠 返首頁。

### 玩法
1. 畫面中間有一隻大字（母字）。
2. 撳筆畫揀（再撳一次取消），或者用手指掃過幾筆一次過揀。揀咗嘅筆畫變橙色，左邊細格會即刻顯示砌成咩樣。
3. 撳「✅ 確定」。啱嘅話，個字會飛上頂嘅格仔，顯示粵拼（或者拼音），仲會用廣東話讀出嚟；下面訊息會出一個例子詞語。
4. 撳搵到嘅字（頂嘅格仔、訊息、過關卡、我識嘅字）會彈出「字卡」：解釋、例子詞語、粵拼同普通話拼音，🔊 讀出字同詞語。
5. 搵晒頂嘅格仔先會過關，去下一隻母字。
6. 揀到簡體字（例如「赛」）會話佢係簡體字同埋繁體係點寫，唔計分。
7. 格仔入面係小學字，要搵晒先過關；其他香港常用字（例如「尸」「卜」「沐」）係「⭐ 加分字」，砌到都計，喺格仔下面顯示，唔使搵晒。

| 掣 | 做咩 |
|---|---|
| ⏭️ 跳關 | 問一次，跳去下一關；呢關記低做「跳過」，之後可以喺紀錄返嚟玩 |
| 💡 提示 | 先問「要提示？」（會少星星），撳「好」先俾：第 1 次講幾多筆、讀音（同讀出聲）；再要：閃嗰幾筆俾你睇 |
| 🧹 清除 | 清走揀咗嘅筆畫 |
| ✋ 全選 | 揀晒全部筆畫（母字本身都係答案） |
| ✅ 確定 | 檢查揀咗嘅筆畫係咪一隻字 |
| 第 N 關 ▾（頂部） | 揀關卡：輸入關數，或者每 100 關一頁撳格仔；顏色：綠＝完成、藍＝玩緊、黃＝跳過 |
| 📖 紀錄 | 每關搵到咩字、星星、跳過咗邊關；「我識嘅字」列晒搵過嘅字（撳就讀出聲）；撳一關可以返去玩 |
| 🏠（左上） | 返首頁 |
| ⚙️ 設定（喺首頁） | 讀音（粵拼／拼音／唔顯示）、讀出聲、音效、由第 1 關重新開始 |

- 進度自動存喺手機（localStorage `chaizi-v1`），記低玩到第幾關同每關搵到嘅字。
- 星星：冇用提示 3 粒、用 1–3 次 2 粒、多過 3 次 1 粒。
- 第 1 關有隻手示範點樣揀筆畫同撳確定（唔用文字），撳一下就停。

### 字庫（只用繁體字）
- 母字同答案只用香港《常用字字形表》嘅字（Unicode Unihan `kHKGlyph`），再限小學字表（`kGradeLevel`）或者常用頻率 1–3（`kFrequency`），共大約 2,700 字。
- 簡體字（有繁體對應、唔喺 Big5、唔喺香港字表）唔會做答案；揀到會彈「係簡體字」提示。
- 筆畫形狀用 Make Me a Hanzi 嘅楷書筆畫（Arphic 字型）。
- 而家有 2000 關，按難度由易到難排（母字筆畫、答案數目、答案筆畫、母字年級）：第 1 關「木」（一、八、十、木），第 2000 關「囉」。舊版有嘅關都保留（玩家紀錄唔會唔見）。
- 每隻字嘅解釋、例子詞語：教育部《重編國語辭典修訂本》原文（揀主要解釋，詞語盡量用同一條解釋入面嘅例子，揀常見、小朋友識嘅字組成）；粵拼：rime-cantonese；普通話拼音用內地聲調。

### 檔案
| 檔案 | 用途 |
|---|---|
| `char-puzzle/index.html` | 遊戲（畫面、玩法、存檔、自動更新） |
| `char-puzzle/levels/index.js` | 關卡清單（2000 關嘅母字、答案數目、讀音） |
| `char-puzzle/levels/000.js`…`019.js` | 每 100 關一個檔，玩到先載入（自動產生，唔好人手改） |
| `char-puzzle/levels/dict.js` | 每隻字嘅粵拼、拼音、解釋、詞語（自動產生） |
| `char-puzzle/levels/chars.txt` | 用到嘅字（俾 `build_dict.py`） |
| `char-puzzle/manifest.json`、`*.png` | 主畫面圖示 |
| `tools/build_levels.mjs` | 計每隻母字可以砌出邊啲字，出 `levels/` |
| `tools/build_dict.py` | 出 `levels/dict.js`（解釋、詞語、讀音） |
| `tools/export_unihan.py` | 由 Unihan 資料庫匯出字表同讀音 |
| `tools/make_icons.mjs` | 整主畫面圖示 PNG |

### 上載新版本
1. 改 `char-puzzle/index.html` 入面 `window.__CP_VER='日期-次數'`（一定要改，手機先會自動更新；`levels/` 入面嘅檔會跟住呢個版本號重新載入）。
2. 上載改過嘅檔案。手機開返遊戲就會自動攞新版。

### 重新產生關卡數據
```bash
# 1. 下載數據（放喺 repo 外面）
mkdir -p ~/cp-data && cd ~/cp-data
curl -O https://raw.githubusercontent.com/skishore/makemeahanzi/master/graphics.txt
curl -O https://raw.githubusercontent.com/skishore/makemeahanzi/master/dictionary.txt
curl -O https://registry.npmjs.org/cjk-unihan/-/cjk-unihan-0.0.3.tgz && tar xzf cjk-unihan-0.0.3.tgz
python3 -I <repo>/tools/export_unihan.py package/data/unihan.db unihan.json
# 字典數據
git clone --depth 1 https://github.com/g0v/moedict-data && xz -dk moedict-data/dict-revised.json.xz
mkdir rime && for f in jyut6ping3.words.dict.yaml jyut6ping3.chars.dict.yaml; do curl -o rime/$f https://raw.githubusercontent.com/rime/rime-cantonese/main/$f; done
curl -O https://raw.githubusercontent.com/fxsjy/jieba/master/extra_dict/dict.txt.big
# 2. 出關卡（大約 1 分鐘；先將舊 levels/index.js 抄去其他地方，用 --keep-from 保留舊母字）
node <repo>/tools/build_levels.mjs ~/cp-data --keep-from 舊index.js --order-from 舊index.js
# 3. 出字典
python3 -I <repo>/tools/build_dict.py --moe moedict-data/dict-revised.json --concised moedict-data/dict-concised.audio.json \
  --jieba dict.txt.big --rime rime --unihan unihan.json --chars <repo>/char-puzzle/levels/chars.txt --out <repo>/char-puzzle/levels/dict.js
# 調參數：只睇幾隻字嘅答案
node <repo>/tools/build_levels.mjs ~/cp-data --test 湘 木 目
# 查點解砌唔到：
node <repo>/tools/build_levels.mjs ~/cp-data --debug 湘 木
```

點樣判斷「揀嘅筆畫係咪一隻字」（`build_levels.mjs`，第三版規則，Bill 2026-11-10 定）：
1. 每一筆分類：橫、提、直、撇、點／捺；有轉角就分段（例如 𠃌 ＝ 橫＋直）；收筆鉤另外記（見第 7 點）；慢慢彎嘅「豎撇」當撇。
2. 候選字每一筆按筆順對應母字其中一筆，類型要一樣（撇唔可以當橫）。分界附近差 20° 以內通融（「月」嘅豎撇當直）；有轉角嘅筆每段差 30° 以內都得（楷書「口」「尺」嘅 𠃌 右邊斜向內，「巾」「尸」係直落）。
3. 每兩筆嘅關係要一樣：交叉、掂住、分開。掂住或者交叉嘅位置（喺筆畫個頭、中間定尾）要差唔多，例如「丁」係直筆個頭掂住橫筆中間。
   - 目標字分開：母字分開或者差少少掂到都得（「午」）。目標字掂住或者差少少掂住：母字都要差唔多掂住；如果母字分開，空隙要細過嗰組筆畫大細嘅兩成，而且嗰筆喺唔喺其他筆嘅範圍入面要同目標字一樣（「因」入面個口加大嘅橫 → 日；「銀」嘅捺喺王外面，唔係「玉」）；兩筆都已經掂住其他筆嘅，「差少少掂到」唔理（「大」嘅捺貼住撇）。
4. 分開嘅兩筆：左右、上下位置要一樣。
5. 長短同距離唔理。幾隻字都合規則，就用形狀分數揀最似嗰隻；形狀分數 > 0.4（散到好離譜）先唔要。
6. 拆解樹部件 3 筆以上（例如「湘」入面嘅「木」）照算，但母字嗰組筆畫唔可以多咗交叉（「重」個直筆穿過頂，唔係「里」）。
7. 鉤：最尾向上或者向左嘅短段先當鉤（亅、了、心）；「九」「乙」最尾向右上嘅彎唔係鉤。單筆嘅鉤要一樣：直鉤（亅）唔可以當直（丨），所以「謝」冇「計」（Bill 定）。有轉角嘅筆（橫折／橫折鉤）唔分鉤，因為楷書字款唔穩定（「目」嘅 𠃌 畫咗鉤）。

除錯：`--types 字` 印每筆類型；`--why 母字 字 0,1,3` 逐條規則印出嚟；`--worst 母字 字` 印最唔似嗰組筆畫。
重新產生數據時加 `--keep-from 舊index.js`（或者舊版 `levels.js`），舊版嘅母字會保留；加 `--order-from 舊index.js`，舊關嘅關數唔變（新關排最後）。關數：環境變數 `TARGET`（預設 2000）。
加分字：小學字以外嘅香港常用字（`HKX`），同一組筆畫小學字優先（`BONUS_PEN`）；每關存喺 `b`。

改完門檻用對照表檢查（每個答案「最差」嗰組筆畫 vs 真字）：
```bash
node <repo>/tools/build_levels.mjs ~/cp-data --review review.html 友 果 硬
```

## 授權
- 筆畫數據（`levels.js` 入面嘅筆畫）：由 [Make Me a Hanzi](https://github.com/skishore/makemeahanzi) 嘅 `graphics.txt` 而嚟，源自 Arphic PL KaitiM GB 同 Arphic PL UKai，跟 Arphic Public License（`licenses/ARPHICPL.TXT`）。
- 字表、讀音：Unicode Unihan Database，跟 Unicode License v3（`licenses/UNICODE-LICENSE.txt`）。
- 部件拆解（只喺產生數據時用）：Make Me a Hanzi `dictionary.txt`（LGPL）。
- 解釋、詞語、詞語拼音：教育部《重編國語辭典修訂本》，CC BY-ND 3.0 TW，原文照用唔改字（`licenses/MOE-DICT.md`）。
- 粵拼：rime-cantonese，CC BY 4.0（`licenses/RIME-CANTONESE-CC-BY-4.0.txt`）。
- 詞頻（只喺產生數據時用）：jieba，MIT（`licenses/JIEBA-MIT.txt`）。
