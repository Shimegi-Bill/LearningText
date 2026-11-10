// 拆字小偵探 — level builder
// 由 Make Me a Hanzi 嘅筆畫中線（medians）計：一隻「母字」揀出邊幾筆，可以砌成另一隻香港常用繁體字。
//
// 輸入（<dataDir>）：
//   graphics.txt   https://github.com/skishore/makemeahanzi （Arphic Public License）
//   unihan.json    由 tools/export_unihan.py 匯出（Unihan：kHKGlyph、kGradeLevel、kCantonese、kMandarin…）
// 輸出：
//   char-puzzle/levels.js（window.LEVELS = {...}）
//
// 用法：
//   node tools/build_levels.mjs <dataDir>                 → 出 levels.js
//   node tools/build_levels.mjs <dataDir> --test 湘 木 目  → 只印呢幾隻字嘅答案（調參數用）

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const dataDir = process.argv[2];
if (!dataDir) { console.error('usage: node build_levels.mjs <dataDir> [--test 字...]'); process.exit(1); }
const testIdx = process.argv.indexOf('--test');
const TEST = testIdx > 0 ? process.argv.slice(testIdx + 1).join('').split('') : null;

// ---------- 讀數據 ----------
const U = JSON.parse(fs.readFileSync(path.join(dataDir, 'unihan.json'), 'utf8'));
const G = new Map();
for (const line of fs.readFileSync(path.join(dataDir, 'graphics.txt'), 'utf8').split('\n')) {
  if (!line.trim()) continue;
  const d = JSON.parse(line);
  if ([...d.character].length === 1) G.set(d.character, d);
}

const DICT = new Map();
for (const line of fs.readFileSync(path.join(dataDir, 'dictionary.txt'), 'utf8').split('\n')) {
  if (!line.trim()) continue;
  const d = JSON.parse(line);
  DICT.set(d.character, d);
}

const cp = ch => 'U+' + ch.codePointAt(0).toString(16).toUpperCase();
const fromU = s => String.fromCodePoint(parseInt(s.replace('U+', ''), 16));

// 繁體常用字：香港《常用字字形表》（Unihan kHKGlyph）
const isHK = ch => !!(U[ch] && U[ch].kHKGlyph);
// 簡體字（用嚟提醒「呢隻係簡體字」）：有繁體對應字、本身唔喺香港字表、唔喺 Big5
function tradOf(ch) {
  const u = U[ch];
  if (!u || !u.kTraditionalVariant || u.kHKGlyph || u.kBigFive) return null;
  const t = u.kTraditionalVariant.split(/\s+/).map(fromU).filter(c => c !== ch && isHK(c));
  return t.length ? t[0] : null;
}

// ---------- 筆畫特徵 ----------
const K = 12; // 每筆重新取樣幾多點
function resample(poly, k) {
  const pts = poly.map(([x, y]) => [x, y]);
  if (pts.length === 1) pts.push([pts[0][0] + 1, pts[0][1]]);
  const seg = [];
  let total = 0;
  for (let i = 1; i < pts.length; i++) {
    const l = Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
    seg.push(l); total += l;
  }
  const out = [];
  for (let s = 0; s < k; s++) {
    let t = total * s / (k - 1), i = 0;
    while (i < seg.length - 1 && t > seg[i]) { t -= seg[i]; i++; }
    const r = seg[i] ? Math.min(1, t / seg[i]) : 0;
    out.push([pts[i][0] + (pts[i + 1][0] - pts[i][0]) * r, pts[i][1] + (pts[i + 1][1] - pts[i][1]) * r]);
  }
  return { pts: out, len: total };
}

