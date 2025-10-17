## `app.js` 與產品藍圖比對分析

### 數據儲存

*   **藍圖要求**: 「所有資料僅存於使用者裝置的 `localStorage`」。
*   **`app.js` 現況**: 
    *   `STORAGE_KEY = 'lunchvote-plus';` 定義了 localStorage 的鍵名。
    *   `loadState()` 函式從 `localStorage` 讀取資料。
    *   `persistState()` 函式將 `state` 物件存入 `localStorage`。
    *   **結論**: `app.js` 的數據儲存機制與藍圖的「去中心化」原則完全一致，資料確實僅存於 `localStorage`。

### 資料初始化

*   **藍圖要求**: 未明確說明初始資料來源，但暗示了「點餐負責人」首次進入 `admin.html` 時會引導完成名單匯入、餐廳與菜單資料庫建立。
*   **`app.js` 現況**: 
    *   `DEFAULT_STATE` 定義了初始的空狀態，包括 `restaurants: []`, `menus: {}`, `names: []`。
    *   `initializeData()` 函式會檢查 `state.names.length === 0 || state.restaurants.length === 0`，如果為空，則嘗試從 `./data/names.json`, `./data/seed.json`, `./data/menus.json` 載入預設資料。
    *   **衝突/缺失**: 藍圖強調「點餐負責人」透過 `admin.html` 建立餐廳與菜單資料庫、管理參與者名單。`app.js` 中 `initializeData()` 預設從 JSON 檔案載入資料，這與藍圖中 `admin.html` 的設定精靈和手動管理功能存在潛在衝突。如果 `admin.html` 的設定精靈未能正確覆蓋或更新這些預設載入的資料，可能會導致資料不一致。
    *   **修正方向**: 確保 `admin.html` 中的資料管理功能（名單匯入、餐廳與菜單新增/編輯）能正確地更新 `state` 並 `persistState()`，且其優先級高於 `initializeData()` 中的預設 JSON 載入。`initializeData` 應該只作為首次啟動時的
