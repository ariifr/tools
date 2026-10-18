// Server-side proxy for the Axis/XL quota lookup.
//
// The upstream URL, Basic auth and X-API-Key never leave the server: the browser only
// calls GET /api/kuota?msisdn=... . Credentials can be overridden with Pages env vars:
//   KUOTA_API_AUTH, KUOTA_API_KEY, KUOTA_APP_VERSION, KUOTA_API_BASE
//
// Deploy tip: set those variables in the Pages project (Settings > Environment
// variables) so the fallbacks below are never used.

const DEFAULT_BASE = 'https://apigw.kmsp-store.com/sidompul/v4/cek_kuota';
const DEFAULT_AUTH = 'Basic c2lkb21wdWxhcGk6YXBpZ3drbXNw';
const DEFAULT_KEY = '60ef29aa-a648-4668-90ae-20951ef90c55';
const DEFAULT_VERSION = '4.0.0';
const TIMEOUT_MS = 15000;

export async function onRequestGet(context) {
  const { request, env } = context;
  const msisdn = normalizeMsisdn(new URL(request.url).searchParams.get('msisdn'));

  if (!msisdn) {
    return json({ status: false, message: 'Nomor tidak valid. Gunakan format 08xxxxxxxxxx atau 628xxxxxxxxxx.' }, 400);
  }

  const base = env.KUOTA_API_BASE || DEFAULT_BASE;
  const target = `${base}?msisdn=${encodeURIComponent(msisdn)}&isJSON=true`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const upstream = await fetch(target, {
      headers: {
        Authorization: env.KUOTA_API_AUTH || DEFAULT_AUTH,
        'X-API-Key': env.KUOTA_API_KEY || DEFAULT_KEY,
        'X-App-Version': env.KUOTA_APP_VERSION || DEFAULT_VERSION,
        Accept: 'application/json',
      },
      signal: controller.signal,
    });

    const body = await upstream.text();
    let payload;
    try {
      payload = JSON.parse(body);
    } catch {
      return json({ status: false, message: 'Respons tidak valid dari server kuota.' }, 502);
    }

    return json(payload, upstream.ok ? 200 : 502);
  } catch (error) {
    const timedOut = error && error.name === 'AbortError';
    return json(
      {
        status: false,
        message: timedOut
          ? 'Server kuota tidak merespons (timeout). Coba lagi.'
          : 'Gagal menghubungi server kuota.',
      },
      timedOut ? 504 : 502,
    );
  } finally {
    clearTimeout(timer);
  }
}

// Accepts 08xx, 8xx, 628xx and +628xx; anything else is rejected.
function normalizeMsisdn(raw) {
  let digits = String(raw == null ? '' : raw).replace(/[^\d]/g, '');
  if (digits.startsWith('8')) digits = `0${digits}`;
  return /^(0|62)8\d{7,12}$/.test(digits) ? digits : '';
}

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}
