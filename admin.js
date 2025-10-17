import {
  bootstrapApp,
  whenReady,
  getSettings,
  updateSettings,
  getNames,
  addNames,
  removeName,
  getRestaurants,
  upsertRestaurant,
  removeRestaurant,
  getMenus,
  setMenu,
  saveDataToServer,
  loadDataFromServer,
  clearOldRecords,
  setPin,
  verifyPin,
  getActiveDate
} from './app.js';

const adminPage = document.querySelector('[data-page="admin"]');

if (adminPage) {
  bootstrapApp();
  
  // --- DOM Elements ---
  const pinModal = document.getElementById('pinModal');
  const settingsForm = document.getElementById('settingsForm');
  const namesList = document.getElementById('namesList');
  const namesTextarea = document.getElementById('namesTextarea');
  const importCsvInput = document.getElementById('importCsv');
  const restaurantsList = document.getElementById('restaurantsList');
  const restaurantForm = document.getElementById('restaurantForm');
  const restaurantSelect = document.getElementById('restaurantSelect');
  const backupToggle = document.getElementById('backupToggle');
  const backupUrlInput = document.getElementById('backupUrl');
  const backupNowBtn = document.getElementById('backupNow');
  const restoreBtn = document.getElementById('restoreBackup');
  const clearOldBtn = document.getElementById('clearOldRecords');
  const wizard = document.getElementById('setupWizard');
  const wizardStartBtn = document.getElementById('startWizard');
  const wizardCanvas = document.getElementById('wizardCanvas');
  const wizardDownloadBtn = document.getElementById('downloadPoster');

  // v2.0 Menu Editor Elements
  const menuEditorV2 = document.getElementById('menuEditorV2');
  const menuImageForm = document.getElementById('menuImageForm');
  const menuImageUrl = document.getElementById('menuImageUrl');
  const menuImagesContainer = document.getElementById('menuImagesContainer');
  const categoryForm = document.getElementById('categoryForm');
  const categoryNameInput = document.getElementById('categoryName');
  const categoryContainer = document.getElementById('categoryContainer');
  
  // v2.0 Item Editor Modal Elements
  const itemEditorModal = document.getElementById('itemEditorModal');
  const itemEditorForm = document.getElementById('itemEditorForm');
  const modalTitle = document.getElementById('modalTitle');
  const optionGroupsContainer = document.getElementById('optionGroupsContainer');
  const addOptionGroupBtn = document.getElementById('addOptionGroupBtn');

  // --- State ---
  let activeRestaurantId = '';
  let activeMenu = {};
  const state = { wizardStep: 1 };

  // --- General Functions ---
  function showToast(message) {
    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.textContent = message;
    document.body.appendChild(toast);
    requestAnimationFrame(() => toast.classList.add('visible'));
    setTimeout(() => {
      toast.classList.remove('visible');
      setTimeout(() => toast.remove(), 300);
    }, 2500);
  }

  // --- PIN Authentication ---
  function showPinModal() {
    pinModal.classList.remove('hidden');
    pinModal.querySelector('#pinInput').focus();
  }
  function hidePinModal() { pinModal.classList.add('hidden'); }

  async function handlePinSubmit(event) {
    event.preventDefault();
    const pin = pinModal.querySelector('#pinInput').value.trim();
    const result = await verifyPin(pin);
    if (result.ok) {
      if (result.reason === 'not_set') {
        pinModal.querySelector('#setPinPanel').classList.remove('hidden');
        pinModal.querySelector('#pinForm').classList.add('hidden');
        pinModal.querySelector('#newPin').focus();
      } else {
        hidePinModal();
      }
    } else {
      const pinErrorEl = pinModal.querySelector('#pinError');
      pinErrorEl.textContent = result.reason === 'locked' ? `已鎖定，請於 ${new Date(result.unlockAt).toLocaleTimeString()} 再試。` : '密碼錯誤，請再試一次。';
    }
    event.target.reset();
  }

  pinModal.addEventListener('submit', async (event) => {
    if (event.target.id === 'setPinForm') {
        event.preventDefault();
        const newPin = pinModal.querySelector('#newPin').value.trim();
        const confirmPin = pinModal.querySelector('#confirmPin').value.trim();
        const setPinErrorEl = pinModal.querySelector('#setPinError');
        if (newPin.length < 4) { setPinErrorEl.textContent = 'PIN 至少 4 位數。'; return; }
        if (newPin !== confirmPin) { setPinErrorEl.textContent = '兩次輸入不一致。'; return; }
        await setPin(newPin);
        pinModal.querySelector('#setPinPanel').classList.add('hidden');
        pinModal.querySelector('#pinForm').classList.remove('hidden');
        hidePinModal();
        showToast('已設定 PIN');
    } else if (event.target.id === 'pinForm') {
        handlePinSubmit(event);
    }
  });

  // --- Settings, Names, Backup ---
  function populateSettings() {
    const settings = getSettings();
    if(settingsForm && settingsForm.mode) settingsForm.mode.value = settings.mode;
    if(settingsForm && settingsForm.baseDate) settingsForm.baseDate.value = settings.baseDate;
    if(settingsForm && settingsForm.timezone) settingsForm.timezone.value = settings.timezone;
    if(settingsForm && settingsForm.requiresPreorder) settingsForm.requiresPreorder.checked = !!settings.requiresPreorder;
    if(backupToggle) backupToggle.checked = !!settings.backup?.enabled;
    if(backupUrlInput) backupUrlInput.value = settings.backup?.url || '';
  }

  function renderNames() {
    const names = getNames();
    namesList.innerHTML = '';
    names.forEach((name) => {
      const li = document.createElement('li');
      li.innerHTML = `<span>${name}</span><button type="button" data-name="${name}">刪除</button>`;
      li.querySelector('button').addEventListener('click', () => {
        if (confirm(`確定刪除 ${name}？`)) removeName(name);
      });
      namesList.appendChild(li);
    });
  }

  function handleNamesImport() {
    const text = namesTextarea.value.trim();
    if (!text) return;
    const names = text.split(/\r?\n|,|\s/).map((item) => item.trim()).filter(Boolean);
    addNames(names);
    namesTextarea.value = '';
    showToast('已匯入名單');
  }

  function handleCsvImport(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target.result;
      const lines = String(text).split(/\r?\n/).filter(Boolean);
      addNames(lines.map((line) => line.split(',')[0].trim()));
      showToast('CSV 名單匯入完成');
    };
    reader.readAsText(file, 'utf-8');
  }

  // --- Restaurant Management ---
  function renderRestaurants() {
    const restaurants = getRestaurants(true);
    restaurantsList.innerHTML = '';
    restaurants.forEach((restaurant) => {
      const item = document.createElement('div');
      item.className = 'list-row';
      item.innerHTML = `<div><strong>${restaurant.name}</strong><p>${restaurant.requiresPreorder ? '需預訂' : '免預訂'} · ${restaurant.status || 'open'}</p></div><div class="actions"><button type="button" data-action="delete" data-id="${restaurant.id}">刪除</button></div>`;
      item.querySelector('[data-action="delete"]').addEventListener('click', () => {
        if (confirm('確定刪除餐廳？其所有菜單將一併刪除。')) removeRestaurant(restaurant.id);
      });
      restaurantsList.appendChild(item);
    });
  }
  
  restaurantForm.addEventListener('submit', (event) => {
    event.preventDefault();
    const name = event.target.name.value.trim();
    if (!name) return;
    const newRestaurant = {
      id: name.replace(/\s+/g, '_') + '_' + Date.now(),
      name,
      requiresPreorder: event.target.requiresPreorder.checked,
      status: 'open'
    };
    upsertRestaurant(newRestaurant);
    setMenu(newRestaurant.id, { name, menuImages: [], categories: [], items: [] });
    event.target.reset();
    showToast('餐廳已新增');
  });

  function populateRestaurantSelector() {
    const restaurants = getRestaurants(true);
    const currentValue = restaurantSelect.value;
    restaurantSelect.innerHTML = '<option value="">請選擇要編輯的餐廳</option>';
    restaurants.forEach((r) => {
      const option = document.createElement('option');
      option.value = r.id;
      option.textContent = r.name;
      restaurantSelect.appendChild(option);
    });
    if (restaurants.find(r => r.id === currentValue)) {
      restaurantSelect.value = currentValue;
    } else {
      activeRestaurantId = '';
      menuEditorV2.classList.add('hidden');
    }
  }

  // --- Menu Editor v2.0 ---
  function initializeMenuEditor() {
    activeRestaurantId = restaurantSelect.value;
    if (!activeRestaurantId) {
      menuEditorV2.classList.add('hidden');
      return;
    }
    const menus = getMenus();
    activeMenu = menus[activeRestaurantId] || { name: getRestaurants().find(r=>r.id === activeRestaurantId)?.name, menuImages: [], categories: [], items: [] };
    
    if (!activeMenu.menuImages) activeMenu.menuImages = [];
    if (!activeMenu.categories) activeMenu.categories = [];
    if (!activeMenu.items) activeMenu.items = [];

    menuEditorV2.classList.remove('hidden');
    renderMenuImages();
    renderCategoriesAndItems();
  }

  function renderMenuImages() {
    menuImagesContainer.innerHTML = '';
    if (!activeMenu.menuImages || activeMenu.menuImages.length === 0) {
      menuImagesContainer.innerHTML = '<p class="empty">尚未新增總菜單圖片</p>';
      return;
    }
    activeMenu.menuImages.forEach((url, index) => {
      const imgEl = document.createElement('div');
      imgEl.className = 'list-row';
      imgEl.innerHTML = `<a href="${url}" target="_blank">${url.substring(0, 50)}...</a><button class="danger" data-action="deleteMenuImage" data-index="${index}">刪除</button>`;
      menuImagesContainer.appendChild(imgEl);
    });
  }

  menuImageForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const url = menuImageUrl.value.trim();
    if (!url) return;
    activeMenu.menuImages.push(url);
    persistActiveMenu();
    menuImageUrl.value = '';
    showToast('總菜單圖片已新增');
  });

  menuImagesContainer.addEventListener('click', (e) => {
    if (e.target.dataset.action === 'deleteMenuImage') {
      const index = parseInt(e.target.dataset.index, 10);
      activeMenu.menuImages.splice(index, 1);
      persistActiveMenu();
      showToast('總菜單圖片已刪除');
    }
  });

  function renderCategoriesAndItems() {
    categoryContainer.innerHTML = '';
    if (!activeMenu.categories || activeMenu.categories.length === 0) {
        categoryContainer.innerHTML = '<p class="empty" style="padding: 1rem; text-align: center;">尚未新增分類。</p>';
    }
    activeMenu.categories.forEach(category => {
      const categoryEl = document.createElement('div');
      categoryEl.className = 'category-block';
      categoryEl.innerHTML = `<div class="category-header"><h3>${category.name}</h3><div><button type="button" class="ghost" data-action="addItem" data-category-id="${category.id}">新增品項</button><button type="button" class="danger" data-action="deleteCategory" data-category-id="${category.id}">刪除分類</button></div></div><div class="item-list"></div>`;
      const itemListEl = categoryEl.querySelector('.item-list');
      const itemsInCategory = activeMenu.items.filter(item => item.categoryId === category.id);
      if(itemsInCategory.length > 0) {
        itemsInCategory.forEach(item => {
          const itemEl = document.createElement('div');
          itemEl.className = 'item-row';
          itemEl.innerHTML = `<span>${item.name} - $${item.basePrice}</span><div><button type="button" data-action="editItem" data-item-id="${item.id}">編輯</button><button type="button" class="danger" data-action="deleteItem" data-item-id="${item.id}">刪除</button></div>`;
          itemListEl.appendChild(itemEl);
        });
      } else {
        itemListEl.innerHTML = '<p class="empty">此分類下尚無品項</p>';
      }
      categoryContainer.appendChild(categoryEl);
    });
  }
  categoryForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const name = categoryNameInput.value.trim();
    if (!name || !activeRestaurantId) return;
    activeMenu.categories.push({ id: 'cat_' + Date.now(), name: name });
    persistActiveMenu();
    categoryNameInput.value = '';
    showToast('分類已新增');
  });
  categoryContainer.addEventListener('click', (e) => {
      const action = e.target.dataset.action;
      if (!action) return;
      if (action === 'deleteCategory' && confirm('確定刪除此分類？分類下的所有品項也會一併刪除！')) {
        const categoryId = e.target.dataset.categoryId;
        activeMenu.categories = activeMenu.categories.filter(c => c.id !== categoryId);
        activeMenu.items = activeMenu.items.filter(i => i.categoryId !== categoryId);
        persistActiveMenu();
        showToast('分類已刪除');
      } else if (action === 'addItem') {
        openItemEditorModal(null, e.target.dataset.categoryId);
      } else if (action === 'editItem') {
        const item = activeMenu.items.find(i => i.id === e.target.dataset.itemId);
        openItemEditorModal(item, item.categoryId);
      } else if (action === 'deleteItem' && confirm('確定刪除此品項？')) {
        activeMenu.items = activeMenu.items.filter(i => i.id !== e.target.dataset.itemId);
        persistActiveMenu();
        showToast('品項已刪除');
      }
  });

  function openItemEditorModal(item, categoryId) {
    itemEditorForm.reset();
    itemEditorForm.itemId.value = item ? item.id : '';
    itemEditorForm.categoryId.value = categoryId;
    modalTitle.textContent = item ? '編輯品項' : '新增品項';
    if (item) {
        itemEditorForm.name.value = item.name;
        itemEditorForm.basePrice.value = item.basePrice;
        itemEditorForm.unit.value = item.unit || '';
        itemEditorForm.imageUrl.value = item.imageUrl || '';
    }
    renderOptionGroups(item ? item.optionGroups : []);
    itemEditorModal.classList.remove('hidden');
  }
  function renderOptionGroups(groups = []) {
      optionGroupsContainer.innerHTML = '';
      groups.forEach((group, index) => {
          const groupEl = document.createElement('div');
          groupEl.className = 'option-group-editor';
          groupEl.innerHTML = `<div class="group-header"><input type="text" value="${group.name}" placeholder="群組名稱 (e.g., 尺寸)" data-group-index="${index}" data-field="name"><select data-group-index="${index}" data-field="type"><option value="single" ${group.type === 'single' ? 'selected' : ''}>單選</option><option value="multiple" ${group.type === 'multiple' ? 'selected' : ''}>多選</option></select><button type="button" class="danger" data-action="deleteGroup" data-group-index="${index}">刪除群組</button></div><div class="options-container"></div><button type="button" class="ghost" data-action="addOption" data-group-index="${index}">新增選項</button>`;
          const optionsContainer = groupEl.querySelector('.options-container');
          (group.options || []).forEach((option, optIndex) => {
              const optionEl = document.createElement('div');
              optionEl.className = 'option-editor';
              optionEl.innerHTML = `<input type="text" value="${option.name}" placeholder="選項名稱" data-group-index="${index}" data-option-index="${optIndex}" data-field="optionName"><input type="number" value="${option.priceAdjustment || 0}" placeholder="價格調整" data-group-index="${index}" data-option-index="${optIndex}" data-field="priceAdjustment"><button type="button" class="danger" data-action="deleteOption" data-group-index="${index}" data-option-index="${optIndex}">×</button>`;
              optionsContainer.appendChild(optionEl);
          });
          optionGroupsContainer.appendChild(groupEl);
      });
  }
  addOptionGroupBtn.addEventListener('click', () => {
    const currentGroups = collectOptionGroupsFromDOM();
    currentGroups.push({ name: '', type: 'single', options: [{ name: '', priceAdjustment: 0 }] });
    renderOptionGroups(currentGroups);
  });
  optionGroupsContainer.addEventListener('click', (e) => {
      const action = e.target.dataset.action;
      if (!action) return;
      let currentGroups = collectOptionGroupsFromDOM();
      if (action === 'deleteGroup') currentGroups.splice(e.target.dataset.groupIndex, 1);
      else if (action === 'addOption') {
        if (!currentGroups[e.target.dataset.groupIndex].options) currentGroups[e.target.dataset.groupIndex].options = [];
        currentGroups[e.target.dataset.groupIndex].options.push({ name: '', priceAdjustment: 0 });
      }
      else if (action === 'deleteOption') currentGroups[e.target.dataset.groupIndex].options.splice(e.target.dataset.optionIndex, 1);
      renderOptionGroups(currentGroups);
  });
  function collectOptionGroupsFromDOM() {
      const groups = [];
      optionGroupsContainer.querySelectorAll('.option-group-editor').forEach((groupEl, groupIndex) => {
          const group = { name: groupEl.querySelector(`[data-group-index="${groupIndex}"][data-field="name"]`).value, type: groupEl.querySelector(`[data-group-index="${groupIndex}"][data-field="type"]`).value, options: [] };
          groupEl.querySelectorAll('.option-editor').forEach((optionEl, optionIndex) => {
              group.options.push({ name: optionEl.querySelector(`[data-option-index="${optionIndex}"][data-field="optionName"]`).value, priceAdjustment: Number(optionEl.querySelector(`[data-option-index="${optionIndex}"][data-field="priceAdjustment"]`).value) || 0 });
          });
          groups.push(group);
      });
      return groups;
  }
  itemEditorForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const formData = new FormData(itemEditorForm);
      const itemId = formData.get('itemId') || 'item_' + Date.now();
      const newItemData = {
          id: itemId,
          categoryId: formData.get('categoryId'),
          name: formData.get('name').trim(),
          basePrice: Number(formData.get('basePrice')),
          unit: formData.get('unit').trim(),
          imageUrl: formData.get('imageUrl').trim(),
          optionGroups: collectOptionGroupsFromDOM().filter(g => g.name)
      };
      const itemIndex = activeMenu.items.findIndex(i => i.id === itemId);
      if (itemIndex > -1) activeMenu.items[itemIndex] = newItemData;
      else activeMenu.items.push(newItemData);
      persistActiveMenu();
      itemEditorModal.classList.add('hidden');
      showToast('品項已儲存');
  });
  
  function persistActiveMenu() {
    if (!activeRestaurantId) return;
    setMenu(activeRestaurantId, activeMenu);
  }

  // --- Wizard Functions (Restored) ---
  function startWizard() {
    if(!wizard) return;
    wizard.classList.remove('hidden');
    state.wizardStep = 1;
    renderWizard();
  }

  function renderWizard() {
    if(!wizard) return;
    wizard.querySelectorAll('.wizard-step').forEach((step) => {
      step.classList.toggle('active', Number(step.dataset.step) === state.wizardStep);
    });
  }
  
  if (wizard) {
    wizard.addEventListener('click', (event) => {
      if (event.target.matches('[data-next]')) {
        state.wizardStep = Math.min(3, state.wizardStep + 1);
        renderWizard();
        if (state.wizardStep === 3) drawPoster();
      }
      if (event.target.matches('[data-prev]')) {
        state.wizardStep = Math.max(1, state.wizardStep - 1);
        renderWizard();
      }
    });
  }

  function drawPoster() {
    if (!wizardCanvas) return;
    const ctx = wizardCanvas.getContext('2d');
    // ... drawing logic
  }
  
  // --- Initialization and Event Listeners ---
  function setupEventListeners() {
    document.getElementById('importNamesBtn')?.addEventListener('click', handleNamesImport);
    importCsvInput?.addEventListener('change', handleCsvImport);
    namesTextarea?.addEventListener('keydown', (event) => { if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') handleNamesImport(); });
    settingsForm?.addEventListener('change', () => {
        const formData = new FormData(settingsForm);
        updateSettings({ mode: formData.get('mode'), baseDate: formData.get('baseDate'), timezone: formData.get('timezone'), requiresPreorder: formData.get('requiresPreorder') === 'on' });
        showToast('設定已儲存');
    });
    backupToggle?.addEventListener('change', () => updateSettings({ backup: { ...getSettings().backup, enabled: backupToggle.checked, url: backupUrlInput.value }}));
    backupUrlInput?.addEventListener('blur', () => updateSettings({ backup: { ...getSettings().backup, enabled: backupToggle.checked, url: backupUrlInput.value }}));
    backupNowBtn?.addEventListener('click', async () => { try { await saveDataToServer(); showToast('備份完成'); } catch (error) { showToast('備份失敗'); }});
    restoreBtn?.addEventListener('click', async () => { if (confirm('確認從備份還原？目前資料將被覆蓋。')) { try { await loadDataFromServer(); showToast('還原完成'); } catch (error) { showToast('還原失敗'); }}});
    clearOldBtn?.addEventListener('click', () => { if (confirm('確定清除 30 天前資料？') && confirm('再次確認：舊資料將無法復原。')) { clearOldRecords(30); showToast('已清除舊資料'); }});
    wizardStartBtn?.addEventListener('click', startWizard);
    wizardDownloadBtn?.addEventListener('click', () => { if(!wizardCanvas) return; const link = document.createElement('a'); link.href = wizardCanvas.toDataURL('image/png'); link.download = `LunchVote_poster_${getActiveDate()}.png`; link.click(); });
    restaurantSelect.addEventListener('change', initializeMenuEditor);
    window.addEventListener('lunchvote:update', () => {
        renderNames();
        renderRestaurants();
        populateRestaurantSelector();
        if (activeRestaurantId) {
            initializeMenuEditor();
        }
    });
  }

  whenReady().then(() => {
    populateSettings();
    renderNames();
    renderRestaurants();
    populateRestaurantSelector();
    setupEventListeners();
    
    if (!getSettings().pinHash) {
        showPinModal();
        pinModal.querySelector('#setPinPanel').classList.remove('hidden');
        pinModal.querySelector('#pinForm').classList.add('hidden');
    } else {
        showPinModal();
    }
  });
}
