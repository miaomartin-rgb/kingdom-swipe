#!/usr/bin/env node
/**
 * balance-sim.js — 王國遠征 數值模擬器
 *
 * 忠實移植 index.html 的關卡生成與戰鬥結算邏輯，讓數值可以在沒有瀏覽器的情況下驗證。
 * docs/architecture-review.html 裡的每一張表都由這支腳本產生。
 *
 *   node tools/balance-sim.js
 *
 * 移植對應（如果 index.html 改了，這裡要跟著改）：
 *   makeOp        <- index.html:141
 *   makeGate      <- index.html:152
 *   makeSquad     <- index.html:159
 *   buildLevel    <- index.html:164
 *   startLevel    <- index.html:186   （過關繼承 carry*0.45）
 *   雜兵團結算     <- index.html:630
 *   王戰結算       <- index.html:648
 */
'use strict';

const DT = 1 / 60;

/* ---------- 帶種子的 PRNG ----------
 * index.html 用的是 Math.random()，所以結果無法重現。這裡改用 mulberry32，
 * 讓報告裡的每個數字都能被重跑驗證 —— 這也正是 §4 建議遊戲本體要做的改動。
 */
let _s = 0x9e3779b9;
function seed(n) { _s = n >>> 0; }
function random() {
  _s = (_s + 0x6d2b79f5) >>> 0;
  let t = _s;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

/* ---------- 移植自 index.html 的生成邏輯 ---------- */
const rnd = (a, b) => a + random() * (b - a);
const ri  = (a, b) => Math.floor(rnd(a, b + 1));

function makeOp(good, lv) {
  if (good) {
    return random() < 0.45
      ? { op: 'x', val: random() < 0.8 ? 2 : 3 }
      : { op: '+', val: ri(12, 18 + lv * 6) };
  }
  return random() < 0.45
    ? { op: '/', val: 2 }
    : { op: '-', val: ri(8, 12 + lv * 4) };
}

function makeGate(lv) {
  const bothGood = random() >= 0.72;
  return bothGood
    ? { left: makeOp(true, lv), right: makeOp(true, lv), bothGood: true }
    : { left: makeOp(true, lv), right: makeOp(false, lv), bothGood: false };
}

function applyOp(army, o) {
  if (o.op === '+') return army + o.val;
  if (o.op === '-') return army - o.val;
  if (o.op === 'x') return Math.floor(army * o.val);
  return Math.floor(army / o.val);
}

function squadCount(lv, i) {
  return Math.max(6, Math.round((10 + i * 8) * (1 + 0.38 * (lv - 1)) * rnd(0.85, 1.15)));
}

const stagesFor = lv => 5 + Math.min(4, lv - 1);
const bossBaseHp = lv => Math.round(300 * Math.pow(lv, 1.25));

/* ---------- 結算 ---------- */

/** 雜兵團：雙方扣掉「相同的絕對值」— 清場成本恆等於敵軍人數，與己方兵力無關。 */
function resolveSquad(army, count) {
  const start = count;
  let t = 0;
  while (count > 0 && army > 0 && t < 120) {
    const rate = Math.min(Math.max(22, (army + count) * 0.85), start / 0.6);
    const d = rate * DT;
    army -= d; count -= d; t += DT;
  }
  return { army: Math.max(0, army), seconds: t };
}

/** 王戰：注意 b.max 被重設為 army*12 — 這條回授邊讓兵力優勢失效。 */
function resolveBoss(army, lv) {
  const max = Math.max(bossBaseHp(lv), Math.round(army * 12));
  const dps = 0.20 + lv * 0.006;
  let hp = max, t = 0;
  while (hp > 0 && army > 0 && t < 120) {
    hp   -= army * 6 * DT;
    army -= (army * dps + 2) * DT;
    t += DT;
  }
  return { win: hp <= 0, army: Math.max(0, army), seconds: t, bossHp: max };
}

/** 完美玩家跑完一關（每個閘門都選期望值較高的一側）。 */
function runLevel(lv, army) {
  const stages = stagesFor(lv);
  for (let i = 0; i < stages; i++) {
    const g = makeGate(lv);
    army = Math.max(0, Math.max(applyOp(army, g.left), applyOp(army, g.right)));
    if (i % 2 === 1 || i === stages - 1) {
      army = resolveSquad(army, squadCount(lv, i)).army;
    }
    if (army <= 0) return 0;
  }
  return army;
}

/* ---------- 報表 ---------- */
const pad  = (s, n) => String(s).padStart(n);
const fmt  = n => Math.round(n).toLocaleString('en-US');
const rule = n => console.log('─'.repeat(n));

function reportBossIsArmyProof() {
  console.log('\n【1】王戰：兵力多寡對結果幾乎沒有影響');
  rule(76);
  console.log('關卡  進場兵力      Boss HP    時長     結果   存活率');
  rule(76);
  for (const [lv, armies] of [[1, [30, 20000]], [5, [60, 120, 400, 2000, 20000]]]) {
    for (const a of armies) {
      const r = resolveBoss(a, lv);
      console.log(
        `${pad(lv, 3)}  ${pad(fmt(a), 10)}  ${pad(fmt(r.bossHp), 11)}  ` +
        `${pad(r.seconds.toFixed(2) + 's', 7)}  ${r.win ? ' 勝 ' : ' 敗 '}  ` +
        `${pad((r.army / a * 100).toFixed(1) + '%', 7)}`);
    }
  }
  console.log('\n→ 第 5 關帶 400 人與帶 20,000 人：時長差 0.04 秒、存活率差 1.4 個百分點。');
}

function reportEconomyDiverges(runs = 300) {
  console.log('\n【2】完美玩家的兵力曲線：指數收入 vs 線性成本');
  rule(76);
  console.log('關卡   抵達 Boss 兵力(中位)   雜兵團損耗佔比   相對渲染上限(130)');
  rule(76);
  let prev = 0;
  for (let lv = 1; lv <= 8; lv++) {
    const out = [];
    for (let k = 0; k < runs; k++) {
      // index.html:188 — 過關繼承 max(35, carry*0.45)
      const start = lv === 1 ? 35 : Math.max(35, Math.round(prev * 0.45));
      out.push(runLevel(lv, start));
    }
    out.sort((a, b) => a - b);
    const med = out[Math.floor(runs / 2)];
    prev = med;

    let squadTotal = 0;
    const stages = stagesFor(lv);
    for (let i = 0; i < stages; i++) {
      if (i % 2 === 1 || i === stages - 1) squadTotal += Math.round((10 + i * 8) * (1 + 0.38 * (lv - 1)));
    }
    console.log(
      `${pad(lv, 3)}   ${pad(fmt(med), 18)}   ${pad((squadTotal / med * 100).toFixed(3) + '%', 13)}   ` +
      `${pad(fmt(med / 130) + 'x', 16)}`);
  }
  console.log('\n→ 第 6 關起，遊戲裡所有威脅加總不到兵力的萬分之一。');
}

function reportGateChoicesAreFake(samples = 20000) {
  console.log('\n【3】閘門：有多少比例真的在問玩家問題？');
  rule(76);
  let obvious = 0, wide = 0, close = 0;
  for (let k = 0; k < samples; k++) {
    const lv = 1 + Math.floor(random() * 5);
    const g = makeGate(lv);
    if (!g.bothGood) { obvious++; continue; }
    const army = 200;
    const a = applyOp(army, g.left), b = applyOp(army, g.right);
    if (Math.abs(a - b) < 0.1 * Math.max(a, b)) close++; else wide++;
  }
  const pct = n => (n / samples * 100).toFixed(1) + '%';
  console.log(`一好一壞（顏色即答案，零計算）    ${pad(pct(obvious), 8)}`);
  console.log(`兩個都好，差距 > 10%（掃一眼）    ${pad(pct(wide), 8)}`);
  console.log(`兩個都好，差距 < 10%（真兩難）    ${pad(pct(close), 8)}`);
  console.log(`\n→ 核心互動只有 ${pct(close)} 構成實質決策，其餘 ${pct(obvious + wide)} 不需要思考。`);
}

if (require.main === module) {
  const SEED = Number(process.argv[2]) || 20260810;
  console.log(`王國遠征 · 數值模擬（移植自 index.html @ 1119df9 · seed=${SEED}）`);
  seed(SEED); reportBossIsArmyProof();
  seed(SEED); reportEconomyDiverges();
  seed(SEED); reportGateChoicesAreFake();
  console.log('');
}

module.exports = {
  seed, random, makeOp, makeGate, applyOp,
  resolveSquad, resolveBoss, runLevel, bossBaseHp, stagesFor,
};
