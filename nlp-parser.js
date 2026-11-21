/**
 * nlp-parser.js - Clean, Robust Natural Language & SMS Transaction Parser
 * Built for high precision. Supports Indian Rupee (₹ / Rs / INR), global currencies,
 * major Indian merchants (Swiggy, Zomato, Blinkit, Zepto, Flipkart, etc.), and UPI/Bank SMS formats.
 */

const CATEGORY_KEYWORDS = {
    'Food & Dining': [
        'lunch', 'dinner', 'breakfast', 'brunch', 'coffee', 'starbucks', 'mcdonald',
        'burger', 'pizza', 'subway', 'restaurant', 'cafe', 'tacos', 'tea', 'chai',
        'food', 'bakery', 'kfc', 'dominos', 'groceries', 'supermarket', 'blinkit',
        'zepto', 'instamart', 'swiggy', 'zomato', 'bigbasket', 'dmart', 'haldiram',
        'sweetgreen', 'dhabba', 'biryani'
    ],
    'Shopping': [
        'amazon', 'flipkart', 'myntra', 'meesho', 'ajio', 'bought', 'shoes', 'clothes',
        'clothing', 'shirt', 'pants', 'target', 'zara', 'h&m', 'nike', 'apple',
        'electronics', 'laptop', 'gadget', 'book', 'croma', 'reliance digital'
    ],
    'Transportation': [
        'uber', 'ola', 'rapido', 'taxi', 'cab', 'metro', 'subway', 'bus', 'train',
        'irctc', 'petrol', 'diesel', 'fuel', 'parking', 'toll', 'fastag', 'flight', 'indigo'
    ],
    'Housing & Utilities': [
        'rent', 'maintenance', 'electricity', 'water', 'gas', 'lpg', 'indane', 'bescom',
        'wifi', 'broadband', 'airtel', 'jio', 'act fibernet', 'power bill'
    ],
    'Entertainment': [
        'movie', 'cinema', 'theatre', 'bookmyshow', 'pvr', 'inox', 'netflix', 'spotify',
        'hotstar', 'prime video', 'disney', 'youtube premium', 'steam', 'playstation'
    ],
    'Health & Medical': [
        'doctor', 'dentist', 'pharmacy', 'medicine', 'hospital', 'clinic',
        'apollo', '1mg', 'pharmeasy', 'gym', 'cult.fit', 'fitness', 'workout'
    ],
    'Subscriptions': [
        'subscription', 'monthly plan', 'annual plan', 'membership', 'chatgpt',
        'claude', 'github', 'icloud', 'google one', 'dropbox', 'linkedin'
    ],
    'Income': [
        'salary', 'paycheck', 'payroll', 'dividend', 'bonus', 'freelance',
        'consulting', 'refund', 'cashback', 'interest', 'stipend', 'earned',
        'received', 'credited', 'deposit'
    ],
    'Personal Care': [
        'haircut', 'salon', 'barber', 'spa', 'cosmetics', 'grooming', 'urban company'
    ]
};

const FAMOUS_MERCHANTS = [
    'Swiggy', 'Zomato', 'Blinkit', 'Zepto', 'Amazon', 'Flipkart', 'Uber', 'Ola',
    'Rapido', 'Myntra', 'Airtel', 'Jio', 'Netflix', 'Spotify', 'Hotstar',
    'Starbucks', 'McDonald\'s', 'Cult.fit', 'Apollo Pharmacy', 'BigBasket', 'DMart',
    'BookMyShow', 'PVR', 'Tata Neu', 'Croma', 'IKEA'
];

function cleanTitle(str) {
    if (!str) return '';
    const cleaned = str.trim().toLowerCase().replace(/(^|\s)\S/g, t => t.toUpperCase());
    return cleaned.replace(/'S\b/g, "'s");
}

function formatDateISO(date) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
}

/**
 * Universal Amount Extractor for Indian and International formats
 * Handles:
 * "Rs 450", "Rs. 1,250.00", "INR 1,50,000", "₹350", "450/-", "Swiggy 350"
 */
