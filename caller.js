import { getSettings, getActiveDate, getNames, getOrders, setPaymentStatus, generateLineSummary, generatePhoneSummary, exportOrdersCsv, lockOrder, checkPhaseChange } from './app.js';

document.addEventListener("DOMContentLoaded", async () => {
    await window.whenReady(); // 等待 app.js 初始化完成

    const dateDisplay = document.getElementById("date-display");
    const orderList = document.getElementById("order-list");
    const lineSummaryBtn = document.getElementById("line-summary-btn");
    const phoneSummaryBtn = document.getElementById("phone-summary-btn");
    const exportCsvBtn = document.getElementById("export-csv-btn");
    const lockOrderBtn = document.getElementById("lock-order-btn");
    const summaryTextarea = document.getElementById("summary-textarea");

    const activeDate = getActiveDate();

    function renderCallerPage() {
        if (!activeDate) {
            dateDisplay.textContent = "尚未設定基準日期";
            return;
        }

        dateDisplay.textContent = `今日戰報：${activeDate}`;

        const orders = getOrders(activeDate);
        const names = getNames();
        orderList.innerHTML = "";

        if (names.length === 0) {
            orderList.innerHTML = '<tr><td colspan="4">尚未設定名單</td></tr>';
            return;
        }

        names.forEach(name => {
            const order = orders[name];
            const tr = document.createElement("tr");

            const itemsText = order?.items.map(item => `${item.name} x${item.qty}`).join(", ") || "尚未點餐";
            const subtotal = order?.subtotal || 0;
            const isPaid = order?.paid || false;

            tr.innerHTML = `
                <td>${name}</td>
                <td>${itemsText}</td>
                <td>$${subtotal}</td>
                <td>
                    <div class="form-check form-switch">
                        <input class="form-check-input payment-status" type="checkbox" role="switch" data-name="${name}" ${isPaid ? "checked" : ""}>
                        <label class="form-check-label">${isPaid ? "已付" : "未付"}</label>
                    </div>
                </td>
            `;
            orderList.appendChild(tr);
        });

        // Add event listeners to new checkboxes
        document.querySelectorAll(".payment-status").forEach(checkbox => {
            checkbox.addEventListener("change", (e) => {
                const name = e.target.dataset.name;
                const isPaid = e.target.checked;
                setPaymentStatus(activeDate, name, isPaid);
                // No need to re-render the whole page, just update the label
                const label = e.target.nextElementSibling;
                label.textContent = isPaid ? "已付" : "未付";
            });
        });
    }

    lineSummaryBtn.addEventListener("click", () => {
        const summary = generateLineSummary(activeDate);
        summaryTextarea.value = summary;
    });

    phoneSummaryBtn.addEventListener("click", () => {
        const summary = generatePhoneSummary(activeDate);
        summaryTextarea.value = summary;
    });

    exportCsvBtn.addEventListener("click", () => {
        exportOrdersCsv(activeDate);
    });

    lockOrderBtn.addEventListener("click", () => {
        if (confirm("確定要鎖定今日訂單嗎？鎖定後將無法再修改。")) {
            lockOrder();
            alert("訂單已鎖定！");
            // Disable buttons after locking
            lockOrderBtn.disabled = true;
            document.querySelectorAll(".payment-status").forEach(cb => cb.disabled = true);
        }
    });

    // Initial render
    renderCallerPage();

    // Listen for updates from app.js
    window.addEventListener("lunchvote:update", renderCallerPage);
    
    // Initial check for phase change
    checkPhaseChange();
});

