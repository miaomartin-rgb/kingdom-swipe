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
- `manifest.webmanifest` — PWA 設定
- 除錯：網址加 `?debug=1` 才會掛上 `window.__game` 與 `window.__analytics`，
  所有測試腳本都要帶這個參數
- `docs/architecture-review.html` — 架構檢視與升級建議（2026-08-10）
- `tools/balance-sim.js` — 閘門／雜兵團／王戰模擬器，固定種子 20260810。
  裡面的 `BAL` 必須與 index.html 同步
- `tools/siege-sweep.js` — 巨人召集平衡量測，直接跑真的 index.html（需 `npm i playwright`）
