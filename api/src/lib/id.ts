import { randomUUID } from "node:crypto";

export function makeId() {
  return randomUUID();
}

// Short, unambiguous invite code for private games (no 0/O/1/I to avoid confusion).
const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export function makeJoinCode(length = 6) {
  let out = "";
  for (let i = 0; i < length; i += 1) {
    out += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)];
  }
  return out;
}
