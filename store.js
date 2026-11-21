/**
 * store.js - Client-Side Store for SpendWise
 * Production-grade localStorage persistence.
 * Starts CLEAN (zero pre-filled dummy transactions) so you can test real-time logging yourself.
 * Currency default: Indian Rupee (₹).
 */

const STORAGE_KEYS = {
    USER: 'spendwise_user_profile_v2',
    TRANSACTIONS: 'spendwise_transactions_v2',
    NOTIFICATIONS: 'spendwise_notifications_v2'
};

const DEFAULT_CATEGORIES = [
    'Food & Dining', 'Shopping', 'Housing & Utilities', 'Transportation',
    'Entertainment', 'Health & Medical', 'Subscriptions', 'Personal Care',
    'Travel', 'Education', 'Salary', 'Freelance & Side Gigs', 'Investments',
    'Cashback & Refunds', 'Other Expense', 'Other Income'
];

function getStoredUser() {
    const raw = localStorage.getItem(STORAGE_KEYS.USER);
    if (raw) {
        try { return JSON.parse(raw); } catch (e) {}
    }
    const defaultUser = {
        username: 'Sunny',
        email: 'user@spendwise.app',
        currency: '₹',
        monthly_budget: 50000.0,
        alert_threshold: 80,
        high_contrast: false,
        font_size: 'normal'
    };
    localStorage.setItem(STORAGE_KEYS.USER, JSON.stringify(defaultUser));
    return defaultUser;
}

function saveUser(user) {
    localStorage.setItem(STORAGE_KEYS.USER, JSON.stringify(user));
}

function getStoredTransactions() {
    const raw = localStorage.getItem(STORAGE_KEYS.TRANSACTIONS);
    if (raw) {
        try {
            const list = JSON.parse(raw);
            if (Array.isArray(list)) return list;
        } catch (e) {}
    }
    return [];
}

function saveTransactions(txs) {
    localStorage.setItem(STORAGE_KEYS.TRANSACTIONS, JSON.stringify(txs));
}

function getStoredNotifications() {
    const raw = localStorage.getItem(STORAGE_KEYS.NOTIFICATIONS);
    if (raw) {
        try { return JSON.parse(raw); } catch (e) {}
    }
    return [];
}

function saveNotifications(notifs) {
    localStorage.setItem(STORAGE_KEYS.NOTIFICATIONS, JSON.stringify(notifs));
}

function formatCurrency(amount, currency = '₹') {
    const num = Math.abs(parseFloat(amount) || 0);
    const formatted = num.toLocaleString('en-IN', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
    });
    return `${currency}${formatted}`;
}

