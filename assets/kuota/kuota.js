// Cek Kuota Axis XL — talks only to the same-origin proxy at /api/kuota.
// The upstream API URL and credentials live in functions/api/kuota.js and are never
// shipped to the browser, so there is nothing to read from DevTools.

const form = document.getElementById('checkForm');
const input = document.getElementById('msisdnInput');
const button = document.getElementById('checkBtn');
const buttonLabel = document.getElementById('checkBtnLabel');
const banner = document.getElementById('statusBanner');
const bannerText = document.getElementById('statusText');
const results = document.getElementById('results');
const infoGrid = document.getElementById('infoGrid');
const packageList = document.getElementById('packageList');
const packageCount = document.getElementById('packageCount');
const msisdnBadge = document.getElementById('msisdnBadge');

const INFO_FIELDS = [
    { key: 'prefix', label: 'Operator', icon: 'i-tower' },
    { key: 'dukcapil', label: 'Status Dukcapil', icon: 'i-shield' },
    { key: 'status_4g', label: 'Status Jaringan', icon: 'i-signal' },
    { key: 'active_card', label: 'Umur Kartu', icon: 'i-clock' },
    { key: 'active_period', label: 'Masa Aktif s/d', icon: 'i-calendar', date: true },
    { key: 'grace_period', label: 'Masa Tenggang s/d', icon: 'i-hourglass', date: true, alert: true },
];

const UNIT_TO_MB = { b: 1 / 1048576, kb: 1 / 1024, mb: 1, gb: 1024, tb: 1048576 };

form.addEventListener('submit', handleSubmit);

async function handleSubmit(event) {
    event.preventDefault();

    const msisdn = normalizeMsisdn(input.value);
    if (!msisdn) {
        showError('Nomor tidak valid. Gunakan format 08xx, 628xx, atau +628xx.');
        return;
    }

    if (location.protocol === 'file:') {
        showError('Halaman ini butuh server (Cloudflare Pages Functions). Buka lewat domain deploy, bukan file://.');
        return;
    }

    clearError();
    setBusy(true);

    try {
        const response = await fetch('/api/kuota?msisdn=' + encodeURIComponent(msisdn), {
            headers: { Accept: 'application/json' },
        });

        let payload = null;
        try {
            payload = await response.json();
        } catch {
            payload = null;
        }

        if (!response.ok || !payload || payload.status !== true) {
            showError((payload && payload.message) || 'Gagal memproses nomor ' + msisdn + '.');
            return;
        }

        render(payload.data || {});
        results.classList.remove('hidden');
        results.scrollIntoView({ behavior: 'smooth', block: 'start' });
    } catch {
        showError('Gagal terhubung ke server. Periksa koneksi internet Anda.');
    } finally {
        setBusy(false);
    }
}

// ------------------------------------------------------------------ rendering

function render(data) {
    const sp = data.data_sp || {};
    msisdnBadge.textContent = data.msisdn || '-';

    infoGrid.replaceChildren();
    for (const field of INFO_FIELDS) {
        const raw = readValue(sp[field.key]);
        const value = raw === '' ? '-' : field.date ? formatDate(raw, true) : raw;

        const cell = document.createElement('div');
        cell.className = 'info-cell';

        const label = document.createElement('div');
        label.className = 'info-label';
        label.append(svgIcon(field.icon), document.createTextNode(field.label));

        const text = document.createElement('div');
        text.className = 'info-value' + (field.alert ? ' is-alert' : '');
        text.textContent = value;

        cell.append(label, text);
        infoGrid.append(cell);
    }

    renderPackages(sp);
}

function renderPackages(sp) {
    const raw = sp.quotas && sp.quotas.value;
    const groups = Array.isArray(raw)
        ? raw.map((entry) => (Array.isArray(entry) ? entry[0] : entry)).filter(Boolean)
        : [];

    packageList.replaceChildren();
    packageCount.textContent = groups.length ? groups.length + ' Paket' : '';

    if (!groups.length) {
        packageList.append(emptyState('Tidak ada data paket kuota.'));
        return;
    }

    for (const group of groups) {
        packageList.append(packageCard(group));
    }
}

function packageCard(group) {
    const pkg = group.packages || {};

    const card = document.createElement('article');
    card.className = 'package';

    const head = document.createElement('div');
    head.className = 'package-head';

    const name = document.createElement('h3');
    name.className = 'package-name';
    name.textContent = pkg.name || 'Paket tanpa nama';

    const expiry = document.createElement('p');
    expiry.className = 'package-expiry';
    expiry.textContent = 'Kadaluarsa: ' + (pkg.expDate ? formatDate(pkg.expDate, true) : 'N/A');

    head.append(name, expiry);

    const list = document.createElement('ul');
    list.className = 'benefits';

    const benefits = Array.isArray(group.benefits) ? group.benefits : [];
    if (benefits.length) {
        for (const benefit of benefits) list.append(benefitRow(benefit));
    } else {
        const item = document.createElement('li');
        item.className = 'benefit';
        const note = document.createElement('p');
        note.className = 'hint';
        note.textContent = 'Tidak ada rincian benefit pada paket ini.';
        item.append(note);
        list.append(item);
    }

    card.append(head, list);
    return card;
}

