import assert from 'node:assert/strict';
import { callSignals, compareCallPriority } from '../lib/seeker-touches/call-priority.ts';

const family = (id, timeline, payment, extra = {}) => ({ seeker_id: id, timeline, payment, flags: [], ...extra });
const rows = [
  family('exploring-private', 'exploring', ['Private pay']),
  family('asap-medicaid', 'immediate', ['Medicaid']),
  family('asap-private', 'immediate', ['private_pay']),
  family('reply', null, [], { flags: ['awaiting_reply'] }),
];
assert.deepEqual([...rows].sort(compareCallPriority).map(r => r.seeker_id),
  ['reply', 'asap-private', 'asap-medicaid', 'exploring-private']);
assert.deepEqual(callSignals(family('unknown', null, ['Medicare'])), { asap: false, privatePay: false });
assert.equal(callSignals(family('mixed', 'this_week', ['Medicaid', 'Private pay'])).privatePay, true);
assert.equal(callSignals(family('later', 'within_1_month', [])).asap, false);
const equal = [family('newer', 'immediate', []), family('older', 'immediate', [])];
assert.deepEqual([...equal].sort(compareCallPriority), equal);
assert(compareCallPriority(family('urgent', null, [], { benefits: { urgent_at: '2026-10-07' } }), rows[2]) < 0);
console.log('Family call priority: 6 checks passed');