function strokeFeatures(ch) {
  const d = G.get(ch);
  return d.medians.map(m => {
    const { pts, len } = resample(m, K);
    const dirs = [];
    for (let i = 1; i < K; i++) dirs.push(Math.atan2(pts[i][1] - pts[i - 1][1], pts[i][0] - pts[i - 1][0]));
    let cx = 0, cy = 0;
    for (const p of pts) { cx += p[0]; cy += p[1]; }
    // 轉角數目：唔計頭尾嗰段（起筆、收筆、鈎），隔一段比方向，轉 > 60° 當一個轉角
    let corners = 0;
    for (let i = 1; i + 2 <= dirs.length - 2; i++) {
      if (angDiff(dirs[i], dirs[i + 2]) > 60 * DEG) { corners++; i += 2; }
    }
    return { raw: m, pts, len, dirs, corners, cx: cx / K, cy: cy / K, chord: Math.atan2(pts[K - 1][1] - pts[0][1], pts[K - 1][0] - pts[0][0]) };
  });
}

const angDiff = (a, b) => { let d = Math.abs(a - b) % (2 * Math.PI); return d > Math.PI ? 2 * Math.PI - d : d; };
const DEG = Math.PI / 180;

// 形狀大致相似（唔理位置同大小）
function shapeCompat(a, b) {
  let s = 0, mx = 0;
  for (let i = 0; i < a.dirs.length; i++) {
    const d = angDiff(a.dirs[i], b.dirs[i]);
    s += d;
    if (i > 0 && i < a.dirs.length - 1 && a.corners === 0) mx = Math.max(mx, d); // 冇轉角嘅筆先比，唔計起筆收筆
  }
  s /= a.dirs.length;
  if (mx > 50 * DEG) return false; // 例如「丿」尾段向左，「丨」一直向下
  return a.corners === b.corners && s < 36 * DEG && angDiff(a.chord, b.chord) < 30 * DEG;
}

function bbox(strokes) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const st of strokes) for (const [x, y] of st.pts) {
    if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
  }
  return { x0, y0, x1, y1, w: x1 - x0, h: y1 - y0 };
}

// ---------- 筆畫之間嘅關係：0 分開、1 相接、2 交叉 ----------
const TOUCH = 48; // 1024 格入面，交叉點離筆畫頭尾幾近當「相接」唔當交叉
function segInter(a, b, c, d) { // 兩條線段有冇交叉，有就回傳 [t, u]
  const r = [b[0] - a[0], b[1] - a[1]], q = [d[0] - c[0], d[1] - c[1]];
  const den = r[0] * q[1] - r[1] * q[0];
  if (Math.abs(den) < 1e-9) return null;
  const t = ((c[0] - a[0]) * q[1] - (c[1] - a[1]) * q[0]) / den;
  const u = ((c[0] - a[0]) * r[1] - (c[1] - a[1]) * r[0]) / den;
  return t >= 0 && t <= 1 && u >= 0 && u <= 1 ? [t, u] : null;
}
function ptSegDist(p, a, b) {
  const dx = b[0] - a[0], dy = b[1] - a[1], L = dx * dx + dy * dy;
  let t = L ? ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / L : 0;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy);
}
function polyDist(p, poly) { let d = Infinity; for (let i = 1; i < poly.length; i++) d = Math.min(d, ptSegDist(p, poly[i - 1], poly[i])); return d; }
function nearEnd(p, poly) { return Math.min(Math.hypot(p[0] - poly[0][0], p[1] - poly[0][1]), Math.hypot(p[0] - poly.at(-1)[0], p[1] - poly.at(-1)[1])); }
function relation(A, B) {
  const a = A.raw, b = B.raw;
  for (let i = 1; i < a.length; i++) for (let j = 1; j < b.length; j++) {
    const r = segInter(a[i - 1], a[i], b[j - 1], b[j]);
    if (r) {
      const p = [a[i - 1][0] + (a[i][0] - a[i - 1][0]) * r[0], a[i - 1][1] + (a[i][1] - a[i - 1][1]) * r[0]];
      // 交叉點唔係喺任何一筆嘅頭尾附近先算交叉
      if (nearEnd(p, a) > TOUCH * 0.6 && nearEnd(p, b) > TOUCH * 0.6) return 2;
      return 1;
    }
  }
  const d = Math.min(polyDist(a[0], b), polyDist(a.at(-1), b), polyDist(b[0], a), polyDist(b.at(-1), a));
  // 相接程度：30 以內 = 1，80 以外 = 0，中間慢慢變（避免啱啱喺門檻兩邊）
  return Math.max(0, Math.min(1, (80 - d) / 50));
}
function relMatrix(F) {
  const R = F.map(() => new Float32Array(F.length));
  for (let i = 0; i < F.length; i++) for (let k = i + 1; k < F.length; k++) R[i][k] = R[k][i] = relation(F[i], F[k]);
  return R;
}
const relCost = (x, b) => {
  if (x < 2 && b < 2) return 0.6 * Math.abs(x - b); // 相接程度差：位置誤差已經計咗一部分
  if (x === 2 && b === 2) return 0;
  // 交叉同唔交叉完全唔同（例如「大」同「丈」、「人」同「乂」）：交叉↔相接 1、交叉↔分開 1.5
  return 1 + 0.5 * (1 - Math.min(x, b));
};

