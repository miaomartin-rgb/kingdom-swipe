#!/usr/bin/env node
/**
 * balance-sim.js — 王國遠征 數值模擬器
 *
 * 忠實移植 index.html 的關卡生成與戰鬥結算邏輯，讓數值可以在沒有瀏覽器的情況下驗證。
 *
 *   node tools/balance-sim.js [seed]
 *
 * ⚠ 這裡的 BAL 必須跟 index.html 的 BAL 常數區塊逐項一致。改了那邊就要改這邊。
 *
 * 移植對應：
 *   BAL / makeOp / makeGate / makeSquad  <- index.html 「經濟數值」與「關卡生成」
 *   startLevel 的過關繼承                <- index.html startLevel()
 *   雜兵團按比例損耗                      <- index.html update() 戰鬥結算
 *   王戰                                 <- index.html update() 王戰
 *
 * 城牆防守（插曲）不在這裡模擬 —— 它牽涉走位，用 tools/siege-sweep.js
 * 直接跑真的 index.html 量測。
 */
'use strict';

const DT = 1 / 60;

/* ---------- 帶種子的 PRNG（index.html 用 Math.random，這裡要可重現） ---------- */
let _s = 0x9e3779b9;
function seed(n) { _s = n >>> 0; }
function random() {
  _s = (_s + 0x6d2b79f5) >>> 0;
  let t = _s;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
const rnd = (a, b) => a + random() * (b - a);

/* ---------- 與 index.html 同步的常數 ---------- */
const BAL = {
  ref: lv => Math.round(40 * Math.pow(1.5, lv - 1)),
  carryBonus: 0.25,
  carryCapMul: 0.60,
  bothGood: 0.78,
  mulMax: lv => 1 + Math.floor((lv - 1) / 3),
  mulVal: 2,
  addLo: 0.40, addHi: 0.78,
  pctLo: 18, pctHi: 35,
  divChance: 0.35,
  divVal: 2,
  subLo: 0.25, subHi: 0.45,
  // 雜兵團改成射擊戰後，損耗是位置相依的，這裡不能再用公式硬算。
  // 下面兩個係數是 tools/squad-sweep.js 實測回填的：
  //   有瞄準  lv1 10.0% / lv6 14.6%
  //   沒瞄準  lv1 13.1% / lv6 17.6%
  squadBase: 0.095, squadLvStep: 0.010, squadMissMul: 1.28,
  expectTable: [110, 278, 421, 1163, 1712, 2501, 5769, 9015],
  expect: lv => lv <= BAL.expectTable.length
            ? BAL.expectTable[lv-1]
            : Math.round(BAL.expectTable[BAL.expectTable.length-1] *
                         Math.pow(1.6, lv - BAL.expectTable.length)),
  bossSecs   : 3.5,
  bossDmgC: 0.8,
  bossDmgExp: 0.85,
};
BAL.bossHp = lv => Math.round(BAL.bossDmgC * Math.pow(BAL.expect(lv), BAL.bossDmgExp) * BAL.bossSecs);

/* ---------- 生成 ---------- */
function addOp(lv) {
  return { op: '+', val: Math.max(4, Math.round(BAL.ref(lv) * rnd(BAL.addLo, BAL.addHi))) };
}
function pctOp() { return { op: '%', val: Math.round(rnd(BAL.pctLo, BAL.pctHi)) }; }
function badOp(lv) {
  if (random() < BAL.divChance) return { op: '/', val: BAL.divVal };
  return { op: '-', val: Math.max(3, Math.round(BAL.ref(lv) * rnd(BAL.subLo, BAL.subHi))) };
}
function makeGate(lv, budget) {
  const canMul = budget.mul > 0;
  const bothGood = random() < BAL.bothGood;
  let a, b;
  if (bothGood) {
    if (canMul && random() < 0.45) { budget.mul--; a = { op: 'x', val: BAL.mulVal }; }
    else a = pctOp();
    b = addOp(lv);
  } else {
    if (canMul && random() < 0.35) { budget.mul--; a = { op: 'x', val: BAL.mulVal }; }
    else a = addOp(lv);
    b = badOp(lv);
  }
  return { left: a, right: b, bothGood };
}
function applyOp(army, o) {
  if (o.op === '+') return army + o.val;
  if (o.op === '%') return army + Math.floor(army * o.val / 100);
  if (o.op === '-') return army - o.val;
  if (o.op === 'x') return Math.floor(army * o.val);
  return Math.floor(army / o.val);
}
// skill 1 = 每次都對準，0 = 從不移動
function squadFrac(lv, skill) {
  const aimed = BAL.squadBase + BAL.squadLvStep * (lv - 1);
  const miss = aimed * BAL.squadMissMul;
  return (aimed + (miss - aimed) * (1 - skill)) * rnd(0.88, 1.12);
}
const stagesFor = lv => 5 + Math.min(4, lv - 1);

/* ---------- 結算 ---------- */
/** 雜兵團：直接扣掉當前兵力的一個比例，成本永遠存在。 */
function resolveSquad(army, frac) {
  return Math.max(0, army - army * frac);
}
/** 王戰：血量只由關卡決定；傷害對兵力次線性。 */
function resolveBoss(army, lv) {
  const max = BAL.bossHp(lv);
  const dps = 0.20 + lv * 0.006;
  let hp = max, t = 0;
  while (hp > 0 && army > 0 && t < 120) {
    hp -= Math.pow(Math.max(0, army), BAL.bossDmgExp) * BAL.bossDmgC * DT;
    army -= (army * dps + 2) * DT;
    t += DT;
  }
  return { win: hp <= 0, army: Math.max(0, army), seconds: t, bossHp: max };
}

/**
 * 跑完一關的閘門與雜兵團（不含城牆防守）。
 * skill = 1 每道門都選最優；0 完全隨機；中間值代表偶爾選錯。
 */
function runLevel(lv, army, skill) {
  if (skill === undefined) skill = 1;
  const stages = stagesFor(lv);
  const budget = { mul: BAL.mulMax(lv) };
  let drain = 0;
  for (let i = 0; i < stages; i++) {
    const g = makeGate(lv, budget);
    const ra = applyOp(army, g.left), rb = applyOp(army, g.right);
    const pickBest = random() < skill;
    army = Math.max(0, pickBest ? Math.max(ra, rb)
                                : (random() < 0.5 ? ra : rb));
    if (i % 2 === 1 || i === stages - 1) {
      const before = army;
      army = resolveSquad(army, squadFrac(lv, skill));
      drain += before - army;
    }
    if (army <= 0) return { army: 0, drain };
  }
  return { army, drain };
}

/* ---------- 報表 ---------- */
const pad = (s, n) => String(s).padStart(n);
const fmt = n => Math.round(n).toLocaleString('en-US');
const rule = n => console.log('─'.repeat(n));

function reportBoss() {
  console.log('\n【1】王戰：兵力現在真的有差嗎？');
  rule(72);
  console.log('關卡  進場兵力   Boss HP   時長     結果   存活率');
  rule(72);
  for (const [lv, armies] of [[1, [40, 80, 160, 400]], [5, [200, 400, 800, 2000]]]) {
    for (const a of armies) {
      const r = resolveBoss(a, lv);
      console.log(`${pad(lv, 3)}  ${pad(fmt(a), 9)}  ${pad(fmt(r.bossHp), 8)}  ` +
        `${pad(r.seconds.toFixed(2) + 's', 7)}  ${r.win ? ' 勝 ' : ' 敗 '}  ` +
        `${pad((r.army / a * 100).toFixed(1) + '%', 7)}`);
    }
  }
}

function reportCurve(runs = 300) {
  console.log('\n【2】完美玩家的兵力曲線');
  rule(78);
  console.log('關卡   起始    抵達 Boss    雜兵團損耗   王戰結果');
  rule(78);
  let prev = 0;
  for (let lv = 1; lv <= 8; lv++) {
    const ends = [], drains = [];
    let start = 0;
    for (let k = 0; k < runs; k++) {
      start = BAL.ref(lv) + (prev
        ? Math.min(Math.round(prev * BAL.carryBonus), Math.round(BAL.carryCapMul * BAL.ref(lv)))
        : 0);
      const r = runLevel(lv, start);
      ends.push(r.army); drains.push(r.drain);
    }
    ends.sort((a, b) => a - b); drains.sort((a, b) => a - b);
    const med = ends[Math.floor(runs / 2)];
    const drn = drains[Math.floor(runs / 2)];
    prev = med;
    const boss = resolveBoss(med, lv);
    console.log(`${pad(lv, 3)}   ${pad(fmt(start), 6)}  ${pad(fmt(med), 10)}   ` +
      `${pad(fmt(drn) + ' (' + (drn / (med + drn) * 100).toFixed(0) + '%)', 12)}   ` +
      `${boss.win ? '勝 ' + boss.seconds.toFixed(1) + 's 剩 ' + fmt(boss.army)
                  : '敗 (HP ' + fmt(boss.bossHp) + ')'}`);
  }
}

function reportGates(samples = 20000) {
  console.log('\n【3】閘門：有多少比例真的在問玩家問題？');
  rule(78);
  let obvious = 0, wide = 0, close = 0;
  for (let k = 0; k < samples; k++) {
    const lv = 1 + Math.floor(random() * 5);
    // 用該關中段的典型兵力來評估，而不是 ref 本身
    const army = Math.round(BAL.ref(lv) * 3);
    const g = makeGate(lv, { mul: 1 });
    if (!g.bothGood) { obvious++; continue; }
    const a = applyOp(army, g.left), b = applyOp(army, g.right);
    if (Math.abs(a - b) < 0.15 * Math.max(a, b)) close++; else wide++;
  }
  const pct = n => (n / samples * 100).toFixed(1) + '%';
  console.log(`一好一壞（顏色即答案，零計算）    ${pad(pct(obvious), 8)}`);
  console.log(`兩個都好，差距 > 15%（掃一眼）    ${pad(pct(wide), 8)}`);
  console.log(`兩個都好，差距 < 15%（真兩難）    ${pad(pct(close), 8)}`);
  console.log(`\n→ 實質決策（兩邊都好）共 ${pct(wide + close)}，其中 ${pct(close)} 勢均力敵。`);
}

function reportSkill(runs = 400) {
  console.log('\n【4】玩得好 vs 玩得爛：結局會不一樣嗎？');
  rule(78);
  console.log('關卡   每門都選對    八成選對     隨機亂選     (中位兵力 / 過關率)');
  rule(78);
  const prev = { 1: 0, 0.8: 0, 0.5: 0 };
  for (let lv = 1; lv <= 6; lv++) {
    const cells = [];
    for (const skill of [1, 0.8, 0.5]) {
      const ends = []; let wins = 0;
      for (let k = 0; k < runs; k++) {
        const start = BAL.ref(lv) + (prev[skill]
          ? Math.min(Math.round(prev[skill] * BAL.carryBonus), Math.round(BAL.carryCapMul * BAL.ref(lv)))
          : 0);
        const r = runLevel(lv, start, skill);
        ends.push(r.army);
        if (r.army > 0 && resolveBoss(r.army, lv).win) wins++;
      }
      ends.sort((a, b) => a - b);
      const med = ends[Math.floor(runs / 2)];
      prev[skill] = med;
      cells.push(pad(fmt(med) + ' / ' + Math.round(wins / runs * 100) + '%', 12));
    }
    console.log(`${pad(lv, 3)}   ${cells.join('  ')}`);
  }
}

if (require.main === module) {
  const SEED = Number(process.argv[2]) || 20260810;
  console.log(`王國遠征 · 數值模擬（seed=${SEED}）`);
  seed(SEED); reportBoss();
  seed(SEED); reportCurve();
  seed(SEED); reportGates();
  seed(SEED); reportSkill();
  console.log('');
}

module.exports = { BAL, seed, random, addOp, badOp, makeGate, applyOp, resolveSquad, resolveBoss, runLevel, stagesFor };
