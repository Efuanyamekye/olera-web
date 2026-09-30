/**
 * Family letters and texts speak as Olera, never as TJ (TJ, 2026-09-30).
 *
 *   npx tsx scripts/check-olera-voice.ts
 */
import assert from "node:assert/strict";
import { inOleraVoice, writtenAsTj } from "../lib/family-comms/olera-voice";

const letter = "Hi Maria, it's TJ with Olera. You used our benefits finder in April.\n\nYou can reply to this email. My team and I read every reply.\n\nTJ\nOlera";
const out = inOleraVoice(letter);
assert.equal(out, "Hi Maria, this is Olera. You used our benefits finder in April.\n\nYou can reply to this email. A person on our team reads every reply.\n\nOlera");
assert.equal(writtenAsTj(letter), true);
assert.equal(writtenAsTj(out), false);
assert.equal(inOleraVoice("Hi, it's TJ from Olera."), "Hi, this is Olera.");
assert.equal(inOleraVoice("Thanks.\n\nTJ, Olera"), "Thanks.\n\nOlera");
assert.equal(inOleraVoice("Thanks.\n\nTJ"), "Thanks.\n\nOlera");
assert.equal(inOleraVoice("TJ from Olera: call 2-1-1."), "Olera: call 2-1-1.");
// A family whose own first name is TJ keeps it; only the sender changes.
assert.equal(inOleraVoice("Hi TJ, it's TJ with Olera."), "Hi TJ, this is Olera.");
// Already in Olera's voice: unchanged.
const clean = "Hi, this is Olera. Call 2-1-1.\n\nOlera";
assert.equal(inOleraVoice(clean), clean);
console.log("olera voice checks passed");
