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
  <title>Temporary 2FA Manager</title>
  <link rel="stylesheet" type="text/css" href="/src/2fa.css">
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>2FA Generator</h1>
      <p>One-time password generator for temporary accounts</p>
    </div>

    <div class="input-group">
      <label for="secretInput">Enter Secret Code</label>
      <div class="input-wrapper">
        <input type="text" id="secretInput" placeholder="JBSWY3DPEHPK3PXP" maxlength="64" autocomplete="off" value="${safeSecret}">
        <button class="btn" onclick="clearInput()">Clear</button>
      </div>
      <button class="btn primary" onclick="generateFromInput()">
        Generate TOTP
      </button>
    </div>

    <div id="recentSecrets" class="recent-list" style="display:none;"></div>

    <div id="displayArea" class="display-area hidden">
      <div class="code" id="totp">------</div>
      <div class="timer-row">
        <span class="timer-text">Refreshes in</span>
        <span class="timer-seconds" id="seconds">30</span>
        <span class="timer-text">s</span>
      </div>
      <div class="timer-bar">
        <div class="timer-bar-fill" id="bar"></div>
      </div>

      <div class="action-buttons">
        <button class="btn small" id="copyTotpBtn" onclick="copyTOTP()">📋 Copy TOTP</button>
      </div>

      <div class="shortcut-link">
        <span id="shortcutUrl">-</span>
        <button class="btn-copy" onclick="copyShortcut()" id="copyShortcutBtn">Copy Shortcut</button>
      </div>
      <div class="account-info">
        Secret: <span id="currentSecret">-</span>
      </div>
    </div>

    <div id="errorMessage" class="error-message"></div>
  </div>
  <script src="/src/2fa.js"></script>
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