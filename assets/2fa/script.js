// State
let currentSecret = '';
let hexSecret = '';
let updateInterval = null;

// DOM elements
const secretInput = document.getElementById('secretInput');
const displayArea = document.getElementById('displayArea');
const totpBox = document.getElementById('totpBox');
const codeEl = document.getElementById('totp');
const copyTooltip = document.getElementById('copyTooltip');
const secondsEl = document.getElementById('seconds');
const barEl = document.getElementById('bar');
const nextCodeEl = document.getElementById('nextCode');
const errorEl = document.getElementById('errorMessage');
const qrContainer = document.getElementById('qrContainer');

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
async function generateTOTP(hexSecret, timeOffset = 0) {
    const keyBytes = new Uint8Array(hexSecret.match(/.{2}/g).map(byte => parseInt(byte, 16)));
    let time = Math.floor(Date.now() / 30000) + timeOffset;
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

function formatCode(code) {
    return code.slice(0, 3) + ' ' + code.slice(3);
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
        codeEl.textContent = formatCode(code);
        
        const nextCode = await generateTOTP(hexSecret, 1);
        nextCodeEl.textContent = nextCode; // keep next code without space for UI
        
        hideError();
    } catch (e) {
        showError('Error generating code. Check console.');
        console.error(e);
    }
}

// Copy current TOTP
async function copyTOTP() {
    const code = codeEl.textContent.replace(/\s/g, '');
    if (!code || code === '------') return;
    try {
        await navigator.clipboard.writeText(code);
        showCopiedState();
    } catch (e) {
        const textarea = document.createElement('textarea');
        textarea.value = code;
        textarea.style.position = 'fixed';
        textarea.style.opacity = '0';
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand('copy');
        document.body.removeChild(textarea);
        showCopiedState();
    }
}

function showCopiedState() {
    totpBox.classList.add('copied');
    copyTooltip.textContent = 'Copied!';
    copyTooltip.style.color = '#4f8';
    setTimeout(() => {
        totpBox.classList.remove('copied');
        copyTooltip.textContent = 'Click to copy';
        copyTooltip.style.color = '#888';
    }, 1500);
}

// Copy shortcut URL
async function copyShortcut() {
    if (!currentSecret) return;
    const url = `${window.location.origin}/2fa/${currentSecret}`;
    try {
        await navigator.clipboard.writeText(url);
        alert('Link copied to clipboard!');
    } catch (e) {
        const textarea = document.createElement('textarea');
        textarea.value = url;
        textarea.style.position = 'fixed';
        textarea.style.opacity = '0';
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand('copy');
        document.body.removeChild(textarea);
        alert('Link copied to clipboard!');
    }
}

// Extract secret from URL path
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

        displayArea.classList.remove('hidden');

        await updateCode();
        startUpdates();
        hideError();
        secretInput.value = cleaned;
    } catch (e) {
        showError(e.message);
        displayArea.classList.add('hidden');
    }
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

function toggleQR() {
    qrContainer.classList.toggle('hidden');
    if (!qrContainer.classList.contains('hidden') && currentSecret) {
        qrContainer.innerHTML = `<img src="https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=otpauth://totp/Temp2FA?secret=${currentSecret}" alt="QR Code" style="border-radius: 8px; border: 4px solid #fff;">`;
    }
}

function showError(msg) {
    errorEl.textContent = msg;
    errorEl.classList.add('show');
}

function hideError() {
    errorEl.classList.remove('show');
}

// Event listeners
secretInput.addEventListener('input', async (e) => {
    let val = e.target.value.toUpperCase().replace(/[^A-Z2-7]/g, '');
    e.target.value = val;
    
    if (val.length >= 16) {
        await initSecret(val);
    } else {
        displayArea.classList.add('hidden');
        if (updateInterval) clearInterval(updateInterval);
    }
});

// Check URL on load
function checkURLSecret() {
    const secret = getSecretFromPath() || secretInput.value;
    if (secret && /^[A-Z2-7]+$/i.test(secret) && secret.length >= 16) {
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

window.initSecret = initSecret;
window.clearInput = clearInput;
window.copyTOTP = copyTOTP;
window.copyShortcut = copyShortcut;
window.toggleQR = toggleQR;

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', checkURLSecret);
} else {
    checkURLSecret();
}