const AR_MAX = +(process.env.AR_MAX || 3.6);
const FLOOR = 0.35; // 打橫一劃、打直一劃都唔會除零
function normalizer(strokes) {
  const b = bbox(strokes);
  const big = Math.max(b.w, b.h, 1);
  const sx = Math.max(b.w, FLOOR * big), sy = Math.max(b.h, FLOOR * big);
  const cx = (b.x0 + b.x1) / 2, cy = (b.y0 + b.y1) / 2;
  return { f: ([x, y]) => [(x - cx) / sx, (y - cy) / sy], aspect: sx / sy, b };
}

// 一組母字筆畫（已經按次序對應咗候選字每一筆）有幾似候選字
// 先按成組筆畫嘅外框拉正，再沿筆畫重新取點（唔係先取點再拉正：窄嘅「目」入面個「口」直筆長好多，點會分佈唔同）
function arcLen(pts) { let l = 0; for (let k = 1; k < pts.length; k++) l += Math.hypot(pts[k][0] - pts[k - 1][0], pts[k][1] - pts[k - 1][1]); return l; }
function normStrokes(strokes) {
  const nz = normalizer(strokes);
  return { aspect: nz.aspect, pts: strokes.map(st => resample(st.raw.map(nz.f), K).pts) };
}
const xNormCache = new WeakMap();
function geomScore(bStrokes, xStrokes) {
  const nb = normStrokes(bStrokes);
  let nx = xNormCache.get(xStrokes);
  if (!nx) { nx = normStrokes(xStrokes); xNormCache.set(xStrokes, nx); }
  const ar = nb.aspect / nx.aspect;
  if (ar > AR_MAX || ar < 1 / AR_MAX) return null;
  let total = 0, worst = 0, lenPen = 0;
  for (let i = 0; i < xStrokes.length; i++) {
    const pb = nb.pts[i], px = nx.pts[i];
    // 拉正之後每筆長度要差唔多（一點唔可以當一橫）
    const lb = arcLen(pb), lx = arcLen(px), lr = Math.log(Math.max(lb, 0.02) / Math.max(lx, 0.02));
    if (Math.abs(lr) > Math.log(2.2)) return null;
    lenPen += Math.max(0, Math.abs(lr) - Math.log(1.35));
    let e = 0;
    for (let k = 0; k < K; k++) e += Math.hypot(pb[k][0] - px[k][0], pb[k][1] - px[k][1]);
    e /= K;
    // 方向（正規化之後）
    const db = Math.atan2(pb[K - 1][1] - pb[0][1], pb[K - 1][0] - pb[0][0]);
    const dx = Math.atan2(px[K - 1][1] - px[0][1], px[K - 1][0] - px[0][0]);
    if (angDiff(db, dx) > 38 * DEG) return null;
    total += e; worst = Math.max(worst, e);
  }
  const mean = total / xStrokes.length;
  // 大細比例相差太遠扣少少分
  const arPen = Math.abs(Math.log(ar)) * 0.03;
  return { mean, worst, lenPen, score: mean + 0.35 * worst + arPen + 0.12 * lenPen };
}

