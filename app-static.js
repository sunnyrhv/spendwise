/**
 * app-static.js - SpendWise Application Controller
 * Minimalist, high-performance, accessible fintech architecture.
 * Default: Indian Rupee (₹). Starts clean.
 */

let speechRecognitionInstance = null;
let isRecordingVoice = false;
let currentStagedTx = null;
let categoryChartInstance = null;
let velocityChartInstance = null;
let searchDebounceTimeout = null;

const CATEGORY_COLORS = [
    '#6366f1', '#ec4899', '#f97316', '#06b6d4', 
    '#8b5cf6', '#10b981', '#eab308', '#ef4444', 
    '#14b8a6', '#64748b', '#3b82f6', '#f43f5e'
];

document.addEventListener('DOMContentLoaded', () => {
    initThemeAndA11y();
    initKeyboardShortcuts();
    initSpeechRecognition();
    populateMonthSelector();
    populateCategoryDropdowns();
    renderUserHeader();
    refreshAllDashboard();

    const manDate = document.getElementById('man-date');
    if (manDate) manDate.value = formatDateISO(new Date());
});

// ==================== TOAST NOTIFICATIONS ====================
function showToast(message, type = 'success') {
    const container = document.getElementById('toast-container');
    if (!container) return;

    const toast = document.createElement('div');
    const isError = type === 'error';
    toast.className = `flex items-center gap-2 px-3.5 py-2.5 rounded-lg text-xs font-medium shadow-lg border transition-all duration-300 transform translate-y-2 opacity-0 ${
        isError 
        ? 'bg-rose-50 text-rose-800 border-rose-200 dark:bg-rose-950 dark:text-rose-200 dark:border-rose-900' 
        : 'bg-slate-900 text-white border-slate-800 dark:bg-white dark:text-slate-900 dark:border-zinc-200'
    }`;
    toast.innerHTML = `
        <i class="fa-solid ${isError ? 'fa-circle-exclamation text-rose-500' : 'fa-circle-check text-emerald-400'}"></i>
        <span>${escapeHtml(message)}</span>
    `;

    container.appendChild(toast);
    requestAnimationFrame(() => {
        toast.classList.remove('translate-y-2', 'opacity-0');
    });

    setTimeout(() => {
        toast.classList.add('opacity-0', 'translate-y-1');
        setTimeout(() => toast.remove(), 300);
    }, 3500);
}

// ==================== THEME & ACCESSIBILITY ====================
function initThemeAndA11y() {
    const savedTheme = localStorage.getItem('spendwise-theme');
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    if (savedTheme === 'dark' || (!savedTheme && prefersDark)) {
        document.documentElement.classList.add('dark');
    }

    const contrastBtn = document.getElementById('contrast-toggle-btn');
    if (localStorage.getItem('spendwise-contrast') === 'true') {
        document.documentElement.classList.add('high-contrast');
    }
    if (contrastBtn) {
        contrastBtn.addEventListener('click', () => {
            const active = document.documentElement.classList.toggle('high-contrast');
            localStorage.setItem('spendwise-contrast', active);
            announceToSR(active ? 'High contrast enabled' : 'High contrast disabled');
        });
    }

    const fontSizeBtn = document.getElementById('font-size-btn');
    applyFontSize(localStorage.getItem('spendwise-font-size') || 'normal');
    if (fontSizeBtn) fontSizeBtn.addEventListener('click', cycleFontSize);

    const themeBtn = document.getElementById('theme-toggle-btn');
    if (themeBtn) themeBtn.addEventListener('click', toggleTheme);
}

function toggleTheme() {
    const isDark = document.documentElement.classList.toggle('dark');
    localStorage.setItem('spendwise-theme', isDark ? 'dark' : 'light');
    announceToSR(isDark ? 'Dark theme enabled' : 'Light theme enabled');
    refreshCharts();
}

function cycleFontSize() {
    let next = 'normal';
    if (document.documentElement.classList.contains('font-large')) next = 'xlarge';
    else if (document.documentElement.classList.contains('font-xlarge')) next = 'normal';
    else next = 'large';
    applyFontSize(next);
    localStorage.setItem('spendwise-font-size', next);
}

function applyFontSize(size) {
    document.documentElement.classList.remove('font-large', 'font-xlarge');
    const label = document.getElementById('font-size-label');
    if (size === 'large') {
        document.documentElement.classList.add('font-large');
        if (label) label.textContent = 'A+';
    } else if (size === 'xlarge') {
        document.documentElement.classList.add('font-xlarge');
        if (label) label.textContent = 'A++';
    } else {
        if (label) label.textContent = 'A';
    }
}

function announceToSR(msg) {
    const el = document.getElementById('sr-announcer');
    if (el) el.textContent = msg;
}

