# UTILIPAY HUB — Fintech Landing Website

Premium, production-ready marketing website for **UTILIPAY HUB (OPC) PRIVATE LIMITED** — a digital payments, recharge, and BBPS-enabled utility bill payment platform.

## Tech Stack

- **Next.js 14** (App Router)
- **TypeScript**
- **Tailwind CSS** (custom brand theme: white + yellow + grey)
- **Framer Motion** (scroll & micro animations)
- **next-themes** (dark + light mode)
- **lucide-react** (icons)

## Features

- Sticky, responsive navbar with animated active indicator
- Dark / light theme toggle (system aware)
- Animated statistics counters
- Scroll-reveal animations throughout
- Floating WhatsApp button
- SEO metadata, Open Graph, Twitter cards, JSON-LD structured data
- Dynamic `sitemap.xml`, `robots.txt`, and PWA manifest
- Fully mobile responsive, glassmorphism accents, soft shadows
- Blog-ready component architecture

## Pages

| Route | Description |
| --- | --- |
| `/` | Home — hero, services, why choose us, BBPS highlight, how it works, stats, testimonials, FAQ, CTA |
| `/services` | All services grouped by category |
| `/partner` | Partner benefits, onboarding flow, registration form |
| `/about` | Mission, vision, trust indicators, positioning |
| `/contact` | Contact details + message form |
| `/privacy-policy` | Privacy Policy |
| `/terms` | Terms & Conditions |
| `/refund-policy` | Refund Policy |

## Getting Started

```bash
npm install
npm run dev      # start dev server at http://localhost:3000
npm run build    # production build
npm run start    # run production build
```

## Project Structure

```
src/
├── app/                  # App Router pages, layout, SEO routes
├── components/
│   ├── about/            # About page client bits
│   ├── forms/            # Contact & Partner forms
│   ├── home/             # Home page sections
│   ├── layout/           # Navbar, Footer, Logo, WhatsApp, PageHeader
│   ├── legal/            # Legal content renderer
│   ├── partner/          # Partner page client bits
│   ├── providers/        # Theme provider
│   ├── seo/              # JSON-LD structured data
│   └── ui/               # Reusable UI (Reveal, ServiceCard, counters...)
├── data/                 # Services & content data
└── lib/                  # Site config
```

## Customization

- **Brand & contact info:** `src/lib/site.ts`
- **Services:** `src/data/services.ts`
- **Testimonials / FAQ / stats / features:** `src/data/content.ts`
- **Theme colors:** `tailwind.config.ts`

## Notes

- The Contact and Partner forms are wired with simulated submission. Connect them to your API, email service, or CRM in `src/components/forms/`.
- Replace `siteConfig.url` in `src/lib/site.ts` with your production domain for correct SEO/OG URLs.