const SCORE_OK = +(process.env.SCORE_OK || 0.19);
const REL_W = +(process.env.REL_W || 0.06);
const MEAN_OK = +(process.env.MEAN_OK || 0.17), WORST_OK = +(process.env.WORST_OK || 0.28);

// 搵晒母字 B 入面所有可以砌成候選字 X 嘅筆畫組合（保持筆順次序）
const relBudget = n => 0.45 + 0.06 * n * (n - 1) / 2;
function findSubsets(BF, XF, RB, RX, limit = 4000) {
  const n = XF.length, m = BF.length;
  if (n > m) return [];
  const compat = XF.map(xs => BF.map(bs => shapeCompat(xs, bs)));
  // 候選字自己嘅相對位置（用嚟剪枝）
  const xb = bbox(XF), xsize = Math.max(xb.w, xb.h, 1);
  const budget = relBudget(n);
  const found = [];
  const pick = [];
  let visits = 0;
  function pos(i, k) { // X 第 i 筆同第 k 筆嘅上下左右要同母字一致
    const dxX = (XF[k].cx - XF[i].cx) / xsize, dyX = (XF[k].cy - XF[i].cy) / xsize;
    const dxB = BF[pick[k]].cx - BF[pick[i]].cx, dyB = BF[pick[k]].cy - BF[pick[i]].cy;
    if (dxX > 0.15 && dxB < -15) return false;
    if (dxX < -0.15 && dxB > 15) return false;
    if (dyX > 0.15 && dyB < -15) return false;
    if (dyX < -0.15 && dyB > 15) return false;
    return true;
  }
  function dfs(i, from, cost) {
    if (++visits > 400000) return;
    if (i === n) {
      const g = geomScore(pick.map(j => BF[j]), XF);
      if (g && g.mean < MEAN_OK && g.worst < WORST_OK) found.push({ idx: pick.slice(), ...g, rel: cost, score: g.score + REL_W * cost });
      return;
    }
    for (let j = from; j <= m - (n - i); j++) {
      if (!compat[i][j]) continue;
      pick[i] = j;
      let ok = true, c = cost;
      for (let k = 0; k < i && ok; k++) {
        ok = pos(k, i);
        c += relCost(RX[k][i], RB[pick[k]][j]);
        if (c > budget) ok = false;
      }
      if (ok) dfs(i + 1, j + 1, c);
      if (found.length >= limit) return;
    }
  }
  dfs(0, 0, 0);
  return found;
}

// ---------- 候選字 ----------
const featCache = new Map();
const feat = ch => { if (!featCache.has(ch)) featCache.set(ch, strokeFeatures(ch)); return featCache.get(ch); };
const relCache = new Map();
const rels = ch => { if (!relCache.has(ch)) relCache.set(ch, relMatrix(feat(ch))); return relCache.get(ch); };

// 答案只用小朋友識嘅字：香港小學字表（kGradeLevel）或者常用頻率 1–3
const isKid = ch => isHK(ch) && (U[ch].kGradeLevel || +(U[ch].kFrequency || 9) <= 3);
const HK = [...G.keys()].filter(isKid);
const SIMP = [...G.keys()].filter(c => tradOf(c));
const nStrokes = ch => G.get(ch).medians.length;

function reading(ch) {
  const u = U[ch] || {};
  return { jp: (u.kCantonese || '').split(/\s+/)[0] || '', py: (u.kMandarin || '').split(/\s+/)[0] || '' };
}

