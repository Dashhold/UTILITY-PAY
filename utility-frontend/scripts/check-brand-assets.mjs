#!/usr/bin/env node
/**
 * Verifies that every official Bharat Connect brand asset required for NPCI
 * compliance submission is present in /public/brand.
 *
 * Exits non-zero when a mandatory asset is missing so CI can gate releases.
 */
import { existsSync, statSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { dirname, join, resolve } from "node:path"

const here = dirname(fileURLToPath(import.meta.url))
const publicDir = resolve(here, "..", "public")

const ASSETS = [
  {
    file: "brand/bharat-connect-logo.png",
    required: true,
    usedOn: "Top-right brand mark on every Bharat Connect screen",
  },
  {
    file: "brand/bharat-connect-mnemonic.png",
    required: false,
    usedOn: "Homepage B mnemonic (falls back to a crop of the lockup)",
  },
  {
    file: "brand/b-assured.png",
    required: true,
    usedOn: "Payment Successful screen and Payment Receipt",
  },
  {
    file: "brand/bharat-connect-success.mp3",
    required: true,
    usedOn: "Sonic branding on the Payment Successful screen",
  },
]

let missingRequired = 0
const rows = []

for (const asset of ASSETS) {
  const path = join(publicDir, asset.file)
  const present = existsSync(path) && statSync(path).size > 0
  if (!present && asset.required) missingRequired++
  rows.push({
    Asset: asset.file,
    Status: present ? "present" : asset.required ? "MISSING (blocks submission)" : "missing (fallback active)",
    "Used on": asset.usedOn,
  })
}

console.log("\nBharat Connect brand asset check\n")
console.table(rows)

if (missingRequired > 0) {
  console.error(
    `\n${missingRequired} mandatory brand asset(s) missing. ` +
      "Add them to public/brand — see public/brand/README.md.\n"
  )
  process.exit(1)
}

console.log("\nAll mandatory Bharat Connect brand assets present.\n")