// ==================== KEYBOARD SHORTCUTS ====================
function initKeyboardShortcuts() {
    window.addEventListener('keydown', (e) => {
        const tag = (e.target.tagName || '').toLowerCase();
        if (tag === 'input' || tag === 'textarea' || tag === 'select') {
            if (e.key === 'Escape') {
                e.target.blur();
                dismissStaged();
            }
            return;
        }

        if (e.key === '?') {
            e.preventDefault();
            toggleKeyboardModal(true);
        } else if (e.key === 'n' || e.key === 'N') {
            e.preventDefault();
            switchAddMode('nlp');
            document.getElementById('nlp-input')?.focus();
        } else if (e.key === 'v' || e.key === 'V') {
            e.preventDefault();
            switchAddMode('nlp');
            toggleVoiceSpeech();
        } else if (e.key === 's' || e.key === 'S') {
            e.preventDefault();
            switchAddMode('sms');
            document.getElementById('sms-input')?.focus();
        } else if (e.key === '/') {
            e.preventDefault();
            document.getElementById('tx-search-input')?.focus();
        } else if (e.altKey && (e.key === 'c' || e.key === 'C')) {
            e.preventDefault();
            document.getElementById('contrast-toggle-btn')?.click();
        } else if (e.key === 'Escape') {
            toggleKeyboardModal(false);
            closeSettingsModal();
            closeProfileModal();
            dismissStaged();
        }
    });
}

function toggleKeyboardModal(show) {
    const modal = document.getElementById('keyboard-modal');
    if (modal) modal.classList.toggle('hidden', !show);
}

// ==================== CONTROLS POPULATION ====================
function populateMonthSelector() {
    const sel = document.getElementById('month-select');
    if (!sel) return;

    const now = new Date();
    sel.innerHTML = '';
    for (let i = 0; i < 6; i++) {
        const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
        const yyyymm = formatDateISO(d).slice(0, 7);
        const label = d.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
        const opt = document.createElement('option');
        opt.value = yyyymm;
        opt.textContent = label + (i === 0 ? ' (This Month)' : '');
        sel.appendChild(opt);
    }
}

function populateCategoryDropdowns() {
    const categoryOptions = DEFAULT_CATEGORIES.map(c => `<option value="${c}">${c}</option>`).join('');

    // Quick Add selectors
    const nlpCat = document.getElementById('nlp-category-select');
    const smsCat = document.getElementById('sms-category-select');
    const stagedCat = document.getElementById('staged-category-select');
    const manCat = document.getElementById('man-category');
    const filterCat = document.getElementById('tx-filter-cat');

    if (nlpCat) nlpCat.innerHTML = `<option value="auto">Auto-detect Category</option>` + categoryOptions;
    if (smsCat) smsCat.innerHTML = `<option value="auto">Auto-detect Category</option>` + categoryOptions;
    if (stagedCat) stagedCat.innerHTML = categoryOptions;
    if (manCat) manCat.innerHTML = categoryOptions;
    if (filterCat) filterCat.innerHTML = `<option value="all">All Categories</option>` + categoryOptions;
}

function renderUserHeader() {
    const user = Store.getUser();
    const currLabels = document.querySelectorAll('.user-currency-symbol');
    currLabels.forEach(el => el.textContent = user.currency || '₹');

    const nameLabel = document.getElementById('header-profile-name');
    if (nameLabel) nameLabel.textContent = user.username || 'Personal';
}

// ==================== REFRESH DASHBOARD ====================
function refreshAllDashboard() {
    const monthSel = document.getElementById('month-select');
    const selectedMonth = monthSel ? monthSel.value : '';

    const stats = Store.getStats(selectedMonth);
    updatePacingUI(stats);
    updateKPIs(stats);
    renderCharts(stats);
    renderTransactionsTable();
    renderSubscriptions();
    updateNotificationBadge();
}

