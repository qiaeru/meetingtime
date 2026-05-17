import { randomInt } from "node:crypto";

// Alphabet without easily confused glyphs (I/O/L/0/1).
const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

// Uses crypto.randomInt rather than Math.random because the meeting ID is the
// outermost auth gate for guests who do not yet have a token: a PRNG
// observable from a few sampled IDs would let an attacker enumerate active
// meetings.
function block(len: number): string {
  let out = "";
  for (let i = 0; i < len; i++) out += ALPHABET[randomInt(0, ALPHABET.length)];
  return out;
}

export function generateMeetingId(): string {
  return `${block(4)}-${block(4)}`;
}
