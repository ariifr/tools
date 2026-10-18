import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { crc16, parseTLV, decodeEMV, buildQRIS, tagName, tagValue, currencyName } from './qris.js';
import { mccName } from './mcc.js';

// Test vectors generated with an independent Python CRC implementation.
const V1_STATIC =
  '00020101021126600014ID.CO.QRIS.WWW0115ID1020023456789021993600915000000000015115ID10200234567895204581253033605802ID5916TOKO KOPI MAKMUR6013JAKARTA PUSAT61051011062220112INV-2024-0010702016304F5FF';
const V2_DYNAMIC =
  '00020101021226600014ID.CO.QRIS.WWW0115ID1020023456789021993600915000000000015115ID10200234567895204581253033605405250005802ID5916TOKO KOPI MAKMUR6013JAKARTA PUSAT6105101106304B8F5';
const V3_MINIMAL =
  '00020101021153033605802ID5916WARUNG SEDERHANA630495C2';
// 26 sub-tags follow the QRIS layout: 00 acquirer, 01 Merchant PAN, 02 Merchant ID, 03 criteria.
const V4_NESTED_NMID =
  '00020101021126660014ID.CO.QRIS.WWW01189360091502130300880215ID10200234567890303UMI5204581253033605802ID5916TOKO KOPI MAKMUR6013JAKARTA PUSAT61051011063043407';

// Merchant block carrying the NMID at sub-tag 02 (no sub-tag 01), plus the same block
// nested inside tag 51, and a block with the acquirer domain only.
const MERCHANT_BLOCK = '0014ID.CO.QRIS.WWW0215ID10254270234740303UMI';
const TRAILER = '5204581253033605802ID5916TOKO KOPI MAKMUR6013JAKARTA PUSAT610510110';
const V5_ID_AT_SUBTAG_02 = `0002010102112644${MERCHANT_BLOCK}${TRAILER}63048891`;
const V6_NESTED_TAG_51 = `0002010102115144${MERCHANT_BLOCK}${TRAILER}6304F744`;
const V7_ACQUIRER_ONLY = `00020101021126180014ID.CO.QRIS.WWW${TRAILER}630426BA`;

describe('crc16', () => {
  it('matches the standard check value for "123456789"', () => {
    assert.equal(crc16('123456789'), '29B1');
  });

  it('returns FFFF for empty input', () => {
    assert.equal(crc16(''), 'FFFF');
  });

  it('returns an uppercase 4-char hex string', () => {
    assert.match(crc16('A'), /^[0-9A-F]{4}$/);
    assert.equal(crc16('A'), 'B915');
  });
});

describe('parseTLV', () => {
  it('parses a flat payload into entries', () => {
    assert.deepEqual(parseTLV('000201010211'), [
      { tag: '00', length: 2, value: '01' },
      { tag: '01', length: 2, value: '11' },
    ]);
  });

  it('throws on truncated value', () => {
    assert.throws(() => parseTLV('0002010102'), /truncated/i);
  });

  it('throws when declared length overruns the payload', () => {
    assert.throws(() => parseTLV('00020501'), /length/i);
  });

  it('throws on non-numeric tag', () => {
    assert.throws(() => parseTLV('0A0201'), /tag/i);
  });
});