// ==================== PACING & MONTHLY LIMIT ENGINE ====================
function updatePacingUI(stats) {
    const badge = document.getElementById('pacing-badge');
    const safeDaily = document.getElementById('safe-daily-spend');
    const safeDays = document.getElementById('safe-daily-days');
    const projMonthEnd = document.getElementById('projected-month-end');
    const projTag = document.getElementById('projected-status-tag');

    const spentPctText = document.getElementById('spent-percent-text');
    const spentAmtText = document.getElementById('spent-amount-text');
    const budgetAmtText = document.getElementById('budget-amount-text');
    const timePctText = document.getElementById('time-elapsed-percent-text');
    const daysElapsedText = document.getElementById('days-elapsed-text');

    const progressFill = document.getElementById('budget-progress-fill');
    const timeMarker = document.getElementById('time-elapsed-marker');
    const daysInMonthLabel = document.getElementById('days-in-month-label');
    const thresholdMarker = document.getElementById('alert-threshold-marker');

    safeDaily.textContent = `${formatCurrency(stats.safe_daily_spend, stats.currency)}/day`;
    safeDays.textContent = `${stats.remaining_days} days left`;
    projMonthEnd.textContent = formatCurrency(stats.projected_spend, stats.currency);

    spentPctText.textContent = `${stats.spent_percent}%`;
    spentAmtText.textContent = formatCurrency(stats.total_expense, stats.currency);
    budgetAmtText.textContent = formatCurrency(stats.monthly_budget, stats.currency);

    timePctText.textContent = `${stats.time_elapsed_percent}%`;
    daysElapsedText.textContent = `Day ${stats.day_of_month} of ${stats.days_in_month}`;
    daysInMonthLabel.textContent = `Day ${stats.days_in_month}`;
    thresholdMarker.textContent = `Limit Alert: ${stats.alert_threshold}%`;

    const fillWidth = Math.min(100, Math.max(0, stats.spent_percent));
    progressFill.style.width = `${fillWidth}%`;
    timeMarker.style.left = `${Math.min(100, stats.time_elapsed_percent)}%`;

    const alertBanner = document.getElementById('budget-alert-banner');
    const alertMsg = document.getElementById('budget-alert-message');

    if (stats.pacing_status === 'exceeded') {
        badge.textContent = 'Budget Exceeded';
        badge.className = 'text-xs px-2.5 py-0.5 rounded font-medium bg-rose-50 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300 border border-rose-200 dark:border-rose-900';
        projTag.textContent = `${formatCurrency(Math.abs(stats.projected_diff), stats.currency)} over budget`;
        projTag.className = 'block text-[11px] font-medium text-rose-600 dark:text-rose-400';
        progressFill.className = 'h-full rounded-full transition-all duration-300 bg-rose-600';

        if (alertBanner) {
            alertBanner.classList.remove('hidden');
            alertMsg.textContent = `Limit exceeded: Total spending has crossed your ${formatCurrency(stats.monthly_budget, stats.currency)} allocation by ${formatCurrency(stats.total_expense - stats.monthly_budget, stats.currency)}.`;
        }
    } else if (stats.pacing_status === 'warning') {
        badge.textContent = 'Threshold Alert';
        badge.className = 'text-xs px-2.5 py-0.5 rounded font-medium bg-amber-50 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300 border border-amber-200 dark:border-amber-900';
        projTag.textContent = `${formatCurrency(Math.abs(stats.projected_diff), stats.currency)} projected over`;
        projTag.className = 'block text-[11px] font-medium text-amber-600 dark:text-amber-400';
        progressFill.className = 'h-full rounded-full transition-all duration-300 bg-amber-500';

        if (alertBanner) {
            alertBanner.classList.remove('hidden');
            alertMsg.textContent = `Warning: You have utilized ${stats.spent_percent}% of your monthly budget. Keep daily burn under ${formatCurrency(stats.safe_daily_spend, stats.currency)}/day.`;
        }
    } else if (stats.pacing_status === 'fast_burn') {
        badge.textContent = 'High Velocity Burn';
        badge.className = 'text-xs px-2.5 py-0.5 rounded font-medium bg-orange-50 text-orange-700 dark:bg-orange-950/60 dark:text-orange-300 border border-orange-200 dark:border-orange-900';
        projTag.textContent = `Pacing ${formatCurrency(Math.abs(stats.projected_diff), stats.currency)} over`;
        projTag.className = 'block text-[11px] font-medium text-orange-600 dark:text-orange-400';
        progressFill.className = 'h-full rounded-full transition-all duration-300 bg-orange-500';

        if (alertBanner) {
            alertBanner.classList.remove('hidden');
            alertMsg.textContent = `Fast spend rate: Day ${stats.day_of_month} (${stats.time_elapsed_percent}% of month), but ${stats.spent_percent}% spent. Safe pace is ${formatCurrency(stats.safe_daily_spend, stats.currency)}/day.`;
        }
    } else {
        badge.textContent = 'On Track';
        badge.className = 'text-xs px-2.5 py-0.5 rounded font-medium bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-900';
        projTag.textContent = `Under budget by ${formatCurrency(Math.abs(stats.projected_diff), stats.currency)}`;
        projTag.className = 'block text-[11px] font-medium text-emerald-600 dark:text-emerald-400';
        progressFill.className = 'h-full rounded-full transition-all duration-300 bg-indigo-600';

        if (alertBanner) {
            alertBanner.classList.add('hidden');
        }
    }
}

function updateKPIs(stats) {
    document.getElementById('kpi-income').textContent = formatCurrency(stats.total_income, stats.currency);
    document.getElementById('kpi-expense').textContent = formatCurrency(stats.total_expense, stats.currency);

    const savEl = document.getElementById('kpi-savings');
    const savSub = document.getElementById('kpi-savings-sub');
    savEl.textContent = formatCurrency(stats.net_savings, stats.currency);
    savEl.className = stats.net_savings < 0 ? 'block text-xl sm:text-2xl font-bold tracking-tight text-rose-600 dark:text-rose-400 mt-1' : 'block text-xl sm:text-2xl font-bold tracking-tight text-slate-900 dark:text-white mt-1';
    savSub.textContent = stats.net_savings < 0 ? 'Deficit' : 'Net Surplus';

    document.getElementById('kpi-subscriptions').textContent = formatCurrency(stats.monthly_subscriptions, stats.currency);
    document.getElementById('kpi-subs-annual').textContent = `${formatCurrency(stats.annual_subscriptions, stats.currency)}/year commitment`;
}

