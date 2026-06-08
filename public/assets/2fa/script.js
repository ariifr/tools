// State
let currentSecret = '';
let hexSecret = '';
let updateInterval = null;

// DOM elements
const secretInput = document.getElementById('secretInput');
const displayArea = document.getElementById('displayArea');
const codeEl = document.getElementById('totp');
const secondsEl = document.getElementById('seconds');
const barEl = document.getElementById('bar');
const errorEl = document.getElementById('errorMessage');
const currentSecretEl = document.getElementById('currentSecret');
const shortcutUrl = document.getElementById('shortcutUrl');
const copyShortcutBtn = document.getElementById('copyShortcutBtn');
const copyTotpBtn = document.getElementById('copyTotpBtn');
const recentSecrets = document.getElementById('recentSecrets');

const base32Chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

// Base32 to hex
function base32ToHex(base32) {
    let bits = '';
    for (let i = 0; i < base32.length; i++) {
        const val = base32Chars.indexOf(base32.charAt(i));
        if (val === -1) throw new Error(`Invalid base32 character: ${base32.charAt(i)}`);
        bits += val.toString(2).padStart(5, '0');
    }
    let hex = '';
    for (let i = 0; i + 4 <= bits.length; i += 4) {
        const chunk = bits.substr(i, 4);
        hex += parseInt(chunk, 2).toString(16);
    }
    return hex;
}

// HMAC-SHA1
async function hmacSha1(keyBytes, messageBytes) {
    const cryptoKey = await crypto.subtle.importKey(
        'raw', keyBytes,
        { name: 'HMAC', hash: 'SHA-1' },
        false, ['sign']
    );
    const sig = await crypto.subtle.sign('HMAC', cryptoKey, messageBytes);
    return new Uint8Array(sig);
}

// Generate TOTP
async function generateTOTP(hexSecret) {
    const keyBytes = new Uint8Array(hexSecret.match(/.{2}/g).map(byte => parseInt(byte, 16)));
    let time = Math.floor(Date.now() / 30000);
    const timeBytes = new Uint8Array(8);
    for (let i = 7; i >= 0; i--) {
        timeBytes[i] = time & 0xff;
        time = Math.floor(time / 256);
    }

    const hmacResult = await hmacSha1(keyBytes, timeBytes);
    const offset = hmacResult[19] & 0xf;
    const binary =
        ((hmacResult[offset] & 0x7f) << 24) |
        ((hmacResult[offset + 1] & 0xff) << 16) |
        ((hmacResult[offset + 2] & 0xff) << 8) |
        (hmacResult[offset + 3] & 0xff);
    const otp = binary % 1000000;
    return otp.toString().padStart(6, '0');
}

// Start timer updates
function startUpdates() {
    if (updateInterval) clearInterval(updateInterval);
    function update() {
        const now = Math.floor(Date.now() / 1000);
        const step = 30;
        const remaining = step - (now % step);
        secondsEl.textContent = remaining;
        barEl.style.width = ((remaining / step) * 100) + '%';
        if (now % step === 0) updateCode();
    }
    update();
    updateInterval = setInterval(update, 1000);
}

async function updateCode() {
    if (!hexSecret) return;
    try {
        const code = await generateTOTP(hexSecret);
        codeEl.textContent = code;
        hideError();
    } catch (e) {
        showError('Error generating code. Check console.');
        console.error(e);
    }
}

// Copy current TOTP
async function copyTOTP() {
    const code = codeEl.textContent;
    if (!code || code === '------') return;
    try {
        await navigator.clipboard.writeText(code);
        copyTotpBtn.textContent = '✅ Copied!';
        copyTotpBtn.classList.add('copied');
        setTimeout(() => {
            copyTotpBtn.textContent = '📋 Copy TOTP';
            copyTotpBtn.classList.remove('copied');
        }, 1500);
    } catch (e) {
        const textarea = document.createElement('textarea');
        textarea.value = code;
        textarea.style.position = 'fixed';
        textarea.style.opacity = '0';
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand('copy');
        document.body.removeChild(textarea);
        copyTotpBtn.textContent = '✅ Copied!';
        setTimeout(() => {
            copyTotpBtn.textContent = '📋 Copy TOTP';
        }, 1500);
    }
}