function extractAmountFromText(text) {
    if (!text) return null;
    const textClean = text.replace(/\/[-]/g, ' ');

    // Priority 1: Currency symbols/codes (Rs, INR, ₹, $, €, £)
    let m = textClean.match(/(?:rs\.?|inr|₹|[\$\€\£])\s*([0-9]+(?:,[0-9]+)*(?:\.[0-9]{1,2})?)/i);
    if (!m) {
        // Priority 2: Action verbs (debited, spent, paid, sent, etc.)
        m = textClean.match(/(?:debited|spent|paid|purchase of|sent|txn of|amount|withdrawn|credited|received)\s*(?:of|by|for)?\s*([0-9]+(?:,[0-9]+)*(?:\.[0-9]{1,2})?)/i);
    }
    if (!m) {
        // Priority 3: Bare numbers followed or preceded by currency
        m = textClean.match(/\b([0-9]+(?:,[0-9]+)*(?:\.[0-9]{1,2})?)\s*(?:rs\.?|inr|rupees?|bucks?|dollars?)?\b/i);
    }

    if (m && m[1]) {
        const cleanedStr = m[1].replace(/,/g, '');
        const val = parseFloat(cleanedStr);
        if (!isNaN(val) && val > 0) return val;
    }
    return null;
}

/**
 * Natural Language Parser for conversational inputs
 */
function parseNaturalLanguage(text, overrideCategory = 'auto') {
    const textClean = text.trim();
    const lowered = textClean.toLowerCase();
    const now = new Date();

    const result = {
        original_text: textClean,
        amount: extractAmountFromText(textClean),
        type: 'expense',
        category: 'Other Expense',
        merchant: '',
        date: formatDateISO(now),
        payment_method: 'UPI',
        note: textClean,
        is_recurring: false
    };

    // Detect Inflows vs Outflows
    const incomeWords = ['received', 'salary', 'earned', 'paycheck', 'bonus', 'refund', 'cashback', 'credited', 'deposit', 'dividend'];
    for (const w of incomeWords) {
        if (new RegExp(`\\b${w}\\b`, 'i').test(lowered)) {
            result.type = 'income';
            result.category = 'Salary';
            break;
        }
    }

    // Extract Date
    if (lowered.includes('yesterday')) {
        const yest = new Date();
        yest.setDate(yest.getDate() - 1);
        result.date = formatDateISO(yest);
    } else if (lowered.includes('day before yesterday')) {
        const dby = new Date();
        dby.setDate(dby.getDate() - 2);
        result.date = formatDateISO(dby);
    } else {
        const dateMatch = lowered.match(/\b(\d{4}[-/]\d{1,2}[-/]\d{1,2})\b/);
        if (dateMatch) {
            result.date = dateMatch[1].replace(/\//g, '-');
        }
    }

    // Payment Method
    if (/\b(cash|in cash)\b/i.test(lowered)) {
        result.payment_method = 'Cash';
    } else if (/\b(credit card|credit|cc)\b/i.test(lowered)) {
        result.payment_method = 'Credit Card';
    } else if (/\b(debit card|debit|dc)\b/i.test(lowered)) {
        result.payment_method = 'Debit Card';
    } else if (/\b(netbanking|wire|bank transfer|neft|imps|rtgs)\b/i.test(lowered)) {
        result.payment_method = 'Net Banking';
    } else {
        result.payment_method = 'UPI';
    }

    // Category Deduction or Override
    if (overrideCategory && overrideCategory !== 'auto') {
        result.category = overrideCategory;
    } else {
        let matchedCat = null;
        for (const [cat, keywords] of Object.entries(CATEGORY_KEYWORDS)) {
            if (result.type === 'income' && cat !== 'Income') continue;
            for (const kw of keywords) {
                if (new RegExp(`\\b${kw}\\b`, 'i').test(lowered)) {
                    matchedCat = cat;
                    break;
                }
            }
            if (matchedCat) break;
        }
        if (matchedCat) result.category = matchedCat;
    }

    // Extract Merchant
    const merchantMatch = textClean.match(/\b(?:at|from|to|for|via)\s+([A-Za-z0-9\s\'\&\.\-]+?)(?:\s+(?:for|on|with|using|yesterday|today|in|via|₹|rs|\$|\d)|$)/i);
    if (merchantMatch && merchantMatch[1]) {
        const cand = merchantMatch[1].trim();
        const stopwords = ['a', 'the', 'my', 'cash', 'card', 'lunch', 'dinner', 'food', 'rent', 'groceries', 'petrol', 'upi'];
        if (!stopwords.includes(cand.toLowerCase())) {
            result.merchant = cleanTitle(cand);
        }
    }

    if (!result.merchant) {
        for (const fm of FAMOUS_MERCHANTS) {
            if (lowered.includes(fm.toLowerCase())) {
                result.merchant = fm;
                break;
            }
        }
    }

    if (!result.merchant) {
        result.merchant = result.category;
    }

    // Detect Subscriptions
    if (lowered.includes('subscription') || lowered.includes('monthly plan') || lowered.includes('netflix') || lowered.includes('spotify') || lowered.includes('gym') || lowered.includes('membership')) {
        result.is_recurring = true;
    }

    return result;
}

/**
 * Bank & UPI SMS Parser
 */
function parseBankSMS(smsText, overrideCategory = 'auto') {
    const text = smsText.trim();
    const lowered = text.toLowerCase();
    const now = new Date();

    const result = {
        original_text: text,
        amount: extractAmountFromText(text),
        type: 'expense',
        category: 'Other Expense',
        merchant: '',
        date: formatDateISO(now), // Defaults to today so it matches current active month
        payment_method: 'UPI',
        note: text.length > 80 ? text.substring(0, 80) + '...' : text,
        is_recurring: false
    };

    if (/credited|deposited|salary|refund|received/i.test(lowered)) {
        result.type = 'income';
        result.category = 'Salary';
    }

    // Merchant extraction
    const mMatch = text.match(/\b(?:at|to|info\*|vpa)\s+([A-Za-z0-9\s\'\*\.\-\_]+?)(?:\s+(?:on|using|avl|bal|ref|dated|via|\.|\,)|$)/i);
    if (mMatch && mMatch[1]) {
        let cleaned = mMatch[1].replace(/[*_#]+/g, ' ').replace(/\s+/g, ' ').trim();
        if (cleaned.length > 1 && !/^(inr|rs|usd|\d+)$/i.test(cleaned)) {
            result.merchant = cleanTitle(cleaned);
        }
    }

    if (!result.merchant) {
        for (const fm of FAMOUS_MERCHANTS) {
            if (lowered.includes(fm.toLowerCase())) {
                result.merchant = fm;
                break;
            }
        }
    }

    if (!result.merchant) {
        result.merchant = 'Bank Outflow';
    }

    // Category detection or override
    if (overrideCategory && overrideCategory !== 'auto') {
        result.category = overrideCategory;
    } else {
        for (const [cat, keywords] of Object.entries(CATEGORY_KEYWORDS)) {
            if (keywords.some(kw => lowered.includes(kw))) {
                result.category = cat;
                break;
            }
        }
    }

    // Payment method
    if (/upi|vpa|gpay|phonepe|paytm/i.test(lowered)) {
        result.payment_method = 'UPI';
    } else if (/credit card|credit|cc\b/i.test(lowered)) {
        result.payment_method = 'Credit Card';
    } else if (/debit card|debit|dc\b/i.test(lowered)) {
        result.payment_method = 'Debit Card';
    }

    if (lowered.includes('subscription') || lowered.includes('monthly') || lowered.includes('netflix') || lowered.includes('spotify') || lowered.includes('gym')) {
        result.is_recurring = true;
    }

    return result;
}
