import { getSettings, updateSettings, getNames, addNames, removeName, getRestaurants, upsertRestaurant, removeRestaurant, getMenus, setMenu, setPin, verifyPin, saveDataToServer, loadDataFromServer, clearOldRecords } from './app.js';

document.addEventListener("DOMContentLoaded", async () => {
    await window.whenReady(); // 等待 app.js 初始化完成

    const adminPinModal = new bootstrap.Modal(document.getElementById("adminPinModal"));
    const setPinModal = new bootstrap.Modal(document.getElementById("setPinModal"));
    const setupWizardModal = new bootstrap.Modal(document.getElementById("setupWizardModal"));

    const adminPinInput = document.getElementById("admin-pin-input");
    const adminPinVerifyBtn = document.getElementById("admin-pin-verify-btn");
    const adminPinError = document.getElementById("admin-pin-error");

    const setupPinInput = document.getElementById("setup-pin-input");
    const setupPinConfirmInput = document.getElementById("setup-pin-confirm-input");
    const setupPinSetBtn = document.getElementById("setup-pin-set-btn");
    const setupPinError = document.getElementById("setup-pin-error");

    const setupWizardNextBtn = document.getElementById("setup-wizard-next-btn");
    const setupWizardPrevBtn = document.getElementById("setup-wizard-prev-btn");
    const setupWizardFinishBtn = document.getElementById("setup-wizard-finish-btn");
    const setupWizardSteps = document.querySelectorAll(".setup-wizard-step");
    let currentStep = 0;

    const namesInput = document.getElementById("names-input");
    const namesList = document.getElementById("names-list");
    const addNameBtn = document.getElementById("add-name-btn");

    const restaurantNameInput = document.getElementById("restaurant-name");
    const restaurantTagsInput = document.getElementById("restaurant-tags");
    const restaurantPreorderCheckbox = document.getElementById("restaurant-preorder");
    const addRestaurantBtn = document.getElementById("add-restaurant-btn");
    const restaurantList = document.getElementById("restaurant-list");
    const restaurantMenuInput = document.getElementById("restaurant-menu-input");
    const saveMenuBtn = document.getElementById("save-menu-btn");
    const currentRestaurantName = document.getElementById("current-restaurant-name");
    let editingRestaurantId = null;

    const backupUrlInput = document.getElementById("backup-url-input");
    const saveBackupUrlBtn = document.getElementById("save-backup-url-btn");
    const backupNowBtn = document.getElementById("backup-now-btn");
    const restoreNowBtn = document.getElementById("restore-now-btn");
    const clearOldRecordsBtn = document.getElementById("clear-old-records-btn");
    const backupStatus = document.getElementById("backup-status");

    const qrCodeContainer = document.getElementById("qrcode");
    const qrCodeLink = document.getElementById("qrcode-link");

    // --- PIN 碼驗證邏輯 ---
    async function checkAdminPin() {
        const settings = getSettings();
        if (!settings.adminPinSet) {
            setupWizardModal.show();
            showSetupStep(0);
        } else {
            adminPinModal.show();
        }
    }

    adminPinVerifyBtn.addEventListener("click", async () => {
        const pin = adminPinInput.value;
        const result = await verifyPin(pin);
        if (result.ok) {
            adminPinModal.hide();
            adminPinInput.value = "";
            renderAdminPanel();
        } else {
            adminPinError.textContent = "PIN 碼錯誤或帳戶鎖定";
            adminPinError.style.display = "block";
        }
    });

    setupPinSetBtn.addEventListener("click", async () => {
        const pin = setupPinInput.value;
        const confirmPin = setupPinConfirmInput.value;
        if (pin === "" || confirmPin === "") {
            setupPinError.textContent = "PIN 碼不能為空";
            setupPinError.style.display = "block";
            return;
        }
        if (pin !== confirmPin) {
            setupPinError.textContent = "兩次輸入的 PIN 碼不一致";
            setupPinError.style.display = "block";
            return;
        }
        await setPin(pin);
        updateSettings({ adminPinSet: true });
        setupPinError.style.display = "none";
        alert("PIN 碼設定成功！");
        setPinModal.hide();
        showSetupStep(currentStep + 1);
    });

    // --- 設定精靈邏輯 ---
    function showSetupStep(step) {
        setupWizardSteps.forEach((s, i) => {
            s.classList.remove("active");
            if (i === step) {
                s.classList.add("active");
            }
        });
        currentStep = step;

        setupWizardPrevBtn.style.display = currentStep === 0 ? "none" : "inline-block";
        setupWizardNextBtn.style.display = currentStep === setupWizardSteps.length - 1 ? "none" : "inline-block";
        setupWizardFinishBtn.style.display = currentStep === setupWizardSteps.length - 1 ? "inline-block" : "none";
    }

    setupWizardNextBtn.addEventListener("click", () => {
        if (currentStep === 0) { // 設定 PIN 碼步驟
            setPinModal.show();
        } else {
            showSetupStep(currentStep + 1);
        }
    });

    setupWizardPrevBtn.addEventListener("click", () => {
        showSetupStep(currentStep - 1);
    });

    setupWizardFinishBtn.addEventListener("click", () => {
        setupWizardModal.hide();
        renderAdminPanel();
    });

    // --- 名單管理 ---
    function renderNames() {
        namesList.innerHTML = "";
        getNames().forEach(name => {
            const li = document.createElement("li");
            li.className = "list-group-item d-flex justify-content-between align-items-center";
            li.textContent = name;
            const deleteBtn = document.createElement("button");
            deleteBtn.className = "btn btn-danger btn-sm";
            deleteBtn.textContent = "刪除";
            deleteBtn.addEventListener("click", () => {
                removeName(name);
                renderNames();
            });
            li.appendChild(deleteBtn);
            namesList.appendChild(li);
        });
    }

    addNameBtn.addEventListener("click", () => {
        const newNames = namesInput.value.split(",").map(n => n.trim()).filter(n => n !== "");
        if (newNames.length > 0) {
            addNames(newNames);
            namesInput.value = "";
            renderNames();
        }
    });

    // --- 餐廳管理 ---
    function renderRestaurants() {
        restaurantList.innerHTML = "";
        getRestaurants().forEach(restaurant => {
            const li = document.createElement("li");
            li.className = "list-group-item d-flex justify-content-between align-items-center";
            li.innerHTML = `
                <span>${restaurant.name} (${restaurant.tags?.join(", ") || "無標籤"})</span>
                <div>
                    <button class="btn btn-info btn-sm me-2 edit-restaurant" data-id="${restaurant.id}">編輯</button>
                    <button class="btn btn-warning btn-sm me-2 manage-menu" data-id="${restaurant.id}" data-name="${restaurant.name}">管理菜單</button>
                    <button class="btn btn-danger btn-sm delete-restaurant" data-id="${restaurant.id}">刪除</button>
                </div>
            `;
            restaurantList.appendChild(li);
        });

        document.querySelectorAll(".edit-restaurant").forEach(btn => {
            btn.addEventListener("click", (e) => {
                const id = e.target.dataset.id;
                const restaurant = getRestaurants().find(r => r.id === id);
                if (restaurant) {
                    editingRestaurantId = id;
                    restaurantNameInput.value = restaurant.name;
                    restaurantTagsInput.value = restaurant.tags?.join(", ") || "";
                    restaurantPreorderCheckbox.checked = restaurant.requiresPreorder || false;
                    addRestaurantBtn.textContent = "更新餐廳";
                }
            });
        });

        document.querySelectorAll(".delete-restaurant").forEach(btn => {
            btn.addEventListener("click", (e) => {
                const id = e.target.dataset.id;
                if (confirm("確定要刪除這家餐廳嗎？這將會一併刪除其菜單。")) {
                    removeRestaurant(id);
                    // Optionally also remove menu here, though app.js handles state
                    renderRestaurants();
                }
            });
        });

        document.querySelectorAll(".manage-menu").forEach(btn => {
            btn.addEventListener("click", (e) => {
                editingRestaurantId = e.target.dataset.id;
                currentRestaurantName.textContent = e.target.dataset.name;
                const menus = getMenus();
                restaurantMenuInput.value = JSON.stringify(menus[editingRestaurantId] || [], null, 2);
                const menuModal = new bootstrap.Modal(document.getElementById("menuModal"));
                menuModal.show();
            });
        });
    }

    addRestaurantBtn.addEventListener("click", () => {
        const name = restaurantNameInput.value.trim();
        const tags = restaurantTagsInput.value.split(",").map(t => t.trim()).filter(t => t !== "");
        const requiresPreorder = restaurantPreorderCheckbox.checked;

        if (name === "") {
            alert("餐廳名稱不能為空！");
            return;
        }

        const newRestaurant = {
            id: editingRestaurantId || `res-${Date.now()}`,
            name,
            tags,
            requiresPreorder,
        };

        upsertRestaurant(newRestaurant);
        editingRestaurantId = null;
        restaurantNameInput.value = "";
        restaurantTagsInput.value = "";
        restaurantPreorderCheckbox.checked = false;
        addRestaurantBtn.textContent = "新增餐廳";
        renderRestaurants();
    });

    saveMenuBtn.addEventListener("click", () => {
        if (editingRestaurantId) {
            try {
                const menu = JSON.parse(restaurantMenuInput.value);
                setMenu(editingRestaurantId, menu);
                alert("菜單儲存成功！");
                bootstrap.Modal.getInstance(document.getElementById("menuModal")).hide();
            } catch (e) {
                alert("菜單 JSON 格式錯誤！" + e.message);
            }
        }
    });

    // --- 備份與維護 ---
    function renderBackupSettings() {
        const settings = getSettings();
        backupUrlInput.value = settings.backup?.url || "";
    }

    saveBackupUrlBtn.addEventListener("click", () => {
        const url = backupUrlInput.value.trim();
        updateSettings({ backup: { enabled: url !== "", url: url } });
        alert("備份設定已儲存。");
        renderBackupSettings();
    });

    backupNowBtn.addEventListener("click", async () => {
        backupStatus.textContent = "備份中...";
        const result = await saveDataToServer();
        if (result.ok) {
            backupStatus.textContent = "備份成功！";
            alert("備份成功！");
        } else {
            backupStatus.textContent = `備份失敗: ${result.message}`;
            alert(`備份失敗: ${result.message}`);
        }
    });

    restoreNowBtn.addEventListener("click", async () => {
        if (!confirm("確定要從備份還原嗎？這將會覆蓋目前的資料！")) return;
        backupStatus.textContent = "還原中...";
        const result = await loadDataFromServer();
        if (result.ok) {
            backupStatus.textContent = "還原成功！";
            alert("還原成功！請重新整理頁面以載入最新資料。");
            // Force reload to ensure all components re-render with new state
            window.location.reload(); 
        } else {
            backupStatus.textContent = `還原失敗: ${result.message}`;
            alert(`還原失敗: ${result.message}`);
        }
    });

    clearOldRecordsBtn.addEventListener("click", () => {
        if (confirm("確定要清除所有超過 30 天的投票和訂單記錄嗎？此操作不可逆！")) {
            clearOldRecords();
            alert("舊記錄已清除。");
        }
    });

    // --- QR Code 生成 ---
    function generateQRCode() {
        qrCodeContainer.innerHTML = "";
        const currentUrl = window.location.origin + "/index.html"; // Assuming index.html is the user-facing page
        new QRCode(qrCodeContainer, {
            text: currentUrl,
            width: 128,
            height: 128,
            colorDark : "#000000",
            colorLight : "#ffffff",
            correctLevel : QRCode.CorrectLevel.H
        });
        qrCodeLink.href = currentUrl;
        qrCodeLink.textContent = currentUrl;
    }

    // --- 初始化管理面板 ---
    function renderAdminPanel() {
        renderNames();
        renderRestaurants();
        renderBackupSettings();
        generateQRCode();
    }

    // 初始檢查 PIN 碼
    checkAdminPin();

    // 監聽 app.js 的更新事件，重新渲染管理面板
    window.addEventListener("lunchvote:update", renderAdminPanel);
});

