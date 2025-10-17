import { getActiveDate, getOrders, getNames, getRestaurants, getVoteSummary } from './app.js';

document.addEventListener("DOMContentLoaded", async () => {
    await window.whenReady(); // 等待 app.js 初始化完成

    const dashboardSection = document.querySelector("[data-page=\"dashboard\"]");
    if (!dashboardSection) return;

    const dateDisplay = document.getElementById("dashboard-date-display");
    const voteSummaryList = document.getElementById("vote-summary-list");
    const orderSummaryList = document.getElementById("order-summary-list");
    const totalSalesDisplay = document.getElementById("total-sales");
    const unpaidCountDisplay = document.getElementById("unpaid-count");

    function renderDashboard() {
        const activeDate = getActiveDate();
        if (!activeDate) {
            dateDisplay.textContent = "尚未設定基準日期";
            return;
        }
        dateDisplay.textContent = `儀表板 - ${activeDate}`;

        // Render Vote Summary
        voteSummaryList.innerHTML = \'\';
        const voteSummary = getVoteSummary(activeDate);
        if (voteSummary.length === 0) {
            voteSummaryList.innerHTML = \'<li class="list-group-item">今日尚未有投票記錄。</li>\';
        } else {
            voteSummary.sort((a, b) => b.count - a.count).forEach(summary => {
                const li = document.createElement(\'li\');
                li.className = \'list-group-item d-flex justify-content-between align-items-center\';
                li.innerHTML = `
                    ${summary.name}
                    <span class="badge bg-primary rounded-pill">${summary.count} 票</span>
                `;
                voteSummaryList.appendChild(li);
            });
        }

        // Render Order Summary
        orderSummaryList.innerHTML = \'\';
        const orders = getOrders(activeDate);
        const names = getNames();
        const restaurants = getRestaurants();
        let totalSales = 0;
        let unpaidCount = 0;

        if (names.length === 0) {
            orderSummaryList.innerHTML = \'<li class="list-group-item">尚未設定名單。</li>\';
        } else {
            names.forEach(name => {
                const order = orders[name];
                const li = document.createElement(\'li\');
                li.className = \'list-group-item d-flex justify-content-between align-items-center\';

                if (order && order.items.length > 0) {
                    const restaurantName = restaurants.find(r => r.id === order.restaurantId)?.name || \'未知餐廳\';
                    const itemsText = order.items.map(item => `${item.name} x${item.qty}`).join(\'、\');
                    li.innerHTML = `
                        ${name} - ${restaurantName}: ${itemsText} ($${order.subtotal || 0})
                        <span class="badge bg-${order.paid ? \'success\' : \'danger\'} rounded-pill">${order.paid ? \'已付款\' : \'未付款\'}</span>
                    `;
                    totalSales += order.subtotal || 0;
                    if (!order.paid) unpaidCount++;
                } else {
                    li.innerHTML = `
                        ${name}: 尚未點餐
                        <span class="badge bg-secondary rounded-pill">無訂單</span>
                    `;
                }
                orderSummaryList.appendChild(li);
            });
        }
        totalSalesDisplay.textContent = `$${totalSales}`;
        unpaidCountDisplay.textContent = `${unpaidCount} 人`;
    }

    // Listen for updates from app.js
    window.addEventListener(\'lunchvote:update\', renderDashboard);

    // Initial render
    renderDashboard();
});

