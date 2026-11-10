# LearningText 學字遊戲

由 Bill Chiu 開發。俾小朋友玩嘅繁體中文學字網頁遊戲，放 GitHub Pages，iPhone 可以「加至主畫面」。

| 遊戲 | 位置 | 網址（開咗 GitHub Pages 之後） |
|---|---|---|
| 拆字小偵探 | `char-puzzle/` | `https://shimegi-bill.github.io/LearningText/char-puzzle/` |

## 拆字小偵探

### 玩法
1. 畫面中間有一隻大字（母字）。
2. 撳筆畫揀（再撳一次取消），或者用手指掃過幾筆一次過揀。揀咗嘅筆畫變橙色，左邊細格會即刻顯示砌成咩樣。
3. 撳「✅ 確定」。啱嘅話，個字會飛上頂嘅格仔，顯示粵拼（或者拼音），仲會用廣東話讀出嚟。
4. 搵晒頂嘅格仔先會過關，去下一隻母字。
5. 揀到簡體字（例如「赛」）會話佢係簡體字同埋繁體係點寫，唔計分。

| 掣 | 做咩 |
|---|---|
| ⏭️ 跳關 | 問一次，跳去下一關；呢關記低做「跳過」，之後可以喺紀錄返嚟玩 |
| 💡 提示 | 第 1 下：講幾多筆、讀音（同讀出聲）；再撳：閃嗰幾筆俾你睇 |
| 🧹 清除 | 清走揀咗嘅筆畫 |
| ✋ 全選 | 揀晒全部筆畫（母字本身都係答案） |
| ✅ 確定 | 檢查揀咗嘅筆畫係咪一隻字 |
| 📖 紀錄 | 每關搵到咩字、星星、跳過咗邊關；「我識嘅字」列晒搵過嘅字（撳就讀出聲）；撳一關可以返去玩 |
| ⚙️ 設定 | 讀音（粵拼／拼音／唔顯示）、讀出聲、音效、由第 1 關重新開始 |

- 進度自動存喺手機（localStorage `chaizi-v1`），記低玩到第幾關同每關搵到嘅字。
- 星星：冇用提示 3 粒、用 1–3 次 2 粒、多過 3 次 1 粒。
- 第 1 關有隻手示範點樣揀筆畫同撳確定（唔用文字），撳一下就停。

### 字庫（只用繁體字）
- 母字同答案只用香港《常用字字形表》嘅字（Unicode Unihan `kHKGlyph`），再限小學字表（`kGradeLevel`）或者常用頻率 1–3（`kFrequency`），共大約 2,700 字。
- 簡體字（有繁體對應、唔喺 Big5、唔喺香港字表）唔會做答案；揀到會彈「係簡體字」提示。
- 筆畫形狀用 Make Me a Hanzi 嘅楷書筆畫（Arphic 字型）。
- 而家有 293 關，由 4 畫（例如「木」：一、八、十、大、木）去到 17 畫（例如「賽」，24 隻字）。

### 檔案
| 檔案 | 用途 |
|---|---|
| `char-puzzle/index.html` | 遊戲（畫面、玩法、存檔、自動更新） |
| `char-puzzle/levels.js` | 關卡數據（自動產生，唔好人手改） |
| `char-puzzle/manifest.json`、`*.png` | 主畫面圖示 |
| `tools/build_levels.mjs` | 計每隻母字可以砌出邊啲字，出 `levels.js` |
| `tools/export_unihan.py` | 由 Unihan 資料庫匯出字表同讀音 |
| `tools/make_icons.mjs` | 整主畫面圖示 PNG |

### 上載新版本
1. 改 `char-puzzle/index.html` 入面 `window.__CP_VER='日期-次數'`（一定要改，手機先會自動更新；`levels.js` 會跟住呢個版本號重新載入）。
2. 上載改過嘅檔案。手機開返遊戲就會自動攞新版。

### 重新產生關卡數據
```bash
# 1. 下載數據（放喺 repo 外面）
mkdir -p ~/cp-data && cd ~/cp-data
curl -O https://raw.githubusercontent.com/skishore/makemeahanzi/master/graphics.txt
curl -O https://raw.githubusercontent.com/skishore/makemeahanzi/master/dictionary.txt
curl -O https://registry.npmjs.org/cjk-unihan/-/cjk-unihan-0.0.3.tgz && tar xzf cjk-unihan-0.0.3.tgz
python3 -I <repo>/tools/export_unihan.py package/data/unihan.db unihan.json
# 2. 出 levels.js（大約 2 分鐘）
node <repo>/tools/build_levels.mjs ~/cp-data
# 調參數：只睇幾隻字嘅答案
node <repo>/tools/build_levels.mjs ~/cp-data --test 湘 木 目
# 查點解砌唔到：
node <repo>/tools/build_levels.mjs ~/cp-data --debug 湘 木
```

點樣判斷「揀嘅筆畫係咪一隻字」（`build_levels.mjs`）：
1. 拆解樹：Make Me a Hanzi 嘅部件（例如「湘」入面嘅「木」「目」「相」）一定算。
2. 筆畫配對：候選字每一筆按筆順對應母字其中一筆（筆形、轉角數目要似），再檢查筆畫之間嘅關係（交叉、相接、分開）同上下左右位置，最後將成組筆畫拉到同一個方框比較形狀（分數 < 0.26 先算）。
3. 同一組筆畫只會俾最似嗰隻字。

## 授權
- 筆畫數據（`levels.js` 入面嘅筆畫）：由 [Make Me a Hanzi](https://github.com/skishore/makemeahanzi) 嘅 `graphics.txt` 而嚟，源自 Arphic PL KaitiM GB 同 Arphic PL UKai，跟 Arphic Public License（`licenses/ARPHICPL.TXT`）。
- 字表、讀音：Unicode Unihan Database，跟 Unicode License v3（`licenses/UNICODE-LICENSE.txt`）。
- 部件拆解（只喺產生數據時用）：Make Me a Hanzi `dictionary.txt`（LGPL）。