// 字形拆解樹（Make Me a Hanzi 嘅 decomposition + matches）：搵出每個部件用咗母字邊幾筆
const IDC = /[\u2FF0-\u2FFB]/;
function parseIDS(ids) { // 回傳樹：{c} 或者 {op, kids:[...]}
  let i = 0; const chars = [...ids];
  function node() {
    const c = chars[i++];
    if (c === undefined) return null;
    if (IDC.test(c)) {
      const n = (c === '\u2FF2' || c === '\u2FF3') ? 3 : 2;
      const kids = []; for (let k = 0; k < n; k++) kids.push(node());
      return { op: c, kids };
    }
    return { c };
  }
  return node();
}
function components(ch, strokeIdx, out, depth = 0) {
  // strokeIdx：呢隻字每一筆喺母字入面係第幾筆
  const d = DICT.get(ch);
  if (!d || !d.decomposition || !d.matches || depth > 4) return;
  const tree = parseIDS(d.decomposition);
  if (!tree) return;
  const byPath = new Map();
  d.matches.forEach((m, si) => { if (m) { const key = m.join(','); if (!byPath.has(key)) byPath.set(key, []); byPath.get(key).push(strokeIdx[si]); } });
  (function walk(node, pathArr) {
    if (!node) return;
    if (node.c) {
      const key = pathArr.join(',');
      const idx = [...byPath.entries()].filter(([k]) => k === key || k.startsWith(key + ',')).flatMap(([, v]) => v).sort((a, b) => a - b);
      if (node.c !== '？' && G.has(node.c) && idx.length === nStrokes(node.c)) {
        out.push({ c: node.c, idx });
        components(node.c, idx, out, depth + 1);
      }
      return;
    }
    node.kids.forEach((k, j) => walk(k, pathArr.concat(j)));
  })(tree, []);
}

// 指定咗對應（部件）：筆形、關係、形狀用寬鬆門檻檢查，回傳分數或者 null
function checkMapping(BF, XF, RB, RX, idx) {
  if (idx.length !== XF.length) return null;
  for (let i = 0; i < XF.length; i++) if (!shapeCompat(XF[i], BF[idx[i]])) return null;
  let cost = 0;
  for (let a = 0; a < XF.length; a++) for (let b = a + 1; b < XF.length; b++) cost += relCost(RX[a][b], RB[idx[a]][idx[b]]);
  if (cost > relBudget(XF.length)) return null;
  const g = geomScore(idx.map(j => BF[j]), XF);
  if (!g || g.mean > MEAN_OK || g.worst > WORST_OK) return null;
  const sc = g.score + REL_W * cost;
  return sc < 0.24 ? sc : null;
}

function solveBase(B) {
  const BF = feat(B), m = BF.length, RB = rels(B);
  const bySubset = new Map(); // mask → [{ch, score, simp}]
  const add = (ch, list, simp) => {
    for (const f of list) {
      const key = f.idx.join(',');
      if (!bySubset.has(key)) bySubset.set(key, []);
      bySubset.get(key).push({ ch, score: f.score, simp, idx: f.idx });
    }
  };
  for (const X of HK) {
    const n = nStrokes(X);
    if (n > m || (n === m && X !== B)) continue;
    if (X === B) { add(X, [{ idx: [...Array(m).keys()], score: 0 }], false); continue; }
    add(X, findSubsets(BF, feat(X), RB, rels(X)), false);
  }
  // 拆解樹入面嘅部件（例如「湘」入面嘅「木」「目」「相」）一定算
  const comps = [];
  components(B, [...Array(m).keys()], comps);
  // 部件：3 筆以上（例如「湘」入面嘅「木」「目」、「媽」入面嘅「女」）照信；
  // 1–2 筆嘅細部件要過形狀檢查，例如「慎」入面得一點嘅「乙」、「奪」入面分開咗嘅「人」唔算
  for (const { c, idx } of comps) {
    if (!isKid(c)) continue;
    if (idx.length >= 3) { add(c, [{ idx, score: 0.02 }], false); continue; }
    const sc = checkMapping(BF, feat(c), RB, rels(c), idx);
    if (sc !== null) add(c, [{ idx, score: Math.max(0.02, sc - 0.05) }], false);
  }
  for (const X of SIMP) {
    const n = nStrokes(X);
    if (n >= m) continue;
    add(X, findSubsets(BF, feat(X), RB, rels(X)), true);
  }
  // 同一組筆畫只俾最似嗰隻字
  const answers = new Map(), decoys = new Map();
  for (const [key, list] of bySubset) {
    list.sort((a, b) => a.score - b.score);
    const best = list[0];
    if (best.simp && best.score > SCORE_OK) continue;
    if (!best.simp && best.score > SCORE_OK) continue;
    const tgt = best.simp ? decoys : answers;
    if (!tgt.has(best.ch)) tgt.set(best.ch, []);
    tgt.get(best.ch).push({ idx: best.idx, score: best.score });
  }
  return { answers, decoys };
}

