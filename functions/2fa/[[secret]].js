export async function onRequest(context) {
  const secretArray = context.params.secret || [];
  const prefillSecret = secretArray[0] || '';

  // XSS protection
  const safeSecret = escapeHtml(prefillSecret);

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>2FA Code Generator</title>
  <link rel="stylesheet" type="text/css" href="/assets/ui.css">
  <link rel="stylesheet" type="text/css" href="/assets/2fa/style.css">
</head>
<body>
  <svg class="icon-sprite" aria-hidden="true">
    <symbol id="i-link" viewBox="0 0 24 24">
      <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
      <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
    </symbol>
    <symbol id="i-qr" viewBox="0 0 24 24">
      <rect x="3.5" y="3.5" width="6.5" height="6.5" />
      <rect x="14" y="3.5" width="6.5" height="6.5" />
      <rect x="3.5" y="14" width="6.5" height="6.5" />
      <path d="M14 20.5h6.5V14" />
    </symbol>
  </svg>

  <div class="container app-2fa">
    <div class="header">
      <p class="kicker">TOTP / RFC 6238</p>
      <h1>2FA Code Generator</h1>
    </div>

    <div class="input-group">
      <div class="input-wrapper">
        <input type="text" id="secretInput" placeholder="ENTER SECRET CODE" autocomplete="off" value="${safeSecret}">
        <div class="input-actions">
          <button type="button" class="icon-btn" onclick="copyShortcut()" title="Copy shareable link"
            aria-label="Copy shareable link">
            <svg class="icon" aria-hidden="true"><use href="#i-link" /></svg>
          </button>
        </div>
      </div>
    </div>

    <div id="displayArea" class="hidden">
      <div class="totp-box" id="totpBox" onclick="copyTOTP()">
        <div class="code" id="totp">--- ---</div>
      </div>
      <div class="tooltip" id="copyTooltip">Click to copy</div>

      <div class="timer-bar">
        <div class="timer-bar-fill" id="bar"></div>
      </div>

      <div class="next-code-info">
        Next code <span id="nextCode">------</span> in <span id="seconds">30</span> sec
      </div>

      <div class="action-buttons">
        <button type="button" class="btn" id="qrBtn" onclick="toggleQR()">
          <svg class="icon icon--tight" aria-hidden="true"><use href="#i-qr" /></svg>
          Show QR
        </button>
      </div>
      <div id="qrContainer" class="qr-container hidden">
        <!-- QR code is rendered here on demand -->
      </div>
    </div>

    <div id="errorMessage" class="error-message"></div>
  </div>
  <script src="/assets/2fa/script.js"></script>
</body>
</html>`;

  return new Response(html, {
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-store, no-cache, must-revalidate'
    }
  });
}

function escapeHtml(str) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}