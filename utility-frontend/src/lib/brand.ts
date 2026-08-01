/**
 * Bharat Connect (formerly BBPS) brand constants.
 *
 * Source of truth: NPCI / NBBL Bharat Connect Brand Centre
 * https://www.bharatbillpay.com/brand-centre/
 *
 * Colours and geometry below were sampled directly from the official
 * Bharat Connect lockup supplied by NPCI and MUST NOT be altered.
 */

export const BHARAT_CONNECT = {
  /** Official product name. Never render "BBPS" in customer-facing UI. */
  name: "Bharat Connect",
  legalName: "NPCI Bharat BillPay Ltd. (NBBL)",
  brandCentreUrl: "https://www.bharatbillpay.com/brand-centre/",
} as const

/** Official palette sampled from the supplied lockup. Do not modify. */
export const BRAND_COLORS = {
  blue: "#3C67B1",
  orange: "#F26727",
} as const

/**
 * Brand asset paths served from /public/brand.
 *
 * `logoLockup` ships with the repo. The remaining files are distributed
 * separately by NPCI — drop them into /public/brand using exactly these
 * names and every screen picks them up automatically.
 * See /public/brand/README.md for the manifest.
 * 
 * Note: Paths are prefixed with /app/ because the dashboard is served from /app/.
 */
export const BRAND_ASSETS = {
  /** Full horizontal lockup: B mnemonic + "Bharat Connect" wordmark. */
  logoLockup: "/app/brand/bharat-connect-logo.png",
  /** Standalone B mnemonic. Falls back to a crop of the lockup if absent. */
  mnemonic: "/app/brand/bharat-connect-mnemonic.png",
  /** B-Assured trust mark, shown on payment success + receipts. */
  assured: "/app/brand/b-assured.png",
  /** Official sonic branding clip played on the payment success screen. */
  successAudio: "/app/brand/bharat-connect-success.mp3",
} as const

/**
 * Intrinsic geometry of `logoLockup` (911 x 439 px) and the bounding box of
 * the blue B mnemonic inside it. Used to derive the standalone mnemonic by
 * cropping — which preserves the official colours and proportions exactly —
 * whenever the standalone asset has not been dropped in yet.
 */
export const LOCKUP_GEOMETRY = {
  width: 911,
  height: 439,
  /** Trimmed content box of the whole lockup (no surrounding whitespace). */
  content: { x: 66, y: 85, width: 797, height: 268 },
  /** Bounding box of the blue B mnemonic only. */
  mnemonic: { x: 66, y: 85, width: 140, height: 268 },
} as const

export const LOCKUP_ASPECT = LOCKUP_GEOMETRY.content.width / LOCKUP_GEOMETRY.content.height
export const MNEMONIC_ASPECT = LOCKUP_GEOMETRY.mnemonic.width / LOCKUP_GEOMETRY.mnemonic.height

/**
 * MobiKwik complaint management system, integrated with Bharat Connect.
 * Mandated by NPCI for complaint registration hand-off.
 */
export const COMPLAINT_PORTAL = {
  mobile: "https://m.mobikwik.com/help/createticket/bbpscomplaint",
  desktop: "https://www.mobikwik.com/help/bbpscomplaint",
} as const

export function complaintPortalUrl(): string {
  if (typeof window === "undefined") return COMPLAINT_PORTAL.desktop
  const isMobile =
    window.matchMedia("(max-width: 767px)").matches ||
    /android|iphone|ipad|ipod|mobile/i.test(window.navigator.userAgent)
  return isMobile ? COMPLAINT_PORTAL.mobile : COMPLAINT_PORTAL.desktop
}

/**
 * Live Bharat Connect biller categories.
 * `slug` is the stable identifier used in routes and by the backend.
 */
export interface BharatConnectCategory {
  slug: string
  name: string
  /** lucide-react icon name, resolved in the UI layer. */
  icon: string
  description: string
  live: boolean
}

export const BHARAT_CONNECT_CATEGORIES: BharatConnectCategory[] = [
  { slug: "electricity", name: "Electricity", icon: "Zap", description: "Pay electricity bills for all state boards & private discoms", live: true },
  { slug: "water", name: "Water", icon: "Droplets", description: "Municipal and metro water supply bills", live: true },
  { slug: "gas", name: "Gas", icon: "Flame", description: "Piped natural gas (PNG) bills", live: true },
  { slug: "lpg-cylinder", name: "LPG Cylinder", icon: "Cylinder", description: "Book and pay for LPG cylinder refills", live: true },
  { slug: "broadband", name: "Broadband", icon: "Wifi", description: "Fibre and wired broadband bills", live: true },
  { slug: "landline", name: "Landline Postpaid", icon: "PhoneCall", description: "Landline postpaid bills", live: true },
  { slug: "mobile-postpaid", name: "Mobile Postpaid", icon: "Smartphone", description: "Postpaid mobile bills for all operators", live: true },
  { slug: "fastag", name: "FASTag", icon: "CreditCard", description: "Recharge FASTag for all issuing banks", live: true },
  { slug: "insurance", name: "Insurance Premium", icon: "ShieldCheck", description: "Life, health and general insurance premiums", live: true },
  { slug: "loan-emi", name: "Loan Repayment", icon: "Landmark", description: "Loan EMI repayment for NBFCs and banks", live: true },
  { slug: "municipal-taxes", name: "Municipal Taxes", icon: "Building2", description: "Property tax and municipal dues", live: true },
  { slug: "municipal-services", name: "Municipal Services", icon: "Building", description: "Other municipal service charges", live: true },
  { slug: "education-fees", name: "Education Fees", icon: "GraduationCap", description: "School, college and university fees", live: true },
  { slug: "housing-society", name: "Housing Society", icon: "Home", description: "Housing society maintenance dues", live: true },
  { slug: "cable-tv", name: "Cable TV", icon: "Tv", description: "Cable TV subscription bills", live: true },
  { slug: "subscription", name: "Subscription", icon: "Repeat", description: "OTT and recurring subscription payments", live: true },
  { slug: "hospital", name: "Hospital", icon: "HeartPulse", description: "Hospital and diagnostic centre bills", live: true },
  { slug: "credit-card", name: "Credit Card", icon: "CreditCard", description: "Credit card bill payments", live: true },
  { slug: "clubs-associations", name: "Clubs & Associations", icon: "Users", description: "Club and association membership dues", live: true },
  { slug: "rental", name: "Rental", icon: "KeyRound", description: "Rent payments to registered billers", live: true },
]

export const LIVE_CATEGORIES = BHARAT_CONNECT_CATEGORIES.filter((c) => c.live)
