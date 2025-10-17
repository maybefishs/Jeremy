## `admin.js` 與產品藍圖比對分析

### 數據管理（名單、餐廳、菜單）

*   **藍圖要求**: 「點餐負責人」透過 `admin.html` 進行後台管理，包括設定作戰模式、管理參與者名單、建立餐廳與菜單資料庫。
*   **`admin.js` 現況**: 
    *   **名單管理**: `admin.js` 提供了 `namesTextarea` 和 `importCsvInput` 來匯入名單，並有 `renderNames()` 函式來顯示和管理（刪除）現有名單。這些操作透過 `addNames()` 和 `removeName()` 函式與 `app.js` 中的狀態進行互動。
    *   **餐廳管理**: `restaurantForm` 允許新增餐廳，並透過 `upsertRestaurant()` 函式更新狀態。`renderRestaurants()` 函式顯示餐廳列表，並提供修改狀態（營業中/停售/售完）和刪除餐廳的功能。
    *   **菜單管理**: `menuRestaurantSelect` 用於選擇餐廳，`menuList` 則用於編輯選定餐廳的菜單項目。菜單項目的增刪改查都直接操作 `activeMenuItems` 陣列，並透過 `persistMenu()`（內部呼叫 `setMenu()`）更新到 `app.js` 的狀態中。
*   **結論**: `admin.js` 完整實現了藍圖中關於名單、餐廳和菜單的增刪改查功能，這些操作會直接更新應用程式的狀態並持久化到 `localStorage`。這解決了之前對 `app.js` 中 `initializeData()` 可能導致衝突的擔憂，因為用戶在 `admin.html` 中進行的任何修改都將優先於預設的 JSON 載入。`initializeData` 僅在首次啟動且無任何數據時提供初始數據。

### PIN 碼保護

*   **藍圖要求**: 配置 PIN 碼保護。
*   **`admin.js` 現況**: 
    *   頁面載入時會呼叫 `showPinModal()` 顯示 PIN 碼輸入框。
    *   `handlePinSubmit()` 函式負責驗證 PIN 碼，並透過 `verifyPin()` 函式與 `app.js` 進行互動。
    *   如果 PIN 碼未設定 (`result.reason === 'not_set'`)，則會顯示 `setPinPanel` 讓用戶設定新 PIN 碼。
    *   `setPinForm` 處理新 PIN 碼的設定，並透過 `setPin()` 函式更新狀態。
    *   具備錯誤訊息顯示 (`pinError`, `setPinError`) 和鎖定機制 (`result.reason === 'locked'`)。
*   **結論**: PIN 碼保護功能已完整實現，符合藍圖要求。

### 設定精靈 (Setup Wizard)

*   **藍圖要求**: 「點餐負責人」首次進入 `admin.html`，系統將強制啟動設定精靈，引導完成 PIN 碼設定、名單匯入、模式選擇，並產出 QR Code 海報。
*   **`admin.js` 現況**: 
    *   `setupWizard` 區塊包含多個步驟 (`wizard-step`)。
    *   在 `whenReady().then()` 之後，如果 `settings.baseDate` 或 `getNames()` 為空，會呼叫 `startWizard()` 啟動設定精靈。
    *   精靈引導用戶匯入名單、選擇模式與日期。
    *   `wizardCanvas` 用於生成 QR Code 海報，`wizardDownloadBtn` 允許下載。
    *   `startWizard` 按鈕允許重新啟動精靈。
*   **結論**: 設定精靈功能已實現，並在必要時自動啟動，符合藍圖要求。QR Code 海報生成與下載功能也已包含。

### 備份協議

*   **藍圖要求**: 系統提供手動與自動備份機制。可設定 Google Apps Script 的 Webhook URL，實現每日定時向上備份。
*   **`admin.js` 現況**: 
    *   `backupToggle` 用於啟用/禁用「每日 10:05 自動備份」。
    *   `backupUrlInput` 用於輸入 Google Apps Script / API URL。
    *   `backupNowBtn` 觸發「立即備份」，呼叫 `saveDataToServer()` 函式。
    *   `restoreBtn` 觸發「從備份還原」，呼叫 `loadDataFromServer()` 函式。
    *   `clearOldBtn` 觸發「清除 30 天前資料」，呼叫 `clearOldRecords()` 函式。
*   **結論**: 備份機制已實現，包括手動備份、自動備份配置和從備份還原的功能，並支援 Google Apps Script Webhook URL，符合藍圖要求。

### 其他設定

*   **藍圖要求**: 設定作戰模式（投票/直訂）。
*   **`admin.js` 現況**: `settingsForm` 包含 `mode` 選擇框，允許選擇「投票 + 點餐」或「直接點餐」。這些設定會透過 `updateSettings()` 函式更新到 `app.js` 的狀態中。
*   **結論**: 模式設定已實現，符合藍圖要求。

### 總結

`admin.js` 檔案的實現與產品藍圖中關於「點餐負責人」的後台管理、PIN 碼保護、設定精靈、數據管理和備份協議等核心功能描述高度一致。它有效地利用了 `app.js` 提供的狀態管理和數據持久化能力，確保了應用程式的行為符合藍圖的設計。
