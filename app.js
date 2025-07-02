document.addEventListener('DOMContentLoaded', function () {
    const incomeInput = document.getElementById('income');
    const expensesContainer = document.getElementById('expenses-container');
    const addExpenseBtn = document.getElementById('add-expense');
    const calculateBtn = document.getElementById('calculate');
    const totalExpensesEl = document.getElementById('total-expenses');
    const remainingBalanceEl = document.getElementById('remaining-balance');
    const warningEl = document.getElementById('warning');
    const budgetForm = document.getElementById('budget-form');
    const chartCanvas = document.getElementById('expenses-chart');
    let chart = null;
    let categoryBudgets = {};
    let spendingHistory = JSON.parse(localStorage.getItem('spendingHistory') || '{}');
    let reminders = JSON.parse(localStorage.getItem('reminders') || '[]');
    const remindersSection = document.getElementById('reminders-section');
    const reminderForm = document.getElementById('reminder-form');
    const remindersList = document.getElementById('reminders-list');
    let goals = JSON.parse(localStorage.getItem('goals') || '[]');
    const goalsSection = document.getElementById('goals-section');
    const goalForm = document.getElementById('goal-form');
    const goalsList = document.getElementById('goals-list');
    let trendsChart = null;

    function formatCurrency(value) {
        return 'ETB ' + Number(value).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    }

    function addExpenseRow(category = '', amount = '', recurring = false) {
        const row = document.createElement('div');
        row.className = 'expense-row';
        row.innerHTML = `
            <input type="text" class="expense-category" placeholder="Category (e.g., Rent)" required value="${category}">
            <input type="number" class="expense-amount" min="0" step="0.01" placeholder="Amount" required value="${amount}">
            <label class="recurring-label"><input type="checkbox" class="expense-recurring" ${recurring ? 'checked' : ''}> Recurring</label>
            <button type="button" class="remove-expense" title="Remove">&times;</button>
        `;
        expensesContainer.appendChild(row);
        row.querySelector('.remove-expense').addEventListener('click', () => {
            row.remove();
            updateChart();
            updateCategoryBudgetsUI();
        });
        row.querySelector('.expense-amount').addEventListener('input', () => {
            updateChart();
            updateCategoryBudgetsUI();
        });
        row.querySelector('.expense-category').addEventListener('input', () => {
            updateChart();
            updateCategoryBudgetsUI();
        });
        row.querySelector('.expense-recurring').addEventListener('change', () => {
            updateChart();
        });
    }

    function getExpenses() {
        const rows = expensesContainer.querySelectorAll('.expense-row');
        const expenses = [];
        rows.forEach(row => {
            const category = row.querySelector('.expense-category').value.trim();
            const amount = parseFloat(row.querySelector('.expense-amount').value);
            const recurring = row.querySelector('.expense-recurring').checked;
            if (category && !isNaN(amount) && amount > 0) {
                expenses.push({ category, amount, recurring });
            }
        });
        return expenses;
    }

    function updateCategoryBudgetsUI() {
        const container = document.getElementById('category-budgets-list');
        container.innerHTML = '';
        const expenses = getExpenses();
        const categories = [...new Set(expenses.map(e => e.category))];
        categories.forEach(cat => {
            const row = document.createElement('div');
            row.className = 'category-budget-row';
            row.innerHTML = `
                <label>${cat}</label>
                <input type="number" class="category-budget-input" data-category="${cat}" min="0" step="0.01" value="${categoryBudgets[cat] || ''}" placeholder="Budget">
            `;
            container.appendChild(row);
            row.querySelector('.category-budget-input').addEventListener('input', (e) => {
                categoryBudgets[cat] = parseFloat(e.target.value) || 0;
                updateCategoryBudgetsUI();
            });
            const spent = expenses.filter(e => e.category === cat).reduce((sum, e) => sum + e.amount, 0);
            if (categoryBudgets[cat]) {
                const progress = document.createElement('div');
                progress.className = 'category-progress';
                const percent = Math.min(100, (spent / categoryBudgets[cat]) * 100);
                progress.innerHTML = `<div class="category-progress-bar" style="width:${percent}%;background:${percent>=100?'#f44336':'#2a3b8f'}"></div>`;
                row.appendChild(progress);
            }
        });
    }

    function saveSpendingHistory(month, total) {
        spendingHistory[month] = total;
        localStorage.setItem('spendingHistory', JSON.stringify(spendingHistory));
    }

    function updateTrendsChart() {
        const ctx = document.getElementById('trends-chart').getContext('2d');
        const months = Object.keys(spendingHistory).sort();
        const data = months.map(m => spendingHistory[m]);
        if (!trendsChart) {
            trendsChart = new Chart(ctx, {
                type: 'bar',
                data: {
                    labels: months,
                    datasets: [{
                        label: 'Total Spending',
                        data: data,
                        backgroundColor: '#2a3b8f',
                    }]
                },
                options: {
                    responsive: true,
                    plugins: {
                        legend: { display: false },
                    },
                    scales: {
                        y: { beginAtZero: true }
                    }
                }
            });
        } else {
            trendsChart.data.labels = months;
            trendsChart.data.datasets[0].data = data;
            trendsChart.update();
        }
    }

    function calculateBudget(e) {
        if (e) e.preventDefault();
        const income = parseFloat(incomeInput.value);
        if (isNaN(income) || income < 0) {
            incomeInput.classList.add('input-error');
            return;
        } else {
            incomeInput.classList.remove('input-error');
        }
        const expenses = getExpenses();
        let totalExpenses = 0;
        let valid = true;
        expensesContainer.querySelectorAll('.expense-row').forEach(row => {
            const amountInput = row.querySelector('.expense-amount');
            const amount = parseFloat(amountInput.value);
            if (isNaN(amount) || amount < 0) {
                amountInput.classList.add('input-error');
                valid = false;
            } else {
                amountInput.classList.remove('input-error');
            }
        });
        if (!valid) return;
        expenses.forEach(exp => totalExpenses += exp.amount);
        const remaining = income - totalExpenses;
        totalExpensesEl.textContent = formatCurrency(totalExpenses);
        remainingBalanceEl.textContent = formatCurrency(remaining);
        if (remaining < 0) {
            warningEl.style.display = 'block';
            warningEl.style.opacity = 1;
        } else {
            warningEl.style.opacity = 0;
            setTimeout(() => { warningEl.style.display = 'none'; }, 300);
        }
        updateChart();
        updateCategoryBudgetsUI();
        const now = new Date();
        const monthKey = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}`;
        saveSpendingHistory(monthKey, totalExpenses);
        updateTrendsChart();
        renderReminders();
        renderGoals();
    }

    function updateChart() {
        const expenses = getExpenses();
        const labels = expenses.map(e => e.category);
        const data = expenses.map(e => e.amount);
        if (!chart) {
            chart = new Chart(chartCanvas, {
                type: 'pie',
                data: {
                    labels: labels,
                    datasets: [{
                        data: data,
                        backgroundColor: [
                            '#2a3b8f', '#f44336', '#ff9800', '#4caf50', '#00bcd4', '#9c27b0', '#607d8b', '#ffc107', '#e91e63', '#8bc34a'
                        ],
                        borderWidth: 1
                    }]
                },
                options: {
                    responsive: true,
                    animation: {
                        animateRotate: true,
                        animateScale: true,
                        duration: 800,
                        easing: 'easeInOutQuart'
                    },
                    plugins: {
                        legend: {
                            display: true,
                            position: 'bottom',
                            labels: {
                                color: '#222',
                                font: { size: 14 }
                            }
                        },
                        tooltip: {
                            callbacks: {
                                label: function(context) {
                                    const label = context.label || '';
                                    const value = context.parsed || 0;
                                    return `${label}: ETB ${value.toLocaleString(undefined, {minimumFractionDigits:2})}`;
                                }
                            }
                        }
                    }
                }
            });
        } else {
            chart.data.labels = labels;
            chart.data.datasets[0].data = data;
            chart.update();
        }
    }

    addExpenseBtn.addEventListener('click', function () {
        addExpenseRow();
    });

    budgetForm.addEventListener('submit', calculateBudget);
    incomeInput.addEventListener('input', updateChart);

    addExpenseRow();
    updateChart();
    updateCategoryBudgetsUI();
    updateTrendsChart();

    function renderReminders() {
        remindersList.innerHTML = '';
        const now = new Date();
        reminders.forEach((rem, idx) => {
            const li = document.createElement('li');
            const dueDate = new Date(rem.date);
            const daysLeft = Math.ceil((dueDate - now) / (1000*60*60*24));
            li.innerHTML = `<span>${rem.name} - ${formatCurrency(rem.amount)} - <span${daysLeft <= 3 ? ' class="reminder-due-soon"' : ''}>${rem.date}${daysLeft <= 3 ? ' (Due Soon!)' : ''}</span></span><button data-idx="${idx}" class="remove-reminder">&times;</button>`;
            remindersList.appendChild(li);
        });
        remindersList.querySelectorAll('.remove-reminder').forEach(btn => {
            btn.addEventListener('click', e => {
                reminders.splice(parseInt(btn.dataset.idx), 1);
                localStorage.setItem('reminders', JSON.stringify(reminders));
                renderReminders();
            });
        });
    }
    reminderForm.addEventListener('submit', e => {
        e.preventDefault();
        const name = document.getElementById('reminder-name').value.trim();
        const date = document.getElementById('reminder-date').value;
        const amount = parseFloat(document.getElementById('reminder-amount').value);
        if (!name || !date || isNaN(amount) || amount <= 0) return;
        reminders.push({ name, date, amount });
        localStorage.setItem('reminders', JSON.stringify(reminders));
        reminderForm.reset();
        renderReminders();
    });
    renderReminders();

    function renderGoals() {
        goalsList.innerHTML = '';
        goals.forEach((goal, idx) => {
            const income = parseFloat(incomeInput.value) || 0;
            const expenses = getExpenses();
            const totalExpenses = expenses.reduce((sum, e) => sum + e.amount, 0);
            const saved = Math.max(0, income - totalExpenses);
            const percent = Math.min(100, (saved / goal.target) * 100);
            const li = document.createElement('li');
            li.innerHTML = `<span>${goal.name} - Target: ${formatCurrency(goal.target)}</span><button data-idx="${idx}" class="remove-goal">&times;</button>`;
            const progress = document.createElement('div');
            progress.className = 'goal-progress';
            progress.innerHTML = `<div class="goal-progress-bar" style="width:${percent}%;background:${percent>=100?'#4caf50':'#2a3b8f'}"></div>`;
            li.appendChild(progress);
            goalsList.appendChild(li);
        });
        goalsList.querySelectorAll('.remove-goal').forEach(btn => {
            btn.addEventListener('click', e => {
                goals.splice(parseInt(btn.dataset.idx), 1);
                localStorage.setItem('goals', JSON.stringify(goals));
                renderGoals();
            });
        });
    }
    goalForm.addEventListener('submit', e => {
        e.preventDefault();
        const name = document.getElementById('goal-name').value.trim();
        const target = parseFloat(document.getElementById('goal-target').value);
        if (!name || isNaN(target) || target <= 0) return;
        goals.push({ name, target });
        localStorage.setItem('goals', JSON.stringify(goals));
        goalForm.reset();
        renderGoals();
    });
    renderGoals();

    function exportCSV() {
        const expenses = getExpenses();
        let csv = 'Category,Amount (ETB),Recurring\n';
        expenses.forEach(e => {
            csv += `${e.category},${e.amount},${e.recurring ? 'Yes' : 'No'}\n`;
        });
        csv += '\n';
        csv += 'Reminders\nName,Date,Amount (ETB)\n';
        reminders.forEach(r => {
            csv += `${r.name},${r.date},${r.amount}\n`;
        });
        csv += '\n';
        csv += 'Goals\nName,Target (ETB)\n';
        goals.forEach(g => {
            csv += `${g.name},${g.target}\n`;
        });
        csv += '\n';
        csv += 'Spending History\nMonth,Total (ETB)\n';
        Object.keys(spendingHistory).forEach(month => {
            csv += `${month},${spendingHistory[month]}\n`;
        });
        const blob = new Blob([csv], { type: 'text/csv' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'budget_data.csv';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }
    document.getElementById('export-csv').addEventListener('click', exportCSV);

    function exportExcel() {
        const expenses = getExpenses();
        const ws_data = [
            ['Category', 'Amount (ETB)', 'Recurring'],
            ...expenses.map(e => [e.category, e.amount, e.recurring ? 'Yes' : 'No'])
        ];
        ws_data.push([]);
        ws_data.push(['Reminders']);
        ws_data.push(['Name', 'Date', 'Amount (ETB)']);
        reminders.forEach(r => ws_data.push([r.name, r.date, r.amount]));
        ws_data.push([]);
        ws_data.push(['Goals']);
        ws_data.push(['Name', 'Target (ETB)']);
        goals.forEach(g => ws_data.push([g.name, g.target]));
        ws_data.push([]);
        ws_data.push(['Spending History']);
        ws_data.push(['Month', 'Total (ETB)']);
        Object.keys(spendingHistory).forEach(month => ws_data.push([month, spendingHistory[month]]));
        const ws = XLSX.utils.aoa_to_sheet(ws_data);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'Budget Data');
        XLSX.writeFile(wb, 'budget_data.xlsx');
    }
    document.getElementById('export-excel').addEventListener('click', exportExcel);

    function exportPDF() {
        const doc = new jsPDF();
        let y = 10;
        doc.setFontSize(14);
        doc.text('Budget Data', 10, y);
        y += 8;
        doc.setFontSize(11);
        doc.text('Expenses:', 10, y);
        y += 6;
        const expenses = getExpenses();
        expenses.forEach(e => {
            doc.text(`${e.category} - ETB ${e.amount} - ${e.recurring ? 'Recurring' : 'One-time'}`, 12, y);
            y += 6;
        });
        y += 4;
        doc.text('Reminders:', 10, y);
        y += 6;
        reminders.forEach(r => {
            doc.text(`${r.name} - ETB ${r.amount} - ${r.date}`, 12, y);
            y += 6;
        });
        y += 4;
        doc.text('Goals:', 10, y);
        y += 6;
        goals.forEach(g => {
            doc.text(`${g.name} - Target: ETB ${g.target}`, 12, y);
            y += 6;
        });
        y += 4;
        doc.text('Spending History:', 10, y);
        y += 6;
        Object.keys(spendingHistory).forEach(month => {
            doc.text(`${month}: ETB ${spendingHistory[month]}`, 12, y);
            y += 6;
        });
        doc.save('budget_data.pdf');
    }
    document.getElementById('export-pdf').addEventListener('click', exportPDF);
}); 