function benefitRow(benefit) {
    const type = String(benefit.type || '').toUpperCase();
    const remaining = readValue(benefit.remaining);
    const quota = readValue(benefit.quota);

    const item = document.createElement('li');
    item.className = 'benefit';

    const head = document.createElement('div');
    head.className = 'benefit-head';

    const name = document.createElement('span');
    name.className = 'benefit-name';
    name.append(svgIcon(benefitIcon(type)), document.createTextNode(benefit.bname || 'Benefit'));

    const amount = document.createElement('span');
    amount.className = 'benefit-amount';

    head.append(name, amount);
    item.append(head);

    if (type === 'DATA' && quota) {
        amount.textContent = (remaining || '0') + ' / ' + quota;

        const percent = quotaPercent(remaining, quota);
        if (percent == null) return item;

        const rounded = Math.round(percent);
        amount.textContent += ' · ' + rounded + '%';

        const meter = document.createElement('div');
        meter.className = 'meter';
        meter.setAttribute('role', 'progressbar');
        meter.setAttribute('aria-valuemin', '0');
        meter.setAttribute('aria-valuemax', '100');
        meter.setAttribute('aria-valuenow', String(rounded));
        meter.setAttribute('aria-label', (benefit.bname || 'Kuota') + ' tersisa');

        const fill = document.createElement('span');
        fill.className = 'meter-fill' + (percent > 50 ? '' : percent > 10 ? ' is-warn' : ' is-low');
        fill.style.width = percent + '%';
        meter.append(fill);
        item.append(meter);

        return item;
    }

    amount.textContent = remaining || '-';
    return item;
}

function benefitIcon(type) {
    if (type === 'DATA') return 'i-globe';
    if (type === 'SMS') return 'i-message';
    if (type === 'VOICE' || type === 'TELP' || type === 'CALL') return 'i-phone';
    return 'i-database';
}

function emptyState(text) {
    const box = document.createElement('p');
    box.className = 'empty';
    box.textContent = text;
    return box;
}

function svgIcon(id, className = 'icon') {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('class', className);
    svg.setAttribute('aria-hidden', 'true');

    const use = document.createElementNS('http://www.w3.org/2000/svg', 'use');
    use.setAttribute('href', '#' + id);

    svg.append(use);
    return svg;
}

// -------------------------------------------------------------------- helpers

// Values arrive either as plain strings or as { value: "..." } wrappers.
function readValue(node) {
    if (node == null) return '';
    if (typeof node === 'object') {
        return node.value == null ? '' : String(node.value);
    }
    return String(node);
}

function normalizeMsisdn(raw) {
    let digits = String(raw || '').replace(/\D/g, '');
    if (digits.startsWith('8')) digits = '0' + digits;
    return /^(0|62)8\d{7,12}$/.test(digits) ? digits : '';
}

function toMegabytes(text) {
    const match = String(text == null ? '' : text).trim().toLowerCase().match(/^([\d.,]+)\s*(tb|gb|mb|kb|b)?$/);
    if (!match) return null;

    let numeric = match[1];
    if (numeric.includes(',') && numeric.includes('.')) {
        numeric = numeric.replace(/\./g, '').replace(',', '.');
    } else {
        numeric = numeric.replace(',', '.');
    }

    const amount = Number.parseFloat(numeric);
    if (!Number.isFinite(amount)) return null;
    return amount * UNIT_TO_MB[match[2] || 'mb'];
}

function quotaPercent(remaining, quota) {
    const left = toMegabytes(remaining);
    const total = toMegabytes(quota);
    if (left == null || total == null || total <= 0) return null;
    return Math.max(0, Math.min(100, (left / total) * 100));
}

function formatDate(value, withTime) {
    const date = parseDate(value);
    if (!date) return String(value || 'N/A');

    const text = date.toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' });
    if (!withTime) return text;

    return text + ' ' + pad(date.getHours()) + ':' + pad(date.getMinutes());
}

function parseDate(value) {
    if (!value) return null;
    const raw = String(value).trim();
    if (!/^\d{4}-\d{2}-\d{2}/.test(raw)) return null;
    const date = new Date(raw.replace(' ', 'T'));
    return Number.isNaN(date.getTime()) ? null : date;
}

function pad(number) {
    return String(number).padStart(2, '0');
}

// ---------------------------------------------------------------------- state

function setBusy(busy) {
    button.disabled = busy;
    button.classList.toggle('is-busy', busy);
    buttonLabel.textContent = busy ? 'Memuat...' : 'Cek Kuota';
}

function showError(message) {
    results.classList.add('hidden');
    bannerText.textContent = message;
    banner.classList.add('show');
}

function clearError() {
    bannerText.textContent = '';
    banner.classList.remove('show');
}