function fmt(B, res) {
  const a = [...res.answers.entries()].map(([ch, subs]) => `${ch}(${subs.length}, ${subs[0].score.toFixed(3)}${U[ch]?.kGradeLevel ? ' g' + U[ch].kGradeLevel : ''})`);
  const d = [...res.decoys.keys()].map(c => c + '→' + tradOf(c));
  return `${B} [${nStrokes(B)}畫] 答案 ${res.answers.size}: ${a.join(' ')}\n   簡體: ${d.join(' ')}`;
}

if (TEST && !process.argv.includes("--debug")) {
  for (const B of TEST) {
    if (!G.has(B)) { console.log(B, '冇筆畫數據'); continue; }
    const t = Date.now();
    const res = solveBase(B);
    console.log(fmt(B, res), `(${Date.now() - t}ms)`);
  }
  process.exit(0);
}

// ---------- 除錯：點解 B 砌唔到 X ----------
export function debugPair(B, X) {
  const BF = feat(B), XF = feat(X);
  const n = XF.length, m = BF.length;
  const compat = XF.map(xs => BF.map(bs => shapeCompat(xs, bs)));
  console.log(`${B}→${X} compat:`);
  XF.forEach((xs, i) => console.log('  x' + i, compat[i].map((c, j) => c ? j : '.').join(' ')));
  // 試晒所有符合 compat 嘅次序組合，印最好嘅 5 個（唔理門檻）
  const res = [];
  const pick = [];
  (function dfs(i, from) {
    if (i === n) {
      const bS = pick.map(j => BF[j]);
      const nb = normalizer(bS), nx = normalizer(XF);
      const g = geomScore(bS, XF);
      const RB = rels(B), RX = rels(X);
      let rc = 0;
      for (let a = 0; a < n; a++) for (let b = a + 1; b < n; b++) rc += relCost(RX[a][b], RB[pick[a]][pick[b]]);
      res.push({ idx: pick.slice(), g, ar: (nb.aspect / nx.aspect).toFixed(2), rc });
      return;
    }
    for (let j = from; j <= m - (n - i); j++) if (compat[i][j]) { pick[i] = j; dfs(i + 1, j + 1); }
  })(0, 0);
  res.sort((a, b) => (a.g ? a.g.score : 9) - (b.g ? b.g.score : 9));
  for (const r of res.slice(0, 5)) console.log('  ', r.idx.join(','), r.g ? `mean ${r.g.mean.toFixed(3)} worst ${r.g.worst.toFixed(3)} len ${r.g.lenPen.toFixed(2)} score ${(r.g.score + REL_W * r.rc).toFixed(3)}` : 'rejected(dir/aspect/len)', 'ar', r.ar, 'rel', r.rc.toFixed(2), '/', relBudget(n).toFixed(2));
}
if (process.argv.includes('--debug')) {
  const i = process.argv.indexOf('--debug');
  debugPair(process.argv[i + 1], process.argv[i + 2]);
}
if (process.argv.includes('--rel')) {
  const ch = process.argv[process.argv.indexOf('--rel') + 1];
  const R = rels(ch);
  console.log(ch, 'relations'); R.forEach((r, i) => console.log('  ' + i, [...r].map(v => v.toFixed(1)).join(' ')));
  feat(ch).forEach((f, i) => console.log('  s' + i, JSON.stringify(f.raw)));
}
if (process.argv.includes('--corners')) {
  for (const ch of process.argv.slice(process.argv.indexOf('--corners') + 1).join('')) {
    console.log(ch, feat(ch).map(f => f.corners + ':' + f.dirs.map(d => Math.round(d / DEG)).join(',')).join('  |  '));
  }
}

