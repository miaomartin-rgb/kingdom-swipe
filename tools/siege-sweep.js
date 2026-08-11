#!/usr/bin/env node
/**
 * siege-sweep.js — 巨人召集（插曲）平衡量測
 *
 * 直接開真的 index.html 跑，不重寫一份邏輯，所以量到的就是玩家會遇到的。
 * 用法：
 *   npm i playwright          # 只有這支工具需要，遊戲本身零依賴
 *   node tools/siege-sweep.js
 *
 * 每一列跑一場，控制「進場兵力 / 關卡 / 有沒有走位」三個變因。
 * 要看的三件事：
 *   1. 同一列的「有走位 vs 無走位」要拉得開 —— 否則站位沒有意義
 *   2. 固定走位條件下，兵力越多組裝度要越高 —— 否則累積兵力沒有意義
 *   3. 關卡越高同條件要越差 —— 否則沒有難度曲線
 * 這一段不扣兵力，所以看的是組裝完成度與巨人威力，不是兵力增減。
 */
'use strict';

// 巨人召集只出現在 BAL.siegeEvery 的倍數關，所以測試關卡必須是 5 的倍數
const CASES = [
  // [進場兵力, 關卡]
  [600, 5], [2260, 5], [8000, 10], [24000, 10],
];

const CHROME_CANDIDATES = [
  process.env.CHROME_PATH,
  '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
];

async function main() {
  let chromium;
  try { ({ chromium } = require('playwright')); }
  catch { console.error('需要 playwright：npm i playwright'); process.exit(1); }

  const path = require('path');
  const url = 'file://' + path.resolve(__dirname, '..', 'index.html') + '?debug=1';
  const executablePath = CHROME_CANDIDATES.find(p => p && require('fs').existsSync(p));

  const browser = await chromium.launch(executablePath ? { executablePath } : {});
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });

  console.log('巨人召集平衡量測  (index.html)');
  console.log('兵力    關卡  走位   耗時    擊殺/配額  漏過   組裝度   巨人威力');
  console.log('─'.repeat(72));

  for (const [army0, lv] of CASES) {
    for (const dodge of [0, 1]) {
      const page = await ctx.newPage();
      await page.goto(url, { waitUntil: 'networkidle' });
      // 讓遊戲直接從測試關卡開始，那一關才會有巨人召集
      await page.evaluate((lv) => localStorage.setItem('kingdom.v1', JSON.stringify(
        { best: 1, maxLevel: lv, muted: true, runs: 1, gold: 0, up: {}, rankF: 0, giant: null })), lv);
      await page.reload({ waitUntil: 'networkidle' });
      await page.click('#startBtn');

      const r = await page.evaluate(({ army0, lv, dodge }) => new Promise(res => {
        const G = window.__game;
        const sg = G.objs.find(o => o.type === 'siege');
        if (!sg) return res(null);
        // 直接把場景擺到防守戰前一刻，跳過閘門與雜兵團的隨機性
        G.level = lv; G.army = army0; G.z = sg.z - 3.1; G.x = 0; G.targetX = 0;
        for (const o of G.objs) { if (o.type === 'gate') o.used = true; if (o.type === 'squad') o.dead = true; }

        // 會走位的玩家：把火力對準射程內人最多的那一排
        // 站到哪就打到哪：移過去攔住人最多的那一排
        const ai = setInterval(() => {
          if (!G.siege) return;
          if (!dodge) { G.targetX = -1.6; return; }   // 不走位＝停在原地
          let best = -1, bx = -1.6;
          for (const L of [1.0, 2.3, 3.6]) {
            const n = G.siege.foes.filter(f => Math.abs(f.x - L) < 1.3 && f.z - G.z < 25).length;
            if (n > best) { best = n; bx = L; }
          }
          G.targetX = bx;
        }, 60);

        let last = null;
        const iv = setInterval(() => {
          const s = G.siege;
          if (s) { last = { t: s.t, killed: s.killed, quota: s.quota, leaked: s.leaked }; return; }
          if (last && last.t > 0.5) {
            clearInterval(iv); clearInterval(ai);
            res({ ...last, giant: G.giant ? +G.giant.power.toFixed(2) : 0 });
          }
        }, 80);
        setTimeout(() => { clearInterval(iv); clearInterval(ai); res(null); }, 30000);
      }), { army0, lv, dodge });

      if (!r) { console.log(`${army0} lv${lv}: TIMEOUT`); await page.close(); continue; }
      const built = Math.round(Math.min(1, r.killed / r.quota) * 100);
      console.log(
        `${String(army0).padStart(5)}   lv${lv}   ${dodge ? '有' : '無'}   ` +
        `${String(r.t.toFixed(1) + 's').padStart(6)}   ${String(Math.round(r.killed) + '/' + r.quota).padStart(8)}  ` +
        `${String(r.leaked).padStart(4)}   ${String(built + '%').padStart(6)}   ` +
        `${r.giant ? '×' + (1 + 0.35 * r.giant).toFixed(2) + ' 王戰' : '未召出'}`);
      await page.close();
    }
  }
  await browser.close();
}

main().catch(e => { console.error(e); process.exit(1); });
