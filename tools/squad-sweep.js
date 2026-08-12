#!/usr/bin/env node
/**
 * squad-sweep.js — 雜兵團射擊戰平衡量測
 *
 * 雜兵團改成射擊戰之後，損耗取決於「射程內來不來得及清完」與「有沒有對準」，
 * 這是位置相依的，balance-sim.js 那種純數學模擬算不出來。所以直接開真的
 * index.html 量，再把量到的平均損耗回填給 balance-sim 當常數。
 *
 *   npm i playwright
 *   node tools/squad-sweep.js
 *
 * 要看的三件事：
 *   1. 有瞄準 vs 沒瞄準的漏怪數要拉得開 —— 否則站位沒有意義
 *   2. 兵力越多損耗比例要越低，但不能歸零 —— 否則成本會被成長稀釋
 *   3. 關卡越高（速度越快、敵人越多）同條件要越差
 */
'use strict';

const CASES = [
  // [兵力, 關卡]
  [150, 1], [400, 1], [1500, 4], [3300, 6],
];
const RUNS = 3;   // 每種條件跑幾次取平均，敵人位置是隨機的

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

  console.log('雜兵團射擊戰平衡量測  (index.html)');
  console.log('兵力    關卡  瞄準   敵人數   漏過   兵力損耗');
  console.log('─'.repeat(56));

  for (const [army0, lv] of CASES) {
    for (const aim of [0, 1]) {
      const acc = { n: 0, leaked: 0, loss: 0, runs: 0 };
      for (let r = 0; r < RUNS; r++) {
        const page = await ctx.newPage();
        await page.goto(url, { waitUntil: 'networkidle' });
        await page.evaluate((lv) => localStorage.setItem('kingdom.v1', JSON.stringify(
          { best: 1, maxLevel: lv, muted: true, runs: 1, gold: 0, up: {}, rankF: 0, giant: null })), lv);
        await page.reload({ waitUntil: 'networkidle' });
        await page.click('#startBtn');

        const out = await page.evaluate(({ army0, aim }) => new Promise(res => {
          const G = window.__game;
          const q = G.objs.find(o => o.type === 'squad');
          if (!q) return res(null);
          for (const o of G.objs) {
            if (o.type === 'gate') o.used = true;
            if (o.type === 'siege') o.done = true;
            if (o.type === 'squad' && o !== q) o.dead = true;
          }
          G.boss.dead = true;
          G.army = army0; G.z = q.z - 27; G.x = 0; G.targetX = 0;

          // 會瞄準的玩家：掃過所有落點，挑「火力覆蓋內、且最急」的位置站
          const ai = setInterval(() => {
            if (!aim || !q.armed || q.dead) return;
            const live = q.foes.filter(f => f.z - G.z < 26);
            if (!live.length) return;
            let bestX = G.x, bestScore = -1;
            for (let x = -4.5; x <= 4.5; x += 0.3) {
              let sc = 0;
              for (const f of live) {
                if (Math.abs(f.x - x) < 1.5) sc += 1 / Math.max(1, f.z - G.z);  // 越近越急
              }
              if (sc > bestScore) { bestScore = sc; bestX = x; }
            }
            G.targetX = bestX;
          }, 60);

          const iv = setInterval(() => {
            if (q.dead) {
              clearInterval(iv); clearInterval(ai);
              res({ n: q.n, leaked: q.leaked, army: G.army });
            }
          }, 60);
          setTimeout(() => { clearInterval(iv); clearInterval(ai); res(null); }, 20000);
        }), { army0, aim });

        await page.close();
        if (!out) continue;
        acc.n += out.n; acc.leaked += out.leaked;
        acc.loss += (army0 - out.army) / army0 * 100;
        acc.runs++;
      }
      if (!acc.runs) { console.log(`${army0} lv${lv}: TIMEOUT`); continue; }
      const f = x => (x / acc.runs);
      console.log(
        `${String(army0).padStart(5)}   lv${lv}   ${aim ? '有' : '無'}   ` +
        `${String(f(acc.n).toFixed(1)).padStart(6)}   ${String(f(acc.leaked).toFixed(1)).padStart(5)}   ` +
        `${f(acc.loss).toFixed(1)}%`);
    }
  }
  await browser.close();
}

main().catch(e => { console.error(e); process.exit(1); });
