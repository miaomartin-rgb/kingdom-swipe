# 協作規則

## 每次改動必附 summary
任何一次升級 / 改動，回覆開頭必須有簡短 summary，純文字，不用程式碼區塊、
不用表格、不用標題。三行以內講完：改了什麼、動到哪些檔案、怎麼驗證。
不列未做的事、不寫背景鋪陳。

## 改動規模分流
- 小（單一參數、文案、樣式）→ 直接做
- 中（新增欄位、少量批次）→ 一兩句確認範圍
- 大（新流程、跨檔案、大量批次）→ 先給 3–5 點計畫，同意才動工

## 數值改動的驗證方式
改任何影響平衡的數字後，必須跑：

```
node tools/balance-sim.js
```

並在 summary 裡貼出前後對照。不要只靠手感描述。

## 專案現況
- `index.html` — 遊戲本體，單檔，尚未重構。數值集中在 `BAL`、`SIEGE`、`CROWD`、
  `UPGRADES` 幾個常數區塊
- **鐵則：畫面上的份量只准往上。** 曾經把升級做成真的合併（隻數縮減），
  結果兵力漲 10 倍畫面反而空掉 43% —— 這個類型用「加人／減人」當獎懲語彙，
  我們自己也有 `-N` 與 `/2` 懲罰門，升級長得跟受罰一樣就毀了。
  現在隻數 `unitsFor()` 單調成長到 `CROWD.max` 飽和，之後由 `tierMix()`
  的階級混編接手，前排再加 `champCount()` 隻放大的融合兵。
  動到 `CROWD.max` / `TIER_SCALE` / `UNITS_EXP` / `TIER_STEP` 任何一個，
  都要跑 `node tools/crowd-check.js`
- `manifest.webmanifest` — PWA 設定
- 除錯：網址加 `?debug=1` 才會掛上 `window.__game` 與 `window.__analytics`，
  所有測試腳本都要帶這個參數
- `docs/architecture-review.html` — 架構檢視與升級建議（2026-08-10）
- `tools/balance-sim.js` — 閘門／雜兵團／王戰模擬器，固定種子 20260810。
  裡面的 `BAL` 必須與 index.html 同步
- `tools/siege-sweep.js` — 巨人召集「組裝 vs 防守」取捨量測（需 `npm i playwright`）
- `tools/squad-sweep.js` — 雜兵團射擊戰量測。它的輸出要回填給 balance-sim 的
  squadBase / squadLvStep / squadMissMul
- `tools/crowd-check.js` — 人群視覺份量的單調性檢查，不過就 exit 1。
  它直接讀 index.html 的 `window.__crowd`，不需要人工同步常數
- 算圖解析度上限是 `DPR_CAP`（目前 1.5）。人群變重之後這是最有效的一根桿子：
  2x 節流下 DPR 2 只有 21fps，1.5 有 34fps，畫面幾乎看不出差別