// ---------- 出關卡 ----------
if (!TEST && !process.argv.some(a => a.startsWith("--"))) {
    const t0 = Date.now();
  const bases = HK.filter(c => { const n = nStrokes(c); return n >= 4 && n <= 17; });
  const results = [];
  let done = 0;
  for (const B of bases) {
    const res = solveBase(B);
    const ans = [...res.answers.keys()];
    const basic = new Set(['一', '二', '三', '十']);
    const interesting = ans.filter(c => !basic.has(c) && c !== B).length;
    if (ans.length >= 5 && interesting >= 2) results.push({ B, res, n: nStrokes(B), count: ans.length, interesting });
    if (++done % 200 === 0) console.error(`${done}/${bases.length} ${((Date.now() - t0) / 1000).toFixed(0)}s`);
  }
  // 每個筆畫數分配幾多關（少畫嘅先，慢慢加難）；同一筆畫數揀有趣答案多、小朋友早啲學嘅字
  const QUOTA = { 4: 8, 5: 12, 6: 16, 7: 20, 8: 24, 9: 26, 10: 28, 11: 28, 12: 28, 13: 26, 14: 24, 15: 22, 16: 18, 17: 14 };
  const grade = c => +(U[c].kGradeLevel || 7);
  const chosen = [];
  for (const [n, q] of Object.entries(QUOTA)) {
    const pool = results.filter(r => r.n === +n && (r.interesting / r.count >= 0.3 || r.interesting >= 4));
    pool.forEach(r => { r.pick = Math.min(r.interesting, 10) + (grade(r.B) <= 3 ? 3 : grade(r.B) <= 6 ? 1.5 : 0); });
    pool.sort((x, y) => y.pick - x.pick);
    chosen.push(...pool.slice(0, q));
  }
  // 難度：筆畫數 + 答案數
  chosen.forEach(r => { r.diff = r.n + 0.4 * Math.min(r.count, 24); });
  chosen.sort((x, y) => x.diff - y.diff);

  const R = {}; // 讀音表
  const reads = ch => { if (!R[ch]) { const r = reading(ch); R[ch] = [r.jp, r.py]; } };
  const mask = idx => idx.reduce((m, i) => m + 2 ** i, 0);
  const levels = chosen.map(({ B, res }) => {
    const d = G.get(B);
    reads(B);
    // 答案排次序：筆畫少嘅先，母字自己最後
    const ans = [...res.answers.entries()].sort((a, b) => (a[0] === B) - (b[0] === B) || nStrokes(a[0]) - nStrokes(b[0]) || a[0].localeCompare(b[0]));
    const answers = ans.slice(0, 24).map(([ch, subs]) => { reads(ch); return [ch, subs.sort((x, y) => x.score - y.score).slice(0, 150).map(x => mask(x.idx))]; });
    const decoys = [...res.decoys.entries()].map(([ch, subs]) => [ch, tradOf(ch), subs.sort((x, y) => x.score - y.score).slice(0, 30).map(x => mask(x.idx))]);
    return {
      c: B,
      s: d.strokes.map(p => p.replace(/\s+/g, ' ').trim()),
      m: d.medians.map(m => m.map(([x, y]) => [Math.round(x), Math.round(y)])),
      a: answers,
      d: decoys,
    };
  });
  const out = { v: 1, built: new Date().toISOString().slice(0, 10), levels, readings: R };
  const js = '// 由 tools/build_levels.mjs 自動產生，唔好人手改\n// 筆畫數據：Make Me a Hanzi（Arphic Public License），字表同讀音：Unicode Unihan\nwindow.LEVELS=' + JSON.stringify(out) + ';\n';
  const dest = path.join(ROOT, 'char-puzzle', 'levels.js');
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.writeFileSync(dest, js);
  console.log(`bases ${bases.length}, usable ${results.length}, levels ${levels.length}, size ${(js.length / 1024).toFixed(0)} KB, ${((Date.now() - t0) / 1000).toFixed(0)}s`);
  console.log(levels.slice(0, 40).map((l, i) => `${i + 1}.${l.c}(${l.a.length})`).join(' '));
  console.log('...', levels.slice(-20).map(l => `${l.c}(${l.a.length})`).join(' '));
}

