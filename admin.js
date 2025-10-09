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
  const pinModal = document.getElementById('pinModal');
  const pinForm = document.getElementById('pinForm');
  const pinInput = document.getElementById('pinInput');
  const pinError = document.getElementById('pinError');
  const setPinForm = document.getElementById('setPinForm');
  const newPinInput = document.getElementById('newPin');
  const confirmPinInput = document.getElementById('confirmPin');
  const setPinError = document.getElementById('setPinError');
  const settingsForm = document.getElementById('settingsForm');
  const namesList = document.getElementById('namesList');
  const namesTextarea = document.getElementById('namesTextarea');
  const importCsvInput = document.getElementById('importCsv');
  const restaurantsList = document.getElementById('restaurantsList');
  const restaurantForm = document.getElementById('restaurantForm');
  const menuSelect = document.getElementById('menuRestaurantSelect');
  const menuList = document.getElementById('menuList');
  const addMenuItemBtn = document.getElementById('addMenuItem');
  const backupToggle = document.getElementById('backupToggle');
  const backupUrlInput = document.getElementById('backupUrl');
  const backupNowBtn = document.getElementById('backupNow');
  const restoreBtn = document.getElementById('restoreBackup');
  const clearOldBtn = document.getElementById('clearOldRecords');
  const wizard = document.getElementById('setupWizard');
  const wizardStartBtn = document.getElementById('startWizard');
  const wizardCanvas = document.getElementById('wizardCanvas');
  const wizardDownloadBtn = document.getElementById('downloadPoster');

  let activeMenuItems = [];
  let activeRestaurantId = '';

  const state = {
    wizardStep: 1
  };

  function showPinModal() {
    pinModal.classList.remove('hidden');
    pinInput.focus();
  }

  function hidePinModal() {
    pinModal.classList.add('hidden');
  }

  async function handlePinSubmit(event) {
    event.preventDefault();
    const pin = pinInput.value.trim();
    const result = await verifyPin(pin);
    if (result.ok) {
      if (result.reason === 'not_set') {
        document.getElementById('setPinPanel').classList.remove('hidden');
        pinForm.classList.add('hidden');
        newPinInput.focus();
      } else {
        hidePinModal();
      }
    } else if (result.reason === 'locked') {
      pinError.textContent = `已鎖定，請於 ${new Date(result.unlockAt).toLocaleTimeString()} 再試。`;
    } else {
      pinError.textContent = '密碼錯誤，請再試一次。';
    }
    pinForm.reset();
  }

  setPinForm?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const pin = newPinInput.value.trim();
    if (pin.length < 4) {
      setPinError.textContent = 'PIN 至少 4 位數。';
      return;
    }
    if (pin !== confirmPinInput.value.trim()) {
      setPinError.textContent = '兩次輸入不一致。';
      return;
    }
    await setPin(pin);
    document.getElementById('setPinPanel').classList.add('hidden');
    pinForm.classList.remove('hidden');
    hidePinModal();
    showToast('已設定 PIN');
  });

  function populateSettings() {
    const settings = getSettings();
    settingsForm.mode.value = settings.mode;
    settingsForm.baseDate.value = settings.baseDate;
    settingsForm.timezone.value = settings.timezone;
    settingsForm.requiresPreorder.checked = !!settings.requiresPreorder;
    backupToggle.checked = !!settings.backup?.enabled;
    backupUrlInput.value = settings.backup?.url || '';
  }

  function renderNames() {
    const names = getNames();
    namesList.innerHTML = '';
    names.forEach((name) => {
      const li = document.createElement('li');
      li.innerHTML = `
        <span>${name}</span>
        <button type="button" data-name="${name}">刪除</button>
      `;
      li.querySelector('button').addEventListener('click', () => {
        if (confirm(`確定刪除 ${name}？`)) {
          removeName(name);
          renderNames();
        }
      });
      namesList.appendChild(li);
    });
  }

  function handleNamesImport() {
    const text = namesTextarea.value.trim();
    if (!text) return;
    const names = text
      .split(/\r?\n|,|\s/)
      .map((item) => item.trim())
      .filter(Boolean);
    addNames(names);
    namesTextarea.value = '';
    renderNames();
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
      renderNames();
      showToast('CSV 名單匯入完成');
    };
    reader.readAsText(file, 'utf-8');
  }

  function renderRestaurants() {
    const restaurants = getRestaurants(true);
    restaurantsList.innerHTML = '';
    restaurants.forEach((restaurant) => {
      const item = document.createElement('div');
      item.className = 'list-row';
      item.innerHTML = `
        <div>
          <strong>${restaurant.name}</strong>
          <p>${restaurant.requiresPreorder ? '需預訂' : '免預訂'} · ${restaurant.status === 'open' ? '營業中' : restaurant.status === 'soldout' ? '售完' : '停售'}</p>
        </div>
        <div class="actions">
          <button type="button" data-action="menu" data-id="${restaurant.id}">菜單</button>
          <button type="button" data-action="toggle" data-id="${restaurant.id}">${restaurant.status === 'open' ? '停售' : '開啟'}</button>
          <button type="button" data-action="soldout" data-id="${restaurant.id}">${restaurant.status === 'soldout' ? '恢復' : '標記售完'}</button>
          <button type="button" data-action="delete" data-id="${restaurant.id}">刪除</button>
        </div>
      `;
      item.querySelector('[data-action="menu"]').addEventListener('click', () => {
        activeRestaurantId = restaurant.id;
        populateMenuEditor();
        menuSelect.value = restaurant.id;
      });
      item.querySelector('[data-action="toggle"]').addEventListener('click', () => {
        const nextStatus = restaurant.status === 'open' ? 'closed' : 'open';
        upsertRestaurant({ ...restaurant, status: nextStatus });
        renderRestaurants();
      });
      item.querySelector('[data-action="soldout"]').addEventListener('click', () => {
        const nextStatus = restaurant.status === 'soldout' ? 'open' : 'soldout';
        upsertRestaurant({ ...restaurant, status: nextStatus });
        renderRestaurants();
      });
      item.querySelector('[data-action="delete"]').addEventListener('click', () => {
        if (confirm('確定刪除餐廳？')) {
          removeRestaurant(restaurant.id);
          renderRestaurants();
        }
      });
      restaurantsList.appendChild(item);
    });
  }

  restaurantForm?.addEventListener('submit', (event) => {
    event.preventDefault();
    const formData = new FormData(restaurantForm);
    const id = String(formData.get('id') || '').trim() || crypto.randomUUID();
    const name = String(formData.get('name') || '').trim();
    const requiresPreorder = formData.get('requiresPreorder') === 'on';
    if (!name) {
      showToast('請輸入餐廳名稱');
      return;
    }
    upsertRestaurant({ id, name, requiresPreorder, status: 'open' });
    restaurantForm.reset();
    renderRestaurants();
    populateMenuSelector();
    showToast('已新增餐廳');
  });

  function populateMenuSelector() {
    const restaurants = getRestaurants(true);
    menuSelect.innerHTML = '<option value="">選擇餐廳</option>';
    restaurants.forEach((restaurant) => {
      const option = document.createElement('option');
      option.value = restaurant.id;
      option.textContent = restaurant.name;
      menuSelect.appendChild(option);
    });
    if (activeRestaurantId) {
      menuSelect.value = activeRestaurantId;
    }
  }

  function populateMenuEditor() {
    const menus = getMenus();
    if (!activeRestaurantId) {
      menuList.innerHTML = '<p class="empty">請選擇餐廳</p>';
      return;
    }
    const menu = menus[activeRestaurantId];
    activeMenuItems = menu?.items ? [...menu.items] : [];
    renderMenuItems();
  }

  function renderMenuItems() {
    if (!activeMenuItems.length) {
      menuList.innerHTML = '<p class="empty">尚未設定菜單</p>';
      return;
    }
    menuList.innerHTML = '';
    activeMenuItems.forEach((item, index) => {
      const row = document.createElement('div');
      row.className = 'menu-row';
      row.innerHTML = `
        <input type="text" value="${item.name}" data-field="name" data-index="${index}" />
        <input type="number" value="${item.price}" min="0" data-field="price" data-index="${index}" />
        <label class="toggle">
          <input type="checkbox" data-field="available" data-index="${index}" ${item.available ? 'checked' : ''} />
          <span>可售</span>
        </label>
        <button type="button" data-action="remove" data-index="${index}">刪除</button>
      `;
      row.querySelector('[data-field="name"]').addEventListener('input', (event) => {
        activeMenuItems[index].name = event.target.value;
        persistMenu();
      });
      row.querySelector('[data-field="price"]').addEventListener('input', (event) => {
        activeMenuItems[index].price = Number(event.target.value || 0);
        persistMenu();
      });
      row.querySelector('[data-field="available"]').addEventListener('change', (event) => {
        activeMenuItems[index].available = event.target.checked;
        persistMenu();
      });
      row.querySelector('[data-action="remove"]').addEventListener('click', () => {
        activeMenuItems.splice(index, 1);
        persistMenu();
        renderMenuItems();
      });
      menuList.appendChild(row);
    });
  }

  function persistMenu() {
    if (!activeRestaurantId) return;
    setMenu(activeRestaurantId, {
      name: getRestaurants(true).find((r) => r.id === activeRestaurantId)?.name || '',
      items: activeMenuItems
    });
  }

  addMenuItemBtn?.addEventListener('click', () => {
    if (!menuSelect.value) {
      showToast('請先選擇餐廳');
      return;
    }
    activeRestaurantId = menuSelect.value;
    activeMenuItems.push({ id: crypto.randomUUID(), name: '新菜品', price: 100, available: true });
    persistMenu();
    renderMenuItems();
  });

  menuSelect?.addEventListener('change', () => {
    activeRestaurantId = menuSelect.value;
    populateMenuEditor();
  });

  backupToggle?.addEventListener('change', () => {
    updateSettings({
      backup: {
        ...getSettings().backup,
        enabled: backupToggle.checked,
        url: backupUrlInput.value
      }
    });
    showToast('已更新備份設定');
  });

  backupUrlInput?.addEventListener('blur', () => {
    updateSettings({
      backup: {
        ...getSettings().backup,
        enabled: backupToggle.checked,
        url: backupUrlInput.value
      }
    });
  });

  backupNowBtn?.addEventListener('click', async () => {
    try {
      await saveDataToServer();
      showToast('備份完成');
    } catch (error) {
      showToast('備份失敗，請檢查設定');
    }
  });

  restoreBtn?.addEventListener('click', async () => {
    if (!confirm('確認從備份還原？目前資料將被覆蓋。')) return;
    try {
      const ok = await loadDataFromServer();
      if (ok) {
        populateSettings();
        renderNames();
        renderRestaurants();
        populateMenuSelector();
        populateMenuEditor();
        showToast('還原完成');
      }
    } catch (error) {
      showToast('還原失敗');
    }
  });

  clearOldBtn?.addEventListener('click', () => {
    if (confirm('確定清除 30 天前資料？') && confirm('再次確認：舊資料將無法復原。')) {
      clearOldRecords(30);
      showToast('已清除舊資料');
    }
  });

  settingsForm?.addEventListener('change', () => {
    const formData = new FormData(settingsForm);
    updateSettings({
      mode: formData.get('mode'),
      baseDate: formData.get('baseDate'),
      timezone: formData.get('timezone'),
      requiresPreorder: formData.get('requiresPreorder') === 'on'
    });
    showToast('設定已儲存');
  });

  namesTextarea?.addEventListener('keydown', (event) => {
    if (event.metaKey && event.key === 'Enter') {
      handleNamesImport();
    }
  });

  document.getElementById('importNamesBtn')?.addEventListener('click', handleNamesImport);
  importCsvInput?.addEventListener('change', handleCsvImport);

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

  function startWizard() {
    wizard.classList.remove('hidden');
    state.wizardStep = 1;
    renderWizard();
  }

  function renderWizard() {
    wizard.querySelectorAll('.wizard-step').forEach((step) => {
      step.classList.toggle('active', Number(step.dataset.step) === state.wizardStep);
    });
  }

  wizard?.addEventListener('click', (event) => {
    if (event.target.matches('[data-next]')) {
      state.wizardStep = Math.min(3, state.wizardStep + 1);
      renderWizard();
      if (state.wizardStep === 3) {
        drawPoster();
      }
    }
    if (event.target.matches('[data-prev]')) {
      state.wizardStep = Math.max(1, state.wizardStep - 1);
      renderWizard();
    }
  });

  function drawPoster() {
    const canvas = wizardCanvas;
    const ctx = canvas.getContext('2d');
    const width = canvas.width;
    const height = canvas.height;
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, width, height);
    ctx.fillStyle = '#3a6ff7';
    ctx.fillRect(0, 0, width, 120);
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 28px "Noto Sans TC"';
    ctx.fillText('LunchVote+ 掃描投票', 40, 80);
    ctx.fillStyle = '#222';
    ctx.font = '18px "Noto Sans TC"';
    ctx.fillText('老師 5 分鐘上線、每天省 20 分鐘統計', 40, 150);
    const date = getActiveDate();
    const url = `${location.origin}${location.pathname.replace('admin.html', '')}index.html?d=${date}`;
    drawPseudoQr(ctx, url, width - 260, height / 2 - 120, 220);
    ctx.fillText('掃描上方 QR 立即投票/點餐', 40, height - 80);
    ctx.fillText('讓午餐變簡單，一鍵投票、一鍵下單、一鍵交接', 40, height - 40);
  }

  function drawPseudoQr(ctx, text, x, y, size) {
    const bits = pseudoQrMatrix(text, 29);
    const cell = size / bits.length;
    ctx.fillStyle = '#000';
    bits.forEach((row, r) => {
      row.forEach((bit, c) => {
        if (bit) {
          ctx.fillRect(x + c * cell, y + r * cell, cell, cell);
        }
      });
    });
  }

  function pseudoQrMatrix(text, dimension) {
    const bits = Array.from({ length: dimension }, () => Array(dimension).fill(0));
    let hash = 0;
    for (let i = 0; i < text.length; i += 1) {
      hash = (hash * 33 + text.charCodeAt(i)) % 0xffffff;
    }
    for (let r = 0; r < dimension; r += 1) {
      for (let c = 0; c < dimension; c += 1) {
        const value = (hash + r * dimension + c * 7) % 37;
        bits[r][c] = value % 2 === 0 ? 1 : 0;
      }
    }
    // add finder patterns
    fillFinder(bits, 0, 0);
    fillFinder(bits, 0, dimension - 7);
    fillFinder(bits, dimension - 7, 0);
    return bits;
  }

  function fillFinder(bits, row, col) {
    for (let r = 0; r < 7; r += 1) {
      for (let c = 0; c < 7; c += 1) {
        const edge = r === 0 || c === 0 || r === 6 || c === 6;
        const inner = r >= 2 && r <= 4 && c >= 2 && c <= 4;
        bits[row + r][col + c] = edge || inner ? 1 : 0;
      }
    }
  }

  wizardDownloadBtn?.addEventListener('click', () => {
    const link = document.createElement('a');
    link.href = wizardCanvas.toDataURL('image/png');
    link.download = `LunchVote_poster_${getActiveDate()}.png`;
    link.click();
  });

  wizardStartBtn?.addEventListener('click', startWizard);

  whenReady().then(() => {
    populateSettings();
    renderNames();
    renderRestaurants();
    populateMenuSelector();
    populateMenuEditor();
    const settings = getSettings();
    if (!settings.baseDate || !getNames().length) {
      startWizard();
    }
  });

  pinForm?.addEventListener('submit', handlePinSubmit);
  showPinModal();
}
