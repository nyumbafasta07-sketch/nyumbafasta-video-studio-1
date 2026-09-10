#!/usr/bin/env node
// Usage: npm run hash-password -- "your-password"
// Prints an APP_PASSWORD_HASH value. Nothing is stored; copy it into .env.
import { scryptSync, randomBytes } from "node:crypto";

const password = process.argv[2];
if (!password) {
  console.error('Usage: npm run hash-password -- "your-password"');
  process.exit(1);
}

const N = 16384;
const r = 8;
const p = 1;
const salt = randomBytes(16);
const hash = scryptSync(password, salt, 64, { N, r, p });
process.stdout.write(
  `APP_PASSWORD_HASH=scrypt:${N}:${r}:${p}:${salt.toString("base64")}:${hash.toString("base64")}\n`,
);
