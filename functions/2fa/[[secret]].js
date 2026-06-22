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
  <link rel="stylesheet" type="text/css" href="/assets/2fa/style.css">
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>2FA Code Generator</h1>
    </div>

    <div class="input-group">
      <div class="input-wrapper">
        <input type="text" id="secretInput" placeholder="ENTER SECRET CODE" autocomplete="off" value="${safeSecret}">
        <span class="icon-link" onclick="copyShortcut()" title="Copy Link">🔗</span>
      </div>
    </div>

    <div id="displayArea" class="display-area hidden">
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
        <button class="btn small" id="qrBtn" onclick="toggleQR()">
          <span class="qr-icon">qr_code_2</span> Show QR
        </button>
      </div>
      <div id="qrContainer" class="qr-container hidden">
         <!-- QR Code will be rendered here if implemented -->
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