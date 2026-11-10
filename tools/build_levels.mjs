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

// ================= 第三版：規則配對（Bill 2026-11-10 定） =================
// 1. 每筆分類：橫 H、提 T、直 S、撇 P、點／捺 D（仲有少見嘅 U 向上、R 左上、W 向左）；有轉角就分段（例如 𠃌 = H,S）；收筆嘅鉤唔計
// 2. 砌新字：每筆類型要一樣（撇唔可以當橫）
// 3. 每兩筆：交叉、相接、分開要一樣（原本喺右邊唔可以變插穿；「下」個直要掂住個橫）；左右、上下位置要一樣
// 4. 長度同距離唔理；幾隻字都合規則先用形狀分數揀最似嗰隻
const TK = 32;
const TYPE_TOL = +(process.env.TYPE_TOL || 15);
function chordAng(p, i, j) { return Math.atan2(p[j][1] - p[i][1], p[j][0] - p[i][0]); }
function strokeClass(a) {
  const d = a / DEG;
  if (d >= -25 && d < 20) return 'H';
  if (d >= 20 && d < 80) return 'T';
  if (d >= 80 && d < 110) return 'U';
  if (d >= 110 && d < 165) return 'R';
  if (d >= 165 || d < -172) return 'W';
  if (d >= -172 && d < -103) return 'P';
  if (d >= -103 && d < -75) return 'S';
  return 'D';
}
function strokeType(raw) {
  const pts = resample(raw, TK).pts;
  const cum = [0];
  for (let k = 1; k < TK; k++) cum.push(cum[k - 1] + Math.hypot(pts[k][0] - pts[k - 1][0], pts[k][1] - pts[k - 1][1]));
  const L = cum[TK - 1] || 1;
  // 收筆鉤：最後 30% 入面突然轉 > 95°
  let end = TK - 1, hook = false;
  for (let j = TK - 2; j >= 5; j--) {
    if (L - cum[j] > 0.3 * L) break;
    if (L - cum[j] < 0.03 * L) continue;
    if (angDiff(chordAng(pts, Math.max(0, j - 5), j), chordAng(pts, j, TK - 1)) > 95 * DEG) { end = j; hook = true; break; }
  }
  // 轉角：離頭尾直線最遠嗰點偏離超過 20% 就喺度分段（圓角都搵到），最多分 4 段
  const bounds = [0, end];
  (function split(i0, i1, depth) {
    if (depth > 2 || i1 - i0 < 4) return;
    const ax = pts[i0], bx = pts[i1], len = Math.hypot(bx[0] - ax[0], bx[1] - ax[1]) || 1;
    let best = -1, bd = 0;
    for (let k = i0 + 2; k <= i1 - 2; k++) {
      const d = Math.abs((bx[0] - ax[0]) * (ax[1] - pts[k][1]) - (ax[0] - pts[k][0]) * (bx[1] - ax[1])) / len;
      if (d > bd) { bd = d; best = k; }
    }
    if (best < 0 || bd < 0.2 * Math.max(len, (cum[i1] - cum[i0]) * 0.8)) return;
    bounds.push(best);
    split(i0, best, depth + 1); split(best, i1, depth + 1);
  })(0, end, 0);
  bounds.sort((x, y) => x - y);
  // 方向差唔多（< 55°）嘅相鄰段併埋；太短（< 15%）嘅段併埋
  for (;;) {
    let changed = false;
    for (let q = 1; q < bounds.length - 1; q++) {
      const a1 = chordAng(pts, bounds[q - 1], bounds[q]), a2 = chordAng(pts, bounds[q], bounds[q + 1]);
      if (angDiff(a1, a2) < 55 * DEG) { bounds.splice(q, 1); changed = true; break; } // 例如「大」嘅豎撇（直落再撇）當一筆撇
    }
    if (!changed) for (let q = 0; q < bounds.length - 1 && bounds.length > 2; q++) {
      if (cum[bounds[q + 1]] - cum[bounds[q]] < 0.15 * L) { bounds.splice(q === 0 ? 1 : q, 1); changed = true; break; }
    }
    if (!changed) break;
  }
  const pieces = [];
  for (let q = 0; q < bounds.length - 1; q++) { const a = chordAng(pts, bounds[q], bounds[q + 1]); pieces.push({ a, c: strokeClass(a) }); }
  return { hook, pieces, code: pieces.map(p => p.c).join('') + (hook ? '鉤' : '') };
}
const typeCache = new Map();
function types(ch) {
  if (!typeCache.has(ch)) typeCache.set(ch, G.get(ch).medians.map(strokeType));
  return typeCache.get(ch);
}
function typeCompat(a, b) {
  if (a.pieces.length !== b.pieces.length) return false;
  for (let i = 0; i < a.pieces.length; i++) {
    const p = a.pieces[i], q = b.pieces[i];
    // 同一類（橫、提、直、撇、點）先得；分界附近（例如斜少少嘅直同點）差 15° 以內通融
    if (p.c !== q.c && angDiff(p.a, q.a) > TYPE_TOL * DEG) return false;
  }
  return true;
}
// 交叉：中線相交，而且交點離兩筆頭尾都超過筆長 15%
function crosses(A, B) {
  const a = A.raw, b = B.raw;
  const la = arcLenRaw(a), lb = arcLenRaw(b);
  for (let i = 1; i < a.length; i++) for (let j = 1; j < b.length; j++) {
    const r = segInter(a[i - 1], a[i], b[j - 1], b[j]);
    if (!r) continue;
    const p = [a[i - 1][0] + (a[i][0] - a[i - 1][0]) * r[0], a[i - 1][1] + (a[i][1] - a[i - 1][1]) * r[0]];
    if (nearEnd(p, a) > Math.max(20, 0.15 * la) && nearEnd(p, b) > Math.max(20, 0.15 * lb)) return true;
  }
  return false;
}
function arcLenRaw(a) { let l = 0; for (let k = 1; k < a.length; k++) l += Math.hypot(a[k][0] - a[k - 1][0], a[k][1] - a[k - 1][1]); return l; }
// 兩筆關係：交叉 X、相接 T、分開 A；相接程度喺中間嘅當「都得」（楷書有啲應該掂嘅筆畫留咗少少空）
// 仲記低掂住／交叉嘅位置：pa、pb ＝ 喺第一筆、第二筆由頭去到尾嘅邊度（0 頭、0.5 中間、1 尾）
// 例如「丁」：直筆個頭（0）掂住橫筆中間（0.5）；反轉咗（橫筆個頭掂住直筆中間）就唔係「丁」
function nearestOn(p, poly) {
  let best = { d: Infinity, u: 0 }, acc = 0;
  const L = arcLenRaw(poly) || 1;
  for (let i = 1; i < poly.length; i++) {
    const a = poly[i - 1], b = poly[i], dx = b[0] - a[0], dy = b[1] - a[1], l2 = dx * dx + dy * dy, l = Math.sqrt(l2);
    let t = l2 ? ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / l2 : 0; t = Math.max(0, Math.min(1, t));
    const d = Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy);
    if (d < best.d) best = { d, u: (acc + t * l) / L };
    acc += l;
  }
  return best;
}
function crossAt(A, B) { // 交叉點喺兩筆嘅位置
  const a = A.raw, b = B.raw, la = arcLenRaw(a) || 1, lb = arcLenRaw(b) || 1;
  let accA = 0;
  for (let i = 1; i < a.length; i++) {
    const segA = Math.hypot(a[i][0] - a[i - 1][0], a[i][1] - a[i - 1][1]);
    let accB = 0;
    for (let j = 1; j < b.length; j++) {
      const segB = Math.hypot(b[j][0] - b[j - 1][0], b[j][1] - b[j - 1][1]);
      const r = segInter(a[i - 1], a[i], b[j - 1], b[j]);
      if (r) return { pa: (accA + r[0] * segA) / la, pb: (accB + r[1] * segB) / lb };
      accB += segB;
    }
    accA += segA;
  }
  return null;
}
function link(A, B) {
  if (crosses(A, B)) { const c = crossAt(A, B); return { k: 'X', pa: c ? c.pa : 0.5, pb: c ? c.pb : 0.5 }; }
  const a = A.raw, b = B.raw;
  const cand = [
    { ...nearestOn(a[0], b), side: 'a', e: 0 }, { ...nearestOn(a.at(-1), b), side: 'a', e: 1 },
    { ...nearestOn(b[0], a), side: 'b', e: 0 }, { ...nearestOn(b.at(-1), a), side: 'b', e: 1 },
  ].sort((x, y) => x.d - y.d)[0];
  const pa = cand.side === 'a' ? cand.e : cand.u, pb = cand.side === 'a' ? cand.u : cand.e;
  const k = cand.d <= 40 ? 'T' : cand.d >= 75 ? 'A' : '?';
  return { k, pa, pb };
}
const POS_TOL = +(process.env.POS_TOL || 0.3);
function linkOk(x, b) {
  if (x.k === 'X' || b.k === 'X') {
    if (x.k !== b.k) return false;
    return Math.abs(x.pa - b.pa) <= POS_TOL + 0.05 && Math.abs(x.pb - b.pb) <= POS_TOL + 0.05;
  }
  if (x.k === 'A' || b.k === 'A') return x.k === b.k || x.k === '?' || b.k === '?';
  // 相接（或者差唔多相接）：掂住嘅位置要差唔多
  return Math.abs(x.pa - b.pa) <= POS_TOL && Math.abs(x.pb - b.pb) <= POS_TOL;
}
const crossCache = new Map();
function crossMatrix(ch) {
  if (!crossCache.has(ch)) {
    const F = feat(ch), M = F.map(() => new Array(F.length).fill(null));
    for (let i = 0; i < F.length; i++) for (let k = i + 1; k < F.length; k++) M[i][k] = link(F[i], F[k]); // 只用 i < k
    crossCache.set(ch, M);
  }
  return crossCache.get(ch);
}
// 候選字兩筆之間嘅左右上下：+1／−1，差唔多同一行（欄）＝ 0
const DEAD = 0.12;
function posSign(F, i, k, size) {
  const dx = (F[k].cx - F[i].cx) / size, dy = (F[k].cy - F[i].cy) / size;
  return [Math.abs(dx) < DEAD ? 0 : Math.sign(dx), Math.abs(dy) < DEAD ? 0 : Math.sign(dy)];
}
function posOk(sx, dB) { // sx：候選字嘅方向；dB：母字嗰兩筆（按揀咗嗰組筆畫大細）
  if (sx === 0) return Math.abs(dB) < 0.25;
  return sx * dB > -0.03;
}
// 形狀分數：只用嚟喺幾隻合規則嘅字入面揀最似（唔用嚟判斷啱唔啱）
function rankScore(bStrokes, xStrokes) {
  const nb = normStrokes(bStrokes);
  let nx = xNormCache.get(xStrokes);
  if (!nx) { nx = normStrokes(xStrokes); xNormCache.set(xStrokes, nx); }
  let total = 0;
  for (let i = 0; i < xStrokes.length; i++) {
    let e = 0;
    for (let k = 0; k < K; k++) e += Math.hypot(nb.pts[i][k][0] - nx.pts[i][k][0], nb.pts[i][k][1] - nx.pts[i][k][1]);
    total += e / K;
  }
  return total / xStrokes.length + Math.abs(Math.log(nb.aspect / nx.aspect)) * 0.03;
}
// 指定對應（母字第 idx[i] 筆 ＝ 候選字第 i 筆）合唔合規則
function ruleCheck(B, X, idx) {
  const BF = feat(B), XF = feat(X), TB = types(B), TX = types(X), CB = crossMatrix(B), CX = crossMatrix(X);
  const n = XF.length;
  if (idx.length !== n) return null;
  for (let i = 0; i < n; i++) if (!typeCompat(TX[i], TB[idx[i]])) return null;
  const xb = bbox(XF), xs = Math.max(xb.w, xb.h, 1);
  const sub = idx.map(j => BF[j]), bb = bbox(sub), bs = Math.max(bb.w, bb.h, 1);
  for (let i = 0; i < n; i++) for (let k = i + 1; k < n; k++) {
    const lx = CX[i][k], lb = CB[idx[i]][idx[k]];
    if (!linkOk(lx, lb)) return null;
    // 掂住或者交叉：位置由掂住嘅地方決定（唔用中心點，因為長短會影響中心點）；分開先比左右上下
    if (lx.k === 'T' || lx.k === 'X' || lb.k === 'T' || lb.k === 'X') continue;
    const [sx, sy] = posSign(XF, i, k, xs);
    if (!posOk(sx, (BF[idx[k]].cx - BF[idx[i]].cx) / bs) || !posOk(sy, (BF[idx[k]].cy - BF[idx[i]].cy) / bs)) return null;
  }
  return rankScore(sub, XF);
}
function findSubsetsRule(B, X, limit = 4000) {
  const BF = feat(B), XF = feat(X), TB = types(B), TX = types(X), CB = crossMatrix(B), CX = crossMatrix(X);
  const n = XF.length, m = BF.length;
  if (n > m) return [];
  const compat = TX.map(tx => TB.map(tb => typeCompat(tx, tb)));
  const xb = bbox(XF), xs = Math.max(xb.w, xb.h, 1);
  const sgn = [];
  for (let i = 0; i < n; i++) { sgn.push([]); for (let k = 0; k < n; k++) sgn[i].push(i < k ? posSign(XF, i, k, xs) : null); }
  const found = [], pick = [];
  let visits = 0;
  (function dfs(i, from) {
    if (++visits > 400000 || found.length >= limit) return;
    if (i === n) {
      const sc = ruleCheck(B, X, pick);
      if (sc !== null) found.push({ idx: pick.slice(), score: sc });
      return;
    }
    for (let j = from; j <= m - (n - i); j++) {
      if (!compat[i][j]) continue;
      let ok = true;
      for (let k = 0; k < i && ok; k++) {
        const lx = CX[k][i], lb = CB[pick[k]][j];
        if (!linkOk(lx, lb)) { ok = false; break; }
        if (lx.k === 'T' || lx.k === 'X' || lb.k === 'T' || lb.k === 'X') continue;
        // 剪枝：方向相反（用成隻母字大細，寬鬆）就唔使再試
        const [sx, sy] = sgn[k][i], dx = BF[j].cx - BF[pick[k]].cx, dy = BF[j].cy - BF[pick[k]].cy;
        if ((sx > 0 && dx < -20) || (sx < 0 && dx > 20) || (sy > 0 && dy < -20) || (sy < 0 && dy > 20)) ok = false;
      }
      if (!ok) continue;
      pick[i] = j;
      dfs(i + 1, j + 1);
    }
  })(0, 0);
  return found;
}

