// QRIS (EMVCo TLV) parser and payload builder — pure module, no DOM dependency.
import { mccName } from './mcc.js';

// Human-readable names for root-level EMVCo tags used by QRIS.
const TAG_NAMES = {
  '00': 'Payload Format Indicator',
  '01': 'Point of Initiation Method',
  '02': 'Visa (merchant account info)',
  '03': 'Visa (merchant account info)',
  '04': 'Mastercard (merchant account info)',
  '05': 'Mastercard (merchant account info)',
  '06': 'EMVCo (merchant account info)',
  '07': 'EMVCo (merchant account info)',
  '08': 'EMVCo (merchant account info)',
  '09': 'Discover (merchant account info)',
  '10': 'Discover (merchant account info)',
  '11': 'Discover (merchant account info)',
  '12': 'Amex (merchant account info)',
  '13': 'Amex (merchant account info)',
  '14': 'Amex (merchant account info)',
  '15': 'JCB (merchant account info)',
  '16': 'JCB (merchant account info)',
  '17': 'JCB (merchant account info)',
  '18': 'UnionPay (merchant account info)',
  '19': 'UnionPay (merchant account info)',
  '20': 'UnionPay (merchant account info)',
  '21': 'UnionPay (merchant account info)',
  '22': 'UnionPay (merchant account info)',
  '26': 'Merchant Info',
  '51': 'NMID (National Merchant ID)',
  '52': 'Merchant Category Code (MCC)',
  '53': 'Transaction Currency (ISO 4217)',
  '54': 'Transaction Amount',
  '55': 'Tip or Convenience Fee (fixed)',
  '56': 'Tip or Convenience Fee (percent)',
  '57': 'Tip or Convenience Fee Category',
  '58': 'Country Code (ISO 3166-1)',
  '59': 'Merchant Name',
  '60': 'Merchant City',
  '61': 'Postal Code',
  '62': 'Additional Data Field',
  '63': 'CRC',
  '64': 'Merchant Information Language',
};

// Sub-tags inside QRIS merchant info (tag 26–51).
const QRIS_ACCOUNT_NAMES = {
  '00': 'QRIS Acquirer',
  '01': 'Merchant PAN',
  '02': 'Merchant ID',
  '03': 'Merchant Criteria (UMI/UME/UBE)',
};

// An NMID always starts with the country prefix followed by digits ("ID1025427023474").
// The acquirer domain ("ID.CO.QRIS.WWW") also starts with "ID", hence the digit check.
// Sub-tag 00 is the acquirer domain and is never used as the NMID.
const NMID_PATTERN = /^ID\d/i;
const NMID_SUBTAGS = ['02', '01', '03'];

// Sub-tags inside additional data field (tag 62).
const ADDITIONAL_NAMES = {
  '01': 'Bill Number',
  '02': 'Mobile Number',
  '03': 'Store Label',
  '04': 'Loyalty Number',
  '05': 'Reference Label',
  '06': 'Customer Label',
  '07': 'Terminal Label',
  '08': 'Transaction Purpose',
  '09': 'Additional Consumer Data',
  '10': 'Merchant Channel',
  '50': 'Merchant URL',
};

const NESTED_TAGS = new Set(['26', '27', '28', '29', '62', '64']);