// ==================== CHARTS ====================
function renderCharts(stats) {
    const isDark = document.documentElement.classList.contains('dark');
    const textColor = isDark ? '#a1a1aa' : '#64748b';
    const gridColor = isDark ? 'rgba(255, 255, 255, 0.05)' : 'rgba(0, 0, 0, 0.05)';

    // 1. Category Chart
    const catCanvas = document.getElementById('categoryChart');
    if (catCanvas) {
        if (categoryChartInstance) categoryChartInstance.destroy();
        const cats = stats.categories_breakdown || [];
        const labels = cats.map(c => c.category);
        const dataValues = cats.map(c => c.total);
        const colors = CATEGORY_COLORS.slice(0, cats.length);

        if (cats.length > 0) {
            categoryChartInstance = new Chart(catCanvas, {
                type: 'doughnut',
                data: {
                    labels: labels,
                    datasets: [{
                        data: dataValues,
                        backgroundColor: colors,
                        borderWidth: 1,
                        borderColor: isDark ? '#121215' : '#ffffff',
                        hoverOffset: 4
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    cutout: '72%',
                    plugins: {
                        legend: { display: false },
                        tooltip: {
                            callbacks: {
                                label: (ctx) => {
                                    const total = dataValues.reduce((a, b) => a + b, 0);
                                    const pct = total > 0 ? Math.round((ctx.raw / total) * 100) : 0;
                                    return ` ${ctx.label}: ${formatCurrency(ctx.raw, stats.currency)} (${pct}%)`;
                                }
                            }
                        }
                    }
                }
            });

            const legendEl = document.getElementById('category-legend');
            if (legendEl) {
                const total = dataValues.reduce((a, b) => a + b, 0);
                legendEl.innerHTML = cats.map((cat, idx) => `
                    <div class="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-xs text-slate-700 dark:text-zinc-300 border border-slate-200 dark:border-zinc-800">
                        <span class="w-2 h-2 rounded-full inline-block" style="background-color: ${colors[idx]}"></span>
                        <span>${escapeHtml(cat.category)}</span>
                        <span class="text-slate-400 font-mono text-[11px]">${total > 0 ? Math.round((cat.total/total)*100) : 0}%</span>
                    </div>
                `).join('');
            }
        } else {
            catCanvas.getContext('2d').clearRect(0, 0, catCanvas.width, catCanvas.height);
            document.getElementById('category-legend').innerHTML = '<span class="text-xs text-slate-400 py-6 w-full text-center block">No expenses logged for this month yet.</span>';
        }
    }

    // 2. Daily Velocity Chart
    const velCanvas = document.getElementById('dailyVelocityChart');
    if (velCanvas) {
        if (velocityChartInstance) velocityChartInstance.destroy();
        const daysInMonth = stats.days_in_month || 30;
        const labels = [];
        const spendData = [];
        const baselineData = [];
        const dailyMap = stats.daily_spending || {};
        const selMonth = stats.selected_month;

        for (let day = 1; day <= daysInMonth; day++) {
            const dayStr = day < 10 ? `0${day}` : `${day}`;
            labels.push(`${day}`);
            spendData.push(dailyMap[`${selMonth}-${dayStr}`] || 0);
            baselineData.push(stats.safe_daily_spend || 0);
        }

        velocityChartInstance = new Chart(velCanvas, {
            type: 'bar',
            data: {
                labels: labels,
                datasets: [
                    {
                        type: 'bar',
                        label: 'Daily Outflow',
                        data: spendData,
                        backgroundColor: isDark ? 'rgba(99, 102, 241, 0.7)' : 'rgba(79, 70, 229, 0.8)',
                        borderRadius: 2,
                        order: 2
                    },
                    {
                        type: 'line',
                        label: 'Daily Safe Limit',
                        data: baselineData,
                        borderColor: isDark ? '#10b981' : '#059669',
                        borderWidth: 1.5,
                        borderDash: [4, 4],
                        pointRadius: 0,
                        fill: false,
                        order: 1
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    x: {
                        grid: { display: false },
                        ticks: { color: textColor, font: { size: 10 } }
                    },
                    y: {
                        grid: { color: gridColor },
                        ticks: {
                            color: textColor,
                            font: { size: 10 },
                            callback: (v) => `${stats.currency}${v}`
                        }
                    }
                },
                plugins: {
                    legend: {
                        position: 'top',
                        labels: { color: textColor, boxWidth: 10, font: { size: 11 } }
                    }
                }
            }
        });
    }
}

function refreshCharts() {
    const monthSel = document.getElementById('month-select');
    renderCharts(Store.getStats(monthSel ? monthSel.value : ''));
}

// ==================== MODE SWITCHING ====================
function switchAddMode(mode) {
    ['nlp', 'sms', 'manual'].forEach(t => {
        const btn = document.getElementById(`tab-${t}`);
        const pnl = document.getElementById(`panel-${t}`);
        if (!btn || !pnl) return;

        if (t === mode) {
            btn.className = 'px-2.5 py-1 rounded bg-white dark:bg-zinc-800 text-slate-900 dark:text-white font-medium shadow-sm transition';
            pnl.classList.remove('hidden');
        } else {
            btn.className = 'px-2.5 py-1 rounded text-slate-500 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-white transition';
            pnl.classList.add('hidden');
        }
    });
}

function setNLPExample(text) {
    const inp = document.getElementById('nlp-input');
    if (inp) {
        inp.value = text;
        handleDirectAddNLP();
    }
}

// ==================== DIRECT ADD & PARSE: NATURAL LANGUAGE ====================
function handleDirectAddNLP() {
    const inp = document.getElementById('nlp-input');
    const text = inp ? inp.value.trim() : '';
    if (!text) return;

    const catOverride = document.getElementById('nlp-category-select')?.value || 'auto';
    const parsed = parseNaturalLanguage(text, catOverride);

    if (parsed.amount) {
        Store.addTransaction(parsed);
        inp.value = '';
        refreshAllDashboard();
        showToast(`Added ${formatCurrency(parsed.amount, Store.getUser().currency)} at ${parsed.merchant} (${parsed.category})`);
        announceToSR(`Added transaction of ${parsed.amount}`);
    } else {
        alert('Could not detect amount from text. Please include an amount like "450" or "Rs. 450".');
    }
}

function handleReviewNLP() {
    const inp = document.getElementById('nlp-input');
    const text = inp ? inp.value.trim() : '';
    if (!text) {
        alert('Type an expense first.');
        return;
    }
    const catOverride = document.getElementById('nlp-category-select')?.value || 'auto';
    const parsed = parseNaturalLanguage(text, catOverride);
    if (parsed.amount) {
        stageTransaction(parsed);
    } else {
        alert('Please specify an amount (e.g., "Swiggy 450" or "Rent 20000").');
    }
}

// ==================== DIRECT ADD & PARSE: BANK SMS ====================
function handleDirectAddSMS() {
    const textarea = document.getElementById('sms-input');
    const text = textarea ? textarea.value.trim() : '';
    if (!text) {
        alert('Please paste transaction SMS text first.');
        return;
    }

    const catOverride = document.getElementById('sms-category-select')?.value || 'auto';
    const parsed = parseBankSMS(text, catOverride);

    if (parsed.amount) {
        Store.addTransaction(parsed);
        textarea.value = '';
        refreshAllDashboard();
        showToast(`Added ${formatCurrency(parsed.amount, Store.getUser().currency)} at ${parsed.merchant} (${parsed.category})`);
        announceToSR(`Added SMS transaction of ${parsed.amount}`);
    } else {
        alert('Could not find debit or credit amount in SMS text. Please check format.');
    }
}

function handleReviewSMS() {
    const text = document.getElementById('sms-input')?.value.trim();
    if (!text) {
        alert('Please paste transaction SMS text first.');
        return;
    }
    const catOverride = document.getElementById('sms-category-select')?.value || 'auto';
    const parsed = parseBankSMS(text, catOverride);
    if (parsed.amount) {
        stageTransaction(parsed);
    } else {
        alert('Could not find debit or credit amount in SMS text.');
    }
}

// ==================== SPEECH RECOGNITION (VOICE) ====================
function initSpeechRecognition() {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) return;

    speechRecognitionInstance = new SpeechRecognition();
    speechRecognitionInstance.continuous = false;
    speechRecognitionInstance.interimResults = true;
    speechRecognitionInstance.lang = 'en-IN'; // Indian English

    speechRecognitionInstance.onstart = () => {
        isRecordingVoice = true;
        updateVoiceButtonState(true);
        showToast('Listening... speak your expense now', 'info');
    };

    speechRecognitionInstance.onresult = (e) => {
        const transcript = Array.from(e.results)
            .map(r => r[0].transcript)
            .join('');
        const inp = document.getElementById('nlp-input');
        if (inp) {
            inp.value = transcript;
        }
    };

    speechRecognitionInstance.onerror = (err) => {
        console.warn('Speech recognition error:', err);
        isRecordingVoice = false;
        updateVoiceButtonState(false);
        if (err.error === 'not-allowed') {
            alert('Microphone permission was denied. Please allow microphone access in your browser settings.');
        }
    };

    speechRecognitionInstance.onend = () => {
        isRecordingVoice = false;
        updateVoiceButtonState(false);
        const inp = document.getElementById('nlp-input');
        if (inp && inp.value.trim().length > 0) {
            // Automatically parse what was spoken
            handleReviewNLP();
        }
    };
}

function toggleVoiceSpeech() {
    // Check if running on file:// protocol
    if (window.location.protocol === 'file:') {
        alert('Browser Security Notice:\n\nChrome and Edge disable microphone access on local "file://" URLs.\n\nTo use Voice Input:\n1. Publish live to GitHub Pages or Netlify (drag-and-drop).\n2. Or run a local HTTP server: python -m http.server 8000\n\nFor now, you can use the text bar and quick examples!');
        return;
    }

    if (!speechRecognitionInstance) {
        alert('Voice speech recognition is supported in Google Chrome, Microsoft Edge, and Safari.');
        return;
    }

    try {
        if (isRecordingVoice) {
            speechRecognitionInstance.stop();
        } else {
            speechRecognitionInstance.start();
        }
    } catch (e) {
        console.error('Speech recognition start failed', e);
    }
}

function updateVoiceButtonState(active) {
    const btn = document.getElementById('voice-record-btn');
    if (!btn) return;
    if (active) {
        btn.className = 'px-3 py-1.5 bg-rose-600 text-white rounded text-xs font-medium flex items-center gap-1.5 transition animate-pulse';
        btn.innerHTML = '<i class="fa-solid fa-microphone-slash"></i> <span>Listening...</span>';
    } else {
        btn.className = 'px-3 py-1.5 bg-slate-100 dark:bg-zinc-800 hover:bg-slate-200 dark:hover:bg-zinc-700 text-slate-700 dark:text-zinc-200 rounded text-xs font-medium flex items-center gap-1.5 transition';
        btn.innerHTML = '<i class="fa-solid fa-microphone"></i> <span>Voice</span>';
    }
}

// ==================== EDITABLE STAGING CARD ====================
function stageTransaction(tx) {
    currentStagedTx = tx;
    const card = document.getElementById('staged-card');
    if (!card) return;

    // Populate editable inputs
    document.getElementById('staged-amount-input').value = tx.amount ? tx.amount.toFixed(2) : '0.00';
    document.getElementById('staged-merchant-input').value = tx.merchant || tx.category || 'Transaction';
    document.getElementById('staged-category-select').value = tx.category || 'Other Expense';
    document.getElementById('staged-payment-select').value = tx.payment_method || 'UPI';
    document.getElementById('staged-date-input').value = tx.date || formatDateISO(new Date());
    document.getElementById('staged-recurring-check').checked = !!tx.is_recurring;

    const typeBadge = document.getElementById('staged-type-badge');
    if (tx.type === 'income') {
        typeBadge.textContent = 'Inflow';
        typeBadge.className = 'text-xs font-medium text-emerald-600 dark:text-emerald-400';
    } else {
        typeBadge.textContent = 'Outflow';
        typeBadge.className = 'text-xs font-medium text-rose-600 dark:text-rose-400';
    }

    card.classList.remove('hidden');
    card.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

function dismissStaged() {
    currentStagedTx = null;
    document.getElementById('staged-card')?.classList.add('hidden');
}

function confirmStagedTransaction() {
    if (!currentStagedTx) return;

    // Read values from editable fields
    const amountVal = parseFloat(document.getElementById('staged-amount-input').value || 0);
    if (!amountVal || amountVal <= 0) {
        alert('Please enter a valid amount.');
        return;
    }

    const updatedTx = {
        amount: amountVal,
        type: currentStagedTx.type || 'expense',
        category: document.getElementById('staged-category-select').value,
        merchant: document.getElementById('staged-merchant-input').value.trim() || 'Expense',
        payment_method: document.getElementById('staged-payment-select').value,
        date: document.getElementById('staged-date-input').value || formatDateISO(new Date()),
        is_recurring: document.getElementById('staged-recurring-check').checked,
        note: currentStagedTx.note || ''
    };

    Store.addTransaction(updatedTx);
    dismissStaged();

    const nlpInp = document.getElementById('nlp-input');
    const smsInp = document.getElementById('sms-input');
    if (nlpInp) nlpInp.value = '';
    if (smsInp) smsInp.value = '';

    showToast(`Added ${formatCurrency(updatedTx.amount, Store.getUser().currency)} at ${updatedTx.merchant}`);
    announceToSR('Transaction saved.');
    refreshAllDashboard();
}

function submitManualExpense() {
    const amt = parseFloat(document.getElementById('man-amount')?.value || 0);
    if (!amt || amt <= 0) {
        alert('Enter a valid amount.');
        return;
    }

    const tx = {
        amount: amt,
        type: document.getElementById('man-type')?.value,
        category: document.getElementById('man-category')?.value,
        merchant: document.getElementById('man-merchant')?.value || 'Expense',
        date: document.getElementById('man-date')?.value || formatDateISO(new Date()),
        payment_method: document.getElementById('man-payment')?.value,
        is_recurring: document.getElementById('man-recurring')?.checked
    };

    Store.addTransaction(tx);
    document.getElementById('man-amount').value = '';
    document.getElementById('man-merchant').value = '';
    document.getElementById('man-recurring').checked = false;

    showToast(`Added ${formatCurrency(tx.amount, Store.getUser().currency)} at ${tx.merchant}`);
    refreshAllDashboard();
}

// ==================== TRANSACTIONS LEDGER ====================
function renderTransactionsTable() {
    const txs = Store.getTransactions({
        type: document.getElementById('tx-filter-type')?.value,
        category: document.getElementById('tx-filter-cat')?.value,
        search: document.getElementById('tx-search-input')?.value,
        month: document.getElementById('month-select')?.value
    });

    const tbody = document.getElementById('tx-table-body');
    const badge = document.getElementById('tx-count-badge');
    if (badge) badge.textContent = txs.length;
    if (!tbody) return;

    if (txs.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="6" class="text-center py-12 text-slate-400 dark:text-zinc-500">
                    <div class="max-w-sm mx-auto space-y-1">
                        <i class="fa-solid fa-receipt text-2xl text-slate-300 dark:text-zinc-600 block mb-2"></i>
                        <p class="text-sm font-medium text-slate-700 dark:text-zinc-300">No transactions recorded yet</p>
                        <p class="text-xs">Type in the box above (e.g. <em>"Swiggy lunch 340"</em>) or paste an SMS to record your first expense.</p>
                    </div>
                </td>
            </tr>
        `;
        return;
    }

    const curr = Store.getUser().currency || '₹';
    tbody.innerHTML = txs.map(tx => `
        <tr class="hover:bg-slate-50/70 dark:hover:bg-zinc-800/40 transition">
            <td class="py-2.5 px-3 text-slate-500 dark:text-zinc-400 font-mono text-xs">${escapeHtml(tx.date)}</td>
            <td class="py-2.5 px-3 font-medium text-slate-900 dark:text-white">
                ${escapeHtml(tx.merchant || tx.category)}
                ${tx.is_recurring ? '<span class="ml-1.5 text-[10px] px-1.5 py-0.5 rounded bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 font-medium">Recurring</span>' : ''}
            </td>
            <td class="py-2.5 px-3">
                <span class="px-2 py-0.5 rounded text-xs text-slate-600 dark:text-zinc-400 bg-slate-100 dark:bg-zinc-800">
                    ${escapeHtml(tx.category)}
                </span>
            </td>
            <td class="py-2.5 px-3 text-slate-500 dark:text-zinc-400 text-xs">${escapeHtml(tx.payment_method)}</td>
            <td class="py-2.5 px-3 text-right font-semibold font-mono text-xs ${tx.type === 'expense' ? 'text-slate-900 dark:text-zinc-100' : 'text-emerald-600 dark:text-emerald-400'}">
                ${tx.type === 'expense' ? '-' : '+'}${formatCurrency(tx.amount, curr)}
            </td>
            <td class="py-2.5 px-3 text-center">
                <button onclick="handleDeleteTransaction(${tx.id})" class="p-1 text-slate-400 hover:text-rose-600 transition" title="Delete" aria-label="Delete">
                    <i class="fa-solid fa-trash-can text-xs"></i>
                </button>
            </td>
        </tr>
    `).join('');
}

function handleDeleteTransaction(id) {
    if (!confirm('Delete this transaction?')) return;
    Store.deleteTransaction(id);
    showToast('Transaction removed', 'error');
    refreshAllDashboard();
}

function debounceSearch() {
    clearTimeout(searchDebounceTimeout);
    searchDebounceTimeout = setTimeout(renderTransactionsTable, 200);
}

// ==================== SUBSCRIPTIONS SECTION ====================
function renderSubscriptions() {
    const data = Store.getSubscriptions();
    const curr = Store.getUser().currency || '₹';
    const totalEl = document.getElementById('subs-annual-total');
    if (totalEl) totalEl.textContent = `${formatCurrency(data.total_annual, curr)}/year`;

    const countBadge = document.getElementById('subs-count-badge');
    if (countBadge) countBadge.textContent = data.subscriptions.length;

    const cont = document.getElementById('subscriptions-container');
    if (!cont) return;

    if (data.subscriptions.length === 0) {
        cont.innerHTML = `
            <div class="col-span-full text-center py-8 text-slate-400 dark:text-zinc-500 border border-dashed border-slate-200 dark:border-zinc-800 rounded-xl">
                <p class="text-xs font-medium text-slate-600 dark:text-zinc-400">No active subscriptions detected.</p>
                <p class="text-[11px] mt-0.5">When adding an expense (e.g. Netflix, Spotify, Gym, Broadband), check "Recurring" to track ongoing commitments.</p>
            </div>
        `;
        return;
    }

    cont.innerHTML = data.subscriptions.map(s => `
        <div class="bg-white dark:bg-zinc-900 rounded-xl p-3.5 border border-slate-200 dark:border-zinc-800 flex flex-col justify-between space-y-3">
            <div class="flex items-start justify-between">
                <div>
                    <span class="font-semibold text-sm text-slate-900 dark:text-white block">${escapeHtml(s.merchant || s.category)}</span>
                    <span class="text-xs text-slate-400 dark:text-zinc-500">${escapeHtml(s.payment_method)} • Monthly</span>
                </div>
                <span class="text-sm font-semibold text-slate-900 dark:text-white font-mono">
                    ${formatCurrency(s.amount, curr)}<span class="text-xs font-normal text-slate-400">/mo</span>
                </span>
            </div>
            <div class="pt-2 border-t border-slate-100 dark:border-zinc-800/80 flex items-center justify-between text-xs">
                <span class="text-slate-400 dark:text-zinc-500">Annual commitment:</span>
                <span class="font-medium text-slate-700 dark:text-zinc-300 font-mono">${formatCurrency(s.amount * 12, curr)}</span>
            </div>
        </div>
    `).join('');
}

// ==================== NOTIFICATIONS ====================
function toggleNotificationPanel() {
    const panel = document.getElementById('notif-panel');
    if (panel) {
        const isHidden = panel.classList.toggle('hidden');
        if (!isHidden) renderNotificationList();
    }
}

function updateNotificationBadge() {
    const unread = Store.getNotifications().filter(n => !n.is_read).length;
    document.getElementById('notif-badge')?.classList.toggle('hidden', unread === 0);
}

function renderNotificationList() {
    const list = document.getElementById('notif-list');
    if (!list) return;
    const notifs = Store.getNotifications();
    if (notifs.length === 0) {
        list.innerHTML = '<p class="text-xs text-slate-400 text-center py-4">No notifications.</p>';
        return;
    }

    list.innerHTML = notifs.map(n => `
        <div class="py-2.5 px-1 text-xs">
            <div class="flex items-center justify-between font-medium ${n.type === 'budget_warning' ? 'text-rose-600' : 'text-slate-900 dark:text-white'}">
                <span>${escapeHtml(n.title)}</span>
                <span class="text-[10px] text-slate-400 font-mono">${n.created_at ? n.created_at.split('T')[0] : ''}</span>
            </div>
            <p class="text-slate-600 dark:text-zinc-400 mt-1">${escapeHtml(n.message)}</p>
        </div>
    `).join('');
}

function clearAllNotifications() {
    Store.markNotificationsRead();
    updateNotificationBadge();
    renderNotificationList();
}

// ==================== DEDICATED PROFILE & ACCOUNT MODAL ====================
function openProfileModal() {
    const user = Store.getUser();
    const lifetime = Store.getLifetimeStats();

    document.getElementById('profile-name-input').value = user.username || 'Sunny';
    document.getElementById('profile-email-input').value = user.email || 'sunny@spendwise.app';
    document.getElementById('profile-currency-select').value = user.currency || '₹';
    document.getElementById('profile-budget-input').value = user.monthly_budget || 50000;

    // Lifetime summary
    document.getElementById('profile-lifetime-count').textContent = lifetime.total_count;
    document.getElementById('profile-lifetime-outflow').textContent = formatCurrency(lifetime.total_outflow, user.currency);
    document.getElementById('profile-lifetime-inflow').textContent = formatCurrency(lifetime.total_inflow, user.currency);
    document.getElementById('profile-lifetime-subs').textContent = lifetime.subscriptions_count;

    document.getElementById('profile-modal')?.classList.remove('hidden');
}

function closeProfileModal() {
    document.getElementById('profile-modal')?.classList.add('hidden');
}

function handleSaveProfile(e) {
    e.preventDefault();
    const user = Store.getUser();
    user.username = document.getElementById('profile-name-input').value.trim() || 'Sunny';
    user.email = document.getElementById('profile-email-input').value.trim();
    user.currency = document.getElementById('profile-currency-select').value;
    user.monthly_budget = parseFloat(document.getElementById('profile-budget-input').value || 50000);

    Store.setUser(user);
    closeProfileModal();
    renderUserHeader();
    refreshAllDashboard();
    showToast('Profile and settings updated');
}

// Backup & Restore
function handleExportJSONBackup() {
    Store.exportBackupJSON();
    showToast('JSON backup file downloaded');
}

function handleImportJSONBackup(event) {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = function(e) {
        const success = Store.importBackupJSON(e.target.result);
        if (success) {
            closeProfileModal();
            renderUserHeader();
            refreshAllDashboard();
            showToast('Backup restored successfully!');
        } else {
            alert('Invalid backup file. Please make sure it is a valid SpendWise JSON backup.');
        }
    };
    reader.readAsText(file);
}

// ==================== SETTINGS MODAL ====================
function openSettingsModal() {
    const user = Store.getUser();
    document.getElementById('set-budget').value = user.monthly_budget || 50000;
    document.getElementById('set-threshold').value = user.alert_threshold || 80;
    document.getElementById('threshold-val').textContent = (user.alert_threshold || 80) + '%';
    document.getElementById('set-currency').value = user.currency || '₹';
    document.getElementById('settings-modal')?.classList.remove('hidden');
}

function closeSettingsModal() {
    document.getElementById('settings-modal')?.classList.add('hidden');
}

function handleSaveSettings(e) {
    e.preventDefault();
    const user = Store.getUser();
    user.monthly_budget = parseFloat(document.getElementById('set-budget').value);
    user.alert_threshold = parseInt(document.getElementById('set-threshold').value);
    user.currency = document.getElementById('set-currency').value;

    Store.setUser(user);
    closeSettingsModal();
    renderUserHeader();
    refreshAllDashboard();
    showToast('Settings saved');
}

function handleClearAllData() {
    if (confirm('Clear all your recorded transactions and reset tracking? This cannot be undone unless you exported a backup.')) {
        Store.clearAllData();
        refreshAllDashboard();
        showToast('All transaction records cleared');
    }
}

function escapeHtml(str) {
    if (!str) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}