const SCORE_OK = +(process.env.SCORE_OK || 0.19);
const SHAPE_CAP = +(process.env.SHAPE_CAP || 0.4);
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
    add(X, findSubsetsRule(B, X), false);
  }
  // 拆解樹入面嘅部件（例如「湘」入面嘅「木」「目」「相」）
  const comps = [];
  components(B, [...Array(m).keys()], comps);
  // 部件：3 筆以上（例如「湘」入面嘅「木」「目」、「媽」入面嘅「女」）照信；
  // 1–2 筆嘅細部件要合規則（筆畫類型、交叉、位置），例如「慎」入面得一點嘅「乙」唔算
  for (const { c, idx } of comps) {
    if (!isKid(c)) continue;
    if (idx.length >= 3) { add(c, [{ idx, score: 0.02 }], false); continue; }
    const sc = ruleCheck(B, c, idx);
    if (sc !== null) add(c, [{ idx, score: Math.min(sc, 0.02) }], false);
  }
  for (const X of SIMP) {
    const n = nStrokes(X);
    if (n >= m) continue;
    add(X, findSubsetsRule(B, X), true);
  }
  // 同一組筆畫只俾最似嗰隻字（規則已經判斷咗啱唔啱，形狀分數只用嚟揀）
  const answers = new Map(), decoys = new Map();
  for (const [key, list] of bySubset) {
    list.sort((a, b) => a.score - b.score);
    const best = list[0];
    // 規則合晒都要整體形狀唔可以太離譜（例如散到成隻字都係嘅「卞」）
    if (best.score > SHAPE_CAP) continue;
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
if (!TEST && !process.argv.some(a => a.startsWith('--') && a !== '--keep-from')) {
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
  // 舊版有嘅母字（玩家可能玩緊、有紀錄）仲合格就一定保留：--keep 舊levels.js（可以俾幾個）
  const keepSet = new Set();
  for (let a = 0; a < process.argv.length; a++) if (process.argv[a] === '--keep-from') {
    const txt = fs.readFileSync(process.argv[a + 1], 'utf8');
    const old = JSON.parse(txt.slice(txt.indexOf('{'), txt.lastIndexOf('}') + 1));
    old.levels.forEach(l => keepSet.add(l.c));
  }
  const chosen = [];
  for (const [n, q] of Object.entries(QUOTA)) {
    const pool = results.filter(r => r.n === +n && (r.interesting / r.count >= 0.3 || r.interesting >= 4 || keepSet.has(r.B)));
    pool.forEach(r => { r.pick = Math.min(r.interesting, 10) + (grade(r.B) <= 3 ? 3 : grade(r.B) <= 6 ? 1.5 : 0) + (keepSet.has(r.B) ? 100 : 0); });
    pool.sort((x, y) => y.pick - x.pick);
    const kept = pool.filter(r => keepSet.has(r.B)).length;
    chosen.push(...pool.slice(0, Math.max(q, kept)));
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
    // 多過 24 個：保留母字，其他按年級（低年級先）揀，再按筆畫排返
    const g = c => +(U[c].kGradeLevel || 7);
    const keep = ans.length <= 24 ? ans : [...ans.filter(a => a[0] !== B).sort((x, y) => g(x[0]) - g(y[0]) || nStrokes(x[0]) - nStrokes(y[0])).slice(0, 23), ...ans.filter(a => a[0] === B)]
      .sort((a, b) => (a[0] === B) - (b[0] === B) || nStrokes(a[0]) - nStrokes(b[0]) || a[0].localeCompare(b[0]));
    const answers = keep.map(([ch, subs]) => { reads(ch); return [ch, subs.sort((x, y) => x.score - y.score).slice(0, 150).map(x => mask(x.idx))]; });
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
      html += `<div class="c${w.score > 0.28 ? ' bad' : ''}">${svgOf(B, w.idx)} ${full(ch)}<br>${ch} 最差 ${w.score.toFixed(3)} ×${subs.length}</div>`;
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

if (process.argv.includes('--types')) {
  for (const ch of process.argv.slice(process.argv.indexOf('--types') + 1).join('')) {
    if (!G.has(ch)) continue;
    console.log(ch, types(ch).map(t => t.code + '(' + t.pieces.map(p => Math.round(p.a / DEG)).join('/') + ')').join(' '));
  }
}
if (process.argv.includes('--why')) {
  // node build_levels.mjs <dataDir> --why 友 大 0,1,3   → 逐條規則印出嚟
  const i = process.argv.indexOf('--why'); const B = process.argv[i + 1], X = process.argv[i + 2];
  const idx = process.argv[i + 3].split(',').map(Number);
  const BF = feat(B), XF = feat(X), TB = types(B), TX = types(X), CB = crossMatrix(B), CX = crossMatrix(X);
  XF.forEach((_, k) => console.log(`  第${k}筆 ${TX[k].code} ↔ ${B}第${idx[k]}筆 ${TB[idx[k]].code}`, typeCompat(TX[k], TB[idx[k]]) ? 'ok' : '類型唔同'));
  const xb = bbox(XF), xs = Math.max(xb.w, xb.h, 1), bb = bbox(idx.map(j => BF[j])), bs = Math.max(bb.w, bb.h, 1);
  for (let a = 0; a < XF.length; a++) for (let b = a + 1; b < XF.length; b++) {
    const [sx, sy] = posSign(XF, a, b, xs), dx = (BF[idx[b]].cx - BF[idx[a]].cx) / bs, dy = (BF[idx[b]].cy - BF[idx[a]].cy) / bs;
    const fx = q => q ? `${q.k}(${q.pa.toFixed(2)},${q.pb.toFixed(2)})` : '-';
    const touchy = [CX[a][b].k, CB[idx[a]][idx[b]].k].some(k => k === 'T' || k === 'X');
    console.log(`  ${a}-${b} 關係 ${fx(CX[a][b])}↔${fx(CB[idx[a]][idx[b]])} ${linkOk(CX[a][b], CB[idx[a]][idx[b]]) ? 'ok' : '✗'}${touchy ? '（掂住：唔比中心）' : ''}  左右 ${sx}↔${dx.toFixed(2)} ${posOk(sx, dx) ? 'ok' : '✗'}  上下 ${sy}↔${dy.toFixed(2)} ${posOk(sy, dy) ? 'ok' : '✗'}`);
  }
  console.log('  →', ruleCheck(B, X, idx));
}
if (process.argv.includes('--worst')) {
  const i = process.argv.indexOf('--worst'); const B = process.argv[i + 1], X = process.argv[i + 2];
  const res = solveBase(B), subs = (res.answers.get(X) || []).sort((a, b) => b.score - a.score);
  for (const s of subs.slice(0, 2)) { console.log(B, '→', X, s.idx.join(','), s.score.toFixed(3)); process.argv[process.argv.indexOf('--worst')] = '--x'; }
  const s = subs[0]; if (s) { const BF = feat(B); console.log('  types', s.idx.map(j => types(B)[j].code).join(' '), '| X', types(X).map(t => t.code).join(' ')); console.log('  links B', s.idx.map((a, p) => s.idx.slice(p + 1).map(b => crossMatrix(B)[a][b].k).join('')).join(' '), '| X', types(X).map((_, a) => types(X).map((__, b) => b > a ? crossMatrix(X)[a][b].k : '').join('')).join(' ')); }
}