const Store = {
    getUser() {
        return getStoredUser();
    },

    setUser(user) {
        saveUser(user);
    },

    getTransactions(filter = {}) {
        let txs = getStoredTransactions();

        if (filter.type && filter.type !== 'all') {
            txs = txs.filter(t => t.type === filter.type);
        }
        if (filter.category && filter.category !== 'all') {
            txs = txs.filter(t => t.category === filter.category);
        }
        if (filter.month) {
            txs = txs.filter(t => t.date && t.date.startsWith(filter.month));
        }
        if (filter.search) {
            const q = filter.search.toLowerCase();
            txs = txs.filter(t => 
                (t.merchant && t.merchant.toLowerCase().includes(q)) ||
                (t.note && t.note.toLowerCase().includes(q)) ||
                (t.category && t.category.toLowerCase().includes(q))
            );
        }

        // Sort descending by date, then ID
        txs.sort((a, b) => {
            if (b.date === a.date) return b.id - a.id;
            return b.date.localeCompare(a.date);
        });

        return txs;
    },

    addTransaction(tx) {
        const txs = getStoredTransactions();
        const user = getStoredUser();

        const newId = txs.length > 0 ? Math.max(...txs.map(t => t.id || 0)) + 1 : 1;
        const newTx = {
            id: newId,
            amount: parseFloat(tx.amount || 0),
            type: tx.type || 'expense',
            category: tx.category || 'Other Expense',
            merchant: tx.merchant || tx.category || 'Expense',
            note: tx.note || '',
            payment_method: tx.payment_method || 'UPI',
            date: tx.date || formatDateISO(new Date()),
            is_recurring: !!tx.is_recurring,
            tags: tx.tags || '',
            created_at: new Date().toISOString()
        };

        txs.unshift(newTx);
        saveTransactions(txs);

        // Check budget thresholds
        if (newTx.type === 'expense') {
            const currentMonth = newTx.date.slice(0, 7);
            const stats = this.getStats(currentMonth);
            if (stats.spent_percent >= 100) {
                this.addNotification({
                    type: 'budget_warning',
                    title: 'Monthly Limit Exceeded',
                    message: `Recent ${user.currency}${newTx.amount.toFixed(2)} at ${newTx.merchant} pushed spending to ${user.currency}${stats.total_expense.toFixed(2)} (${stats.spent_percent}% of budget).`
                });
            } else if (stats.spent_percent >= user.alert_threshold) {
                this.addNotification({
                    type: 'budget_warning',
                    title: 'Approaching Spending Limit',
                    message: `You have reached ${stats.spent_percent}% of your monthly limit (${user.currency}${stats.total_expense.toFixed(2)} / ${user.currency}${user.monthly_budget.toFixed(2)}).`
                });
            }
        }

        return newTx;
    },

    deleteTransaction(id) {
        let txs = getStoredTransactions();
        txs = txs.filter(t => t.id !== parseInt(id));
        saveTransactions(txs);
        return true;
    },

    getStats(selectedMonth) {
        const user = getStoredUser();
        const now = new Date();
        const monthStr = selectedMonth || formatDateISO(now).slice(0, 7);

        const parts = monthStr.split('-');
        const selYear = parseInt(parts[0]);
        const selMonth = parseInt(parts[1]);
        const daysInMonth = new Date(selYear, selMonth, 0).getDate();

        let dayOfMonth = 1;
        if (selYear === now.getFullYear() && selMonth === (now.getMonth() + 1)) {
            dayOfMonth = now.getDate();
        } else if (selYear < now.getFullYear() || (selYear === now.getFullYear() && selMonth < (now.getMonth() + 1))) {
            dayOfMonth = daysInMonth;
        }

        const txs = getStoredTransactions();
        const monthTxs = txs.filter(t => t.date && t.date.startsWith(monthStr));

        let totalIncome = 0;
        let totalExpense = 0;
        const categoryMap = {};
        const dailySpending = {};

        monthTxs.forEach(t => {
            const amt = parseFloat(t.amount || 0);
            if (t.type === 'income') {
                totalIncome += amt;
            } else {
                totalExpense += amt;
                categoryMap[t.category] = (categoryMap[t.category] || 0) + amt;
                dailySpending[t.date] = (dailySpending[t.date] || 0) + amt;
            }
        });

        const categoriesBreakdown = Object.entries(categoryMap).map(([cat, total]) => ({
            category: cat,
            total: Math.round(total * 100) / 100
        })).sort((a, b) => b.total - a.total);

        // Subscriptions calculation
        const allSubs = txs.filter(t => t.is_recurring && t.type === 'expense');
        const monthlySubs = allSubs.reduce((acc, s) => acc + parseFloat(s.amount || 0), 0);
        const annualSubs = monthlySubs * 12;

        const monthlyBudget = parseFloat(user.monthly_budget || 50000.0);
        const alertThreshold = parseInt(user.alert_threshold || 80);

        const spentPercent = monthlyBudget > 0 ? Math.round((totalExpense / monthlyBudget) * 1000) / 10 : 0;
        const timeElapsedPercent = Math.round((dayOfMonth / daysInMonth) * 1000) / 10;
        const remainingBudget = Math.max(0, monthlyBudget - totalExpense);
        const remainingDays = Math.max(1, daysInMonth - dayOfMonth + 1);
        const safeDailySpend = Math.round((remainingBudget / remainingDays) * 100) / 100;

        const dailyAvg = totalExpense / Math.max(1, dayOfMonth);
        const projectedSpend = Math.round((dailyAvg * daysInMonth) * 100) / 100;
        const projectedDiff = Math.round((projectedSpend - monthlyBudget) * 100) / 100;

        let pacingStatus = 'healthy';
        if (spentPercent >= 100) {
            pacingStatus = 'exceeded';
        } else if (spentPercent >= alertThreshold) {
            pacingStatus = 'warning';
        } else if (spentPercent > (timeElapsedPercent + 15) && totalExpense > 0) {
            pacingStatus = 'fast_burn';
        }

        return {
            currency: user.currency || '₹',
            total_income: Math.round(totalIncome * 100) / 100,
            total_expense: Math.round(totalExpense * 100) / 100,
            net_savings: Math.round((totalIncome - totalExpense) * 100) / 100,
            monthly_budget: monthlyBudget,
            alert_threshold: alertThreshold,
            spent_percent: spentPercent,
            time_elapsed_percent: timeElapsedPercent,
            day_of_month: dayOfMonth,
            days_in_month: daysInMonth,
            remaining_budget: remainingBudget,
            remaining_days: remainingDays,
            safe_daily_spend: safeDailySpend,
            projected_spend: projectedSpend,
            projected_diff: projectedDiff,
            pacing_status: pacingStatus,
            categories_breakdown: categoriesBreakdown,
            daily_spending: dailySpending,
            monthly_subscriptions: monthlySubs,
            annual_subscriptions: annualSubs,
            selected_month: monthStr,
            has_transactions: txs.length > 0
        };
    },

    getSubscriptions() {
        const txs = getStoredTransactions();
        const subs = txs.filter(t => t.is_recurring && t.type === 'expense');
        const totalMonthly = subs.reduce((a, b) => a + parseFloat(b.amount || 0), 0);
        return {
            subscriptions: subs,
            total_monthly: Math.round(totalMonthly * 100) / 100,
            total_annual: Math.round((totalMonthly * 12) * 100) / 100
        };
    },

    getLifetimeStats() {
        const txs = getStoredTransactions();
        let totalOut = 0;
        let totalIn = 0;
        let subsCount = 0;

        txs.forEach(t => {
            const a = parseFloat(t.amount || 0);
            if (t.type === 'income') totalIn += a;
            else totalOut += a;
            if (t.is_recurring && t.type === 'expense') subsCount++;
        });

        return {
            total_count: txs.length,
            total_outflow: totalOut,
            total_inflow: totalIn,
            net_lifetime: totalIn - totalOut,
            subscriptions_count: subsCount
        };
    },

    getNotifications() {
        return getStoredNotifications();
    },

    addNotification(notif) {
        const list = getStoredNotifications();
        const newNotif = {
            id: Date.now(),
            type: notif.type || 'tip',
            title: notif.title || 'Notification',
            message: notif.message || '',
            is_read: false,
            created_at: new Date().toISOString()
        };
        list.unshift(newNotif);
        saveNotifications(list);
    },

    markNotificationsRead() {
        const list = getStoredNotifications();
        list.forEach(n => n.is_read = true);
        saveNotifications(list);
    },

    exportCSV() {
        const txs = getStoredTransactions();
        if (txs.length === 0) {
            alert('No transactions recorded yet to export.');
            return;
        }

        const headers = ['Date', 'Type', 'Category', 'Merchant / Payee', 'Amount', 'Payment Method', 'Recurring Subscription', 'Note'];
        const rows = txs.map(t => [
            t.date,
            t.type.toUpperCase(),
            `"${(t.category || '').replace(/"/g, '""')}"`,
            `"${(t.merchant || '').replace(/"/g, '""')}"`,
            parseFloat(t.amount || 0).toFixed(2),
            t.payment_method || 'UPI',
            t.is_recurring ? 'Yes' : 'No',
            `"${(t.note || '').replace(/"/g, '""')}"`
        ]);

        const csvContent = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `spendwise_ledger_${formatDateISO(new Date()).replace(/-/g, '')}.csv`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    },

    exportBackupJSON() {
        const data = {
            version: '2.0',
            exported_at: new Date().toISOString(),
            user: getStoredUser(),
            transactions: getStoredTransactions(),
            notifications: getStoredNotifications()
        };
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `spendwise_backup_${formatDateISO(new Date()).replace(/-/g, '')}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    },

    importBackupJSON(jsonStr) {
        try {
            const parsed = JSON.parse(jsonStr);
            if (parsed.user) saveUser(parsed.user);
            if (Array.isArray(parsed.transactions)) saveTransactions(parsed.transactions);
            if (Array.isArray(parsed.notifications)) saveNotifications(parsed.notifications);
            return true;
        } catch (e) {
            console.error('Import failed', e);
            return false;
        }
    },

    clearAllData() {
        localStorage.removeItem(STORAGE_KEYS.TRANSACTIONS);
        localStorage.removeItem(STORAGE_KEYS.NOTIFICATIONS);
    }
};