describe('decodeEMV', () => {
  it('decodes merchant detail from a static QRIS payload', () => {
    const d = decodeEMV(V1_STATIC);
    assert.equal(d.merchant.name, 'TOKO KOPI MAKMUR');
    assert.equal(d.merchant.city, 'JAKARTA PUSAT');
    assert.equal(d.merchant.country, 'ID');
    assert.equal(d.merchant.postal, '10110');
    assert.equal(d.mcc.code, '5812');
    assert.equal(d.currency.code, '360');
    assert.equal(d.amount, null);
    assert.equal(d.isDynamic, false);
  });

  it('validates CRC against the independent Python vector', () => {
    const d = decodeEMV(V1_STATIC);
    assert.equal(d.crc.stored, 'F5FF');
    assert.equal(d.crc.valid, true);
  });

  it('opens nested TLV inside merchant account info (26) and additional data (62)', () => {
    const d = decodeEMV(V1_STATIC);
    const mai26 = d.entries.find((e) => e.tag === '26');
    assert.equal(mai26.children.length, 3);
    assert.equal(mai26.children[0].value, 'ID.CO.QRIS.WWW');
    const add62 = d.entries.find((e) => e.tag === '62');
    assert.equal(add62.children.length, 2);
    assert.deepEqual(d.additional, { '01': 'INV-2024-001', '07': '01' });
  });

  it('reads amount and dynamic flag from a dynamic payload', () => {
    const d = decodeEMV(V2_DYNAMIC);
    assert.equal(d.amount, '25000');
    assert.equal(d.isDynamic, true);
    assert.equal(d.crc.stored, 'B8F5');
    assert.equal(d.crc.valid, true);
  });

  it('handles a minimal payload with missing optional fields', () => {
    const d = decodeEMV(V3_MINIMAL);
    assert.equal(d.merchant.name, 'WARUNG SEDERHANA');
    assert.equal(d.merchant.city, null);
    assert.equal(d.mcc.code, null);
    assert.equal(d.crc.valid, true);
  });

  it('extracts NMID from root tag 51', () => {
    assert.equal(decodeEMV(V1_STATIC).nmid, 'ID1020023456789');
  });

  it('extracts NMID from the ID-prefixed sub-tag of a QRIS account', () => {
    const d = decodeEMV(V4_NESTED_NMID);
    assert.equal(d.nmid, 'ID1020023456789');
    assert.equal(d.crc.valid, true);
    const acc = d.accounts.find((a) => a.guid === 'ID.CO.QRIS.WWW');
    assert.equal(acc.mpan, '936009150213030088');
    assert.equal(acc.merchantId, 'ID1020023456789');
    assert.equal(acc.criteria, 'UMI');
  });

  it('leaves NMID null when neither tag 51 nor an ID-prefixed sub-tag exists', () => {
    assert.equal(decodeEMV(V3_MINIMAL).nmid, null);
  });

  it('takes the NMID from sub-tag 02, never from the acquirer domain (sub-tag 00)', () => {
    const d = decodeEMV(V5_ID_AT_SUBTAG_02);
    assert.equal(d.nmid, 'ID1025427023474');
    assert.notEqual(d.nmid, 'ID.CO.QRIS.WWW');
    assert.equal(d.crc.valid, true);
  });

  it('reduces a merchant block nested inside tag 51 to its NMID, without nesting', () => {
    const d = decodeEMV(V6_NESTED_TAG_51);
    assert.equal(d.nmid, 'ID1025427023474');
    assert.equal(d.crc.valid, true);
    const tag51 = d.entries.find((e) => e.tag === '51');
    assert.equal(tag51.children, undefined);
    assert.equal(tagValue('51', tag51.value), 'ID1025427023474');
  });

  it('ignores sub-tag 00 when the payload carries no NMID', () => {
    assert.equal(decodeEMV(V7_ACQUIRER_ONLY).nmid, null);
  });

  it('reports an invalid CRC instead of throwing', () => {
    const tampered = V1_STATIC.slice(0, -4) + '0000';
    const d = decodeEMV(tampered);
    assert.equal(d.crc.stored, '0000');
    assert.equal(d.crc.computed, 'F5FF');
    assert.equal(d.crc.valid, false);
    assert.equal(d.merchant.name, 'TOKO KOPI MAKMUR');
  });

  it('throws on garbage input', () => {
    assert.throws(() => decodeEMV('bukan-qris'), /tag|length|truncated/i);
  });
});

describe('buildQRIS', () => {
  it('converts a static payload to dynamic with the given amount', () => {
    const out = buildQRIS(V1_STATIC, '25000');
    const d = decodeEMV(out);
    assert.equal(d.amount, '25000');
    assert.equal(d.isDynamic, true);
    assert.equal(d.crc.valid, true);
    assert.equal(d.merchant.name, 'TOKO KOPI MAKMUR');
    assert.equal(d.nmid, 'ID1020023456789');
  });

  it('replaces the amount of an already dynamic payload', () => {
    const d = decodeEMV(buildQRIS(V2_DYNAMIC, '30000'));
    assert.equal(d.amount, '30000');
    assert.equal(d.crc.valid, true);
  });

  it('accepts decimal amounts', () => {
    assert.equal(decodeEMV(buildQRIS(V1_STATIC, '12500.50')).amount, '12500.50');
  });

  it('rejects zero, negative, empty, and non-numeric amounts', () => {
    for (const bad of ['0', '-100', '', 'abc', '10.123', '  ']) {
      assert.throws(() => buildQRIS(V1_STATIC, bad), /nominal|amount/i);
    }
  });
});

describe('tagName and currencyName (UI labels)', () => {
  it('names root and nested tags', () => {
    assert.equal(tagName('59'), 'Merchant Name');
    assert.equal(tagName('26'), 'Merchant Info');
    assert.equal(tagName('00', '26'), 'QRIS Acquirer');
    assert.equal(tagName('01', '26'), 'Merchant PAN');
    assert.equal(tagName('02', '26'), 'Merchant ID');
    assert.equal(tagName('03', '26'), 'Merchant Criteria (UMI/UME/UBE)');
    assert.equal(tagName('01', '62'), 'Bill Number');
    assert.equal(tagName('99'), 'Field 99');
  });

  it('names common currencies', () => {
    assert.match(currencyName('360'), /IDR/);
    assert.match(currencyName('999'), /999/);
  });
});

describe('mccName', () => {
  it('resolves a known MCC', () => {
    assert.match(mccName('5812'), /eating/i);
  });

  it('falls back to the raw code for unknown MCC', () => {
    assert.match(mccName('0001'), /0001/);
  });
});

describe('tagValue (TLV display)', () => {
  it('appends the MCC category name to tag 52', () => {
    assert.equal(tagValue('52', '5499'), 'Miscellaneous food stores (5499)');
  });

  it('shows only the NMID for tag 51', () => {
    assert.equal(tagValue('51', MERCHANT_BLOCK), 'ID1025427023474');
    assert.equal(tagValue('51', 'ID1025427023474'), 'ID1025427023474');
  });

  it('falls back to the raw code for an unknown MCC', () => {
    assert.equal(tagValue('52', '0001'), '0001');
  });

  it('leaves other tags untouched', () => {
    assert.equal(tagValue('59', 'TOKO KOPI MAKMUR'), 'TOKO KOPI MAKMUR');
    assert.equal(tagValue('53', '360'), '360');
  });
});
