#!/usr/bin/env node
/**
 * crowd-check.js — 「畫面上的份量只准往上」的自動檢查
 *
 * 曾經把升級做成真的合併（MERGE 隻併成 1 隻），結果兵力 40→420 漲了 10.5 倍，
 * 畫面上的視覺份量反而從 40 掉到 23 —— 升級長得跟踩到 /2 懲罰門一模一樣。
 * 這支工具就是為了不再犯同一個錯：掃過整條兵力曲線，確認份量單調不遞減。
 *
 *   npm i playwright          # 只有這支工具需要，遊戲本身零依賴
 *   node tools/crowd-check.js
 *
 * 直接從 index.html 的 window.__crowd 讀真的函式，所以不需要像 balance-sim
 * 那樣人工同步常數 —— 改了繪製規則，這裡量到的就會跟著變。
 *
 * 視覺份量 = Σ(每隻的尺寸²)，用面積當「這團看起來有多重」的代理量。
 */
'use strict';

const CHROME_CANDIDATES = [
  process.env.CHROME_PATH,
  '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
];

// 真實的關卡兵力曲線（balance-sim 的「完美玩家」報表），外加開局與深關
const CURVE = [
  ['開局', 40], ['lv1', 170], ['lv2', 420], ['lv3', 665], ['lv4', 1806],
  ['lv5', 2774], ['lv6', 3875], ['lv7', 8384], ['lv8', 12245],
  ['lv9', 19600], ['lv10', 31400], ['lv11', 50200], ['lv12', 80300],
];

async function main() {
  let chromium;
  try { ({ chromium } = require('playwright')); }
  catch { console.error('需要 playwright：npm i playwright'); process.exit(1); }

  const path = require('path');
  const url = 'file://' + path.resolve(__dirname, '..', 'index.html') + '?debug=1';
  const executablePath = CHROME_CANDIDATES.find(p => p && require('fs').existsSync(p));
  const browser = await chromium.launch(executablePath ? { executablePath } : {});
  const page = await browser.newPage();
  await page.goto(url, { waitUntil: 'networkidle' });

  // 在頁面裡算，用的是遊戲本人的函式
  const rows = await page.evaluate((curve) => {
    const C = window.__crowd;
    // 比照 drawArmy：人群吃 FORM 的槽位，融合兵是額外加上去的前排
    function shot(power) {
      const n = C.unitsFor(power);
      const shrink = 1 / (1 + C.CROWD.shrink * Math.log10(Math.max(1, n / 130)));
      const cum = C.tierMix(power).slice();
      const byTier = [0, 0, 0, 0];
      let mass = 0;
      for (let i = 0; i < n; i++) {
        const t = C.mixTier(cum, C.hash01(i + 1));
        const s = shrink * C.TIER_SCALE[t];
        byTier[t]++;
        mass += s * s;
      }
      const champs = C.champCount(power), champT = C.tierFor(power);
      const cs = shrink * C.TIER_SCALE[champT] * C.CHAMP_SCALE;
      mass += champs * cs * cs;
      return { n, champs, mass, byTier, top: C.TIER_NAME[C.tierFor(power)] };
    }
    const out = { rows: [], scan: null };
    for (const [tag, a] of curve) out.rows.push([tag, a, shot(a)]);

    // 密掃：整條曲線上每一點的份量都不准比前一點低
    let prev = -1, drops = 0, worst = null;
    for (let p = 1; p <= 120000; p = Math.ceil(p * 1.01) ) {
      const m = shot(p).mass;
      if (prev >= 0 && m < prev - 1e-9) {
        drops++;
        const d = (prev - m) / prev;
        if (!worst || d > worst.d) worst = { p, d, from: prev, to: m };
      }
      prev = m;
    }
    out.scan = { drops, worst };
    return out;
  }, CURVE);

  console.log('人群視覺份量檢查  (index.html)');
  console.log('視覺份量 = Σ(每隻尺寸²)。兵力變多時它只准往上。\n');
  console.log('關卡    兵力     隻數  融合兵  主力    視覺份量   對開局');
  console.log('─'.repeat(66));
  const base = rows.rows[0][2].mass;
  for (const [tag, a, s] of rows.rows) {
    console.log(
      `${tag.padEnd(6)}${String(a).padStart(7)}  ${String(s.n).padStart(5)}  ` +
      `${String(s.champs).padStart(5)}   ${s.top.padEnd(4)}  ` +
      `${s.mass.toFixed(0).padStart(8)}   ${'×' + (s.mass / base).toFixed(1)}`);
  }

  const { drops, worst } = rows.scan;
  console.log('');
  if (drops === 0) {
    console.log('✓ 密掃 1..120000：份量全程單調不遞減');
  } else {
    console.log(`✗ 密掃 1..120000：有 ${drops} 個點份量倒退`);
    if (worst) console.log(`  最嚴重：兵力 ${worst.p} 份量 ${worst.from.toFixed(1)} → ` +
      `${worst.to.toFixed(1)}（掉 ${(worst.d * 100).toFixed(1)}%）`);
  }
  await browser.close();
  process.exit(drops === 0 ? 0 : 1);
}

main().catch(e => { console.error(e); process.exit(1); });
