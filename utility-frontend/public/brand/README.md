# Bharat Connect brand assets

All files in this folder are official NPCI / NBBL **Bharat Connect** assets.

> Colours, proportions, spacing and typography of these assets must never be
> modified. Source of truth: <https://www.bharatbillpay.com/brand-centre/>

The application resolves every asset through `src/lib/brand.ts`
(`BRAND_ASSETS`). Drop files in using **exactly** the filenames below and all
screens pick them up automatically — no code change required.

## Manifest

| File | Status | Used on |
| --- | --- | --- |
| `bharat-connect-logo.png` | **present** (911 x 439) | Top-right brand mark on every Bharat Connect screen, receipt header |
| `bharat-connect-mnemonic.png` | **required** | Homepage hero B mnemonic, category tiles |
| `b-assured.png` | **required** | Payment Successful screen, Payment Receipt |
| `bharat-connect-success.mp3` | **required** | Sonic branding, played on the Payment Successful screen |

### Graceful degradation

Until the three `required` files are added:

- **Mnemonic** — automatically derived by cropping the blue B out of
  `bharat-connect-logo.png` using the exact bounding box
  (`x 66, y 85, w 140, h 268`, see `LOCKUP_GEOMETRY` in `src/lib/brand.ts`).
  Colours and proportions are therefore preserved, but replace it with the
  official standalone mnemonic before compliance submission.
- **B-Assured** — a clearly-marked placeholder renders in its place and a
  console warning is emitted. **This will fail NPCI compliance review** —
  the official mark is mandatory on the success screen and the receipt.
- **Success audio** — the success screen renders normally and the audio is
  silently skipped. NPCI mandates the official clip plays *simultaneously*
  with the "B Assured" display, so this file must be added before submission.

Run `npm run brand:check` to verify which assets are still missing.

## Official palette (sampled from the supplied lockup)

| Token | Hex |
| --- | --- |
| Bharat Connect Blue | `#3C67B1` |
| Bharat Connect Orange | `#F26727` |

## Where to obtain the missing assets

1. **Brand Centre** — <https://www.bharatbillpay.com/brand-centre/> for the
   standalone B mnemonic and the B-Assured mark.
2. **Sonic branding clip** — supplied separately by the NPCI partner-onboarding
   team in the compliance e-mail thread. Convert to `.mp3` if delivered in
   another container, but do not re-master, trim or change the levels.