// Copy shortcut URL (now uses /2fa/ prefix)
async function copyShortcut() {
    if (!currentSecret) return;
    const url = `${window.location.origin}/2fa/${currentSecret}`;
    try {
        await navigator.clipboard.writeText(url);
        copyShortcutBtn.textContent = 'Copied!';
        copyShortcutBtn.classList.add('copied');
        setTimeout(() => {
            copyShortcutBtn.textContent = 'Copy';
            copyShortcutBtn.classList.remove('copied');
        }, 1500);
    } catch (e) {
        const textarea = document.createElement('textarea');
        textarea.value = url;
        textarea.style.position = 'fixed';
        textarea.style.opacity = '0';
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand('copy');
        document.body.removeChild(textarea);
        copyShortcutBtn.textContent = 'Copied!';
        setTimeout(() => {
            copyShortcutBtn.textContent = 'Copy';
        }, 1500);
    }
}

// Extract secret from URL path, accounting for /2fa/ prefix
function getSecretFromPath() {
    let path = window.location.pathname.replace(/^\/|\/$/g, '');
    if (path.toLowerCase().startsWith('2fa/')) {
        path = path.substring(4);
    } else if (path.toLowerCase() === '2fa') {
        return '';
    }
    return path;
}

// Initialize with a secret
async function initSecret(secret) {
    try {
        const cleaned = secret.toUpperCase().replace(/[^A-Z2-7]/g, '');
        if (!cleaned) {
            throw new Error('Secret must contain valid Base32 characters');
        }
        if (cleaned.length < 16) {
            throw new Error('Secret seems too short (min 16 Base32 chars recommended)');
        }

        hexSecret = base32ToHex(cleaned);
        currentSecret = cleaned;

        currentSecretEl.textContent = cleaned;
        shortcutUrl.textContent = `${window.location.origin}/2fa/${cleaned}`;
        displayArea.classList.remove('hidden');
        copyTotpBtn.textContent = '📋 Copy TOTP';

        await updateCode();
        startUpdates();
        hideError();
        saveToRecent(cleaned);
        secretInput.value = cleaned;
    } catch (e) {
        showError(e.message);
        throw e;
    }
}

// Generate from input
async function generateFromInput() {
    const secret = secretInput.value.trim();
    if (!secret) {
        showError('Please enter a secret code');
        return;
    }
    await initSecret(secret);
}

// Clear input
function clearInput() {
    secretInput.value = '';
    currentSecret = '';
    hexSecret = '';
    displayArea.classList.add('hidden');
    if (updateInterval) clearInterval(updateInterval);
    hideError();
}

// Recent secrets (localStorage, per user)
function saveToRecent(secret) {
    let recent = JSON.parse(localStorage.getItem('totp_recent') || '[]');
    recent = recent.filter(s => s !== secret);
    recent.unshift(secret);
    recent = recent.slice(0, 5);
    localStorage.setItem('totp_recent', JSON.stringify(recent));
    renderRecentSecrets();
}

function renderRecentSecrets() {
    const recent = JSON.parse(localStorage.getItem('totp_recent') || '[]');
    if (recent.length === 0) {
        recentSecrets.style.display = 'none';
        return;
    }
    recentSecrets.style.display = 'block';
    recentSecrets.innerHTML = '<div class="divider">Recent Secrets</div>' +
        recent.map(s => `
          <div class="recent-item">
            <code>${s}</code>
            <button class="btn-copy" onclick="initSecret('${s}')">Use</button>
          </div>
        `).join('');
}

function showError(msg) {
    errorEl.textContent = msg;
    errorEl.classList.add('show');
}

function hideError() {
    errorEl.classList.remove('show');
}

// Event listeners
secretInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') generateFromInput();
});

secretInput.addEventListener('input', (e) => {
    e.target.value = e.target.value.toUpperCase().replace(/[^A-Z2-7]/g, '');
});

// Check URL on load
function checkURLSecret() {
    const secret = getSecretFromPath();
    if (secret && /^[A-Z2-7]+$/i.test(secret)) {
        initSecret(secret);
    }
}

window.addEventListener('popstate', () => {
    const secret = getSecretFromPath();
    if (secret && /^[A-Z2-7]+$/i.test(secret)) {
        initSecret(secret);
    } else {
        clearInput();
    }
});

// Expose initSecret ke window agar onclick dari recent secrets work
window.initSecret = initSecret;
window.clearInput = clearInput;
window.generateFromInput = generateFromInput;
window.copyTOTP = copyTOTP;
window.copyShortcut = copyShortcut;

// Initial setup
renderRecentSecrets();

// Pastikan auto-generate jalan setelah DOM siap
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', checkURLSecret);
} else {
    checkURLSecret();
}