// ---------- 對照表：每個答案「最差」嗰組筆畫 vs 真字，俾人眼睇 ----------
// node tools/build_levels.mjs <dataDir> --review out.html 友 林 果
if (process.argv.includes('--review')) {
  const i = process.argv.indexOf('--review');
  const out = process.argv[i + 1];
  const chars = process.argv.slice(i + 2).join('').split('');
  const svgOf = (ch, idx) => {
    const d = G.get(ch);
    let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
    idx.forEach(k => d.medians[k].forEach(([x, y]) => { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }));
    const pad = 70, size = Math.max(x1 - x0 + 2 * pad, y1 - y0 + 2 * pad, 260);
    const cx = (x0 + x1) / 2, cy = 900 - (y0 + y1) / 2;
    return `<svg viewBox="${cx - size / 2} ${cy - size / 2} ${size} ${size}" width="64" height="64"><g transform="scale(1,-1) translate(0,-900)">${idx.map(k => `<path d="${d.strokes[k]}" fill="#ff5a2c" stroke="#fff" stroke-width="${size * 0.02}" paint-order="stroke"/>`).join('')}</g></svg>`;
  };
  const full = ch => svgOf(ch, [...Array(nStrokes(ch)).keys()]).replace(/#ff5a2c/g, '#2f3e4e');
  let html = '<html><head><meta charset="utf-8"><style>body{font:12px sans-serif;margin:8px}h3{margin:10px 0 4px}.r{display:flex;flex-wrap:wrap;gap:6px}.c{border:1px solid #ccc;border-radius:6px;padding:3px;text-align:center;width:140px}.c svg{border:1px dashed #9cc}.bad{background:#ffe5e5}</style></head><body>';
  for (const B of chars) {
    const res = solveBase(B);
    html += `<h3>${B}（${nStrokes(B)} 畫）</h3><div class="r">`;
    for (const [ch, subs] of res.answers) {
      if (ch === B) continue;
      subs.sort((a, b) => b.score - a.score);
      const w = subs[0];
      html += `<div class="c${w.score > 0.15 ? ' bad' : ''}">${svgOf(B, w.idx)} ${full(ch)}<br>${ch} 最差 ${w.score.toFixed(3)} ×${subs.length}</div>`;
    }
    for (const [ch, subs] of res.decoys) html += `<div class="c" style="background:#eef">${svgOf(B, subs[0].idx)} ${full(ch)}<br>簡 ${ch} ${subs[0].score.toFixed(3)}</div>`;
    html += '</div>';
  }
  fs.writeFileSync(out, html + '</body></html>');
  console.log('wrote', out);
}
if (process.argv.includes('--comp')) {
  const i = process.argv.indexOf('--comp'); const B = process.argv[i + 1];
  const BF = feat(B), RB = rels(B), comps = []; components(B, [...Array(BF.length).keys()], comps);
  for (const { c, idx } of comps) {
    const XF = feat(c), RX = rels(c);
    const sh = XF.map((x, k) => shapeCompat(x, BF[idx[k]]) ? 'ok' : 'NO').join(',');
    let cost = 0; for (let a = 0; a < XF.length; a++) for (let b = a + 1; b < XF.length; b++) cost += relCost(RX[a][b], RB[idx[a]][idx[b]]);
    const g = geomScore(idx.map(j => BF[j]), XF);
    console.log(c, idx.join(','), 'shape', sh, 'rel', cost.toFixed(2), '/', (relBudget(XF.length) * 1.5).toFixed(2), g ? `mean ${g.mean.toFixed(3)} worst ${g.worst.toFixed(3)} score ${(g.score + REL_W * cost).toFixed(3)}` : 'geom null', '→', checkMapping(BF, XF, RB, RX, idx));
  }
}