// CRC-16/CCITT-FALSE: poly 0x1021, init 0xFFFF.
export function crc16(data) {
  let crc = 0xffff;
  for (let i = 0; i < data.length; i++) {
    crc ^= data.charCodeAt(i) << 8;
    for (let j = 0; j < 8; j++) {
      crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, '0');
}

export function tagName(tag, parentTag = null) {
  if (parentTag === '62') return ADDITIONAL_NAMES[tag] ?? `Field ${tag}`;
  if (parentTag != null && String(parentTag).startsWith('2')) return QRIS_ACCOUNT_NAMES[tag] ?? `Field ${tag}`;
  return TAG_NAMES[tag] ?? `Field ${tag}`;
}

// Display value for a TLV row: tag 51 shows only its NMID (sub-tag 02) and tag 52
// shows its category name.
export function tagValue(tag, value) {
  if (value == null || value === '') return value;
  if (tag === '51') return nmidFromTag51(value) ?? value;
  if (tag === '52') {
    const name = mccName(value);
    if (!name || name === '-' || /^(Code|Unknown)\b/.test(String(name))) return value;
    return `${name} (${value})`;
  }
  return value;
}

// Parse one TLV level; children are resolved by decodeEMV.
export function parseTLV(payload) {
  const entries = [];
  let i = 0;
  while (i < payload.length) {
    const tag = payload.slice(i, i + 2);
    if (!/^\d{2}$/.test(tag)) {
      throw new Error(`Invalid tag "${tag}" at offset ${i}`);
    }
    const lenRaw = payload.slice(i + 2, i + 4);
    if (!/^\d{2}$/.test(lenRaw)) {
      throw new Error(`Invalid length "${lenRaw}" for tag ${tag} at offset ${i}`);
    }
    const length = parseInt(lenRaw, 10);
    const value = payload.slice(i + 4, i + 4 + length);
    if (value.length < length) {
      throw new Error(`Truncated value for tag ${tag}: declared length ${length}, got ${value.length}`);
    }
    entries.push({ tag, length, value });
    i += 4 + length;
  }
  if (entries.length === 0) {
    throw new Error('Empty payload: no TLV entries found');
  }
  return entries;
}

function pick(entries, tag) {
  return entries.find((e) => e.tag === tag)?.value ?? null;
}

// NMID is the "ID…" value carried inside the QRIS merchant info (sub-tag 02, sometimes
// 01 or 03), with root tag 51 as the fallback.
function resolveNMID(entries) {
  const accounts = entries.filter((e) => e.tag >= '26' && e.tag <= '51' && e.children);
  for (const tag of NMID_SUBTAGS) {
    for (const acc of accounts) {
      const value = pick(acc.children, tag);
      if (value && NMID_PATTERN.test(value)) return value;
    }
  }
  const root = pick(entries, '51');
  return root == null ? null : nmidFromTag51(root) ?? root;
}

function parseMaybeTLV(payload) {
  try {
    return parseTLV(payload);
  } catch {
    return null; // a plain NMID string is not nested TLV
  }
}

// Tag 51 holds the NMID, but some acquirers wrap the whole merchant block inside it.
// In that case only the NMID sub-tag is kept — the block itself is never displayed
// as nested data.
function nmidFromTag51(value) {
  const children = parseMaybeTLV(value);
  if (!children) return null;
  for (const tag of NMID_SUBTAGS) {
    const child = pick(children, tag);
    if (child && NMID_PATTERN.test(child)) return child;
  }
  return null;
}

export function decodeEMV(payload) {
  const raw = String(payload ?? '').trim();
  const entries = parseTLV(raw);

  for (const entry of entries) {
    if (NESTED_TAGS.has(entry.tag)) {
      entry.children = parseTLV(entry.value);
    }
  }

  // CRC: compare the last 4 chars against the checksum of everything + "6304".
  const stored = pick(entries, '63');
  const crcBody = entries.length && entries[entries.length - 1].tag === '63'
    ? raw.slice(0, raw.length - 4)
    : raw + '6304';
  const computed = crc16(crcBody);
  const crc = { stored, computed, valid: stored != null && stored.toUpperCase() === computed };

  const accounts = [];
  for (const entry of entries.filter((e) => e.tag >= '26' && e.tag <= '51' && e.children)) {
    const children = entry.children;
    accounts.push({
      rootTag: entry.tag,
      guid: pick(children, '00'),
      mpan: pick(children, '01'),
      merchantId: pick(children, '02'),
      criteria: pick(children, '03'),
      nmid: children.find((c) => NMID_PATTERN.test(c.value))?.value ?? null,
    });
  }

  const amount = pick(entries, '54');
  const pointOfInitiation = pick(entries, '01');
  const mcc = pick(entries, '52');
  const currency = pick(entries, '53');
  const additional = Object.fromEntries(
    (entries.find((e) => e.tag === '62')?.children ?? []).map((c) => [c.tag, c.value]),
  );

  return {
    entries,
    merchant: {
      name: pick(entries, '59'),
      city: pick(entries, '60'),
      country: pick(entries, '58'),
      postal: pick(entries, '61'),
    },
    nmid: resolveNMID(entries),
    accounts,
    mcc: mcc == null ? { code: null, name: null } : { code: mcc, name: mccName(mcc) },
    currency: currency == null ? { code: null, name: null } : { code: currency, name: currencyName(currency) },
    amount,
    isDynamic: pointOfInitiation === '12',
    additional,
    crc,
  };
}

const CURRENCIES = { '360': 'IDR (Indonesian Rupiah)', '840': 'USD (US Dollar)' };

export function currencyName(code) {
  return CURRENCIES[String(code)] ?? `Code ${code}`;
}

// Convert a static payload into a dynamic one with the given amount (tag 54).
// Replaces an existing amount if the payload is already dynamic.
export function buildQRIS(payload, amount) {
  const normalized = validateAmount(amount);
  const decoded = decodeEMV(payload);
  const body = [];
  let amountWritten = false;

  for (const entry of decoded.entries) {
    if (entry.tag === '54') continue; // dropped, re-inserted in canonical position
    if (entry.tag === '63') continue; // stale CRC is dropped, recomputed below
    if (entry.tag === '01') {
      body.push('010212'); // static (11) -> dynamic (12)
      continue;
    }
    if (entry.tag === '53' && !amountWritten) {
      body.push(`53${entry.value.length.toString().padStart(2, '0')}${entry.value}`);
      body.push(`54${normalized.length.toString().padStart(2, '0')}${normalized}`);
      amountWritten = true;
      continue;
    }
    body.push(`${entry.tag}${entry.value.length.toString().padStart(2, '0')}${entry.value}`);
  }

  if (!amountWritten) {
    // No currency tag found — append amount at the end (payload stays parseable).
    body.push(`54${normalized.length.toString().padStart(2, '0')}${normalized}`);
  }

  const withoutCrc = body.join('') + '6304';
  return withoutCrc + crc16(withoutCrc);
}

function validateAmount(amount) {
  const raw = String(amount ?? '').trim();
  if (!/^\d+(\.\d{1,2})?$/.test(raw) || Number(raw) <= 0) {
    throw new Error('Nominal tidak valid: masukkan angka lebih dari 0 (maksimal 2 desimal).');
  }
  return raw;
}
