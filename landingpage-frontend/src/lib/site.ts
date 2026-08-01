export const siteConfig = {
  name: "UTILIPAY HUB",
  legalName: "UTILIPAY HUB (OPC) PRIVATE LIMITED",
  shortName: "UtiliPay Hub",
  tagline: "One Platform for Recharge, Bill Payments & Digital Utility Services",
  description:
    "UTILIPAY HUB (OPC) PRIVATE LIMITED offers BBPS-enabled recharge, utility bill payments, FASTag, and fintech payment solutions with enterprise-grade security and instant settlements.",
  url: "https://www.utilipayhub.com",
  ogImage: "/utili-logo.jpeg",
  logo: "/utili-logo.jpeg",
  cin: "U62099PB2026OPC068915",
  gst: "03AAECU2233L1ZI",
  phone: "+91 1762490887",
  phoneRaw: "911762490887",
  email: "UTILIPAYHUP@GMAIL.COM",
  whatsapp: "918699995732",
  whatsappDisplay: "+91 8699995732",
  address:
    "420, 4th Floor, Metro Trade Center, VIP Road, Zirakpur, Mohali - 140603",
  social: {
    instagram:
      "https://www.instagram.com/utilipayhub?utm_source=qr&igsh=NGR1dTF4c3J5eThm",
    facebook: "https://www.facebook.com/share/19E2MFkEt9/",
    twitter: "https://x.com/Utilipay",
    linkedin:
      "https://www.linkedin.com/in/utilipay-hub-384258425?utm_source=share_via&utm_content=profile&utm_medium=member_android",
    youtube: "https://youtube.com/@utilipayhub?si=PQlQtCTKI4a3qUpn",
  },
};

export const navLinks = [
  { label: "Home", href: "/" },
  { label: "Services", href: "/services" },
  { label: "Partner", href: "/partner" },
  { label: "About", href: "/about" },
  { label: "Contact", href: "/contact" },
];

export const legalLinks = [
  { label: "Privacy Policy", href: "/privacy-policy" },
  { label: "Terms & Conditions", href: "/terms" },
  { label: "Refund Policy", href: "/refund-policy" },
];

/**
 * Links into the dashboard application.
 *
 * These default to same-origin paths because nginx serves this marketing site at
 * utilipayhub.com/ and the dashboard at utilipayhub.com/app/. A relative path
 * needs no build-time configuration, works identically in every environment, and
 * cannot end up pointing at localhost in a production bundle — which is the
 * failure mode of baking an absolute URL into a NEXT_PUBLIC_* variable.
 *
 * The environment overrides exist for a deployment that puts the dashboard on its
 * own subdomain instead.
 *
 * There is no separate registration screen: the dashboard handles sign-up on the
 * login page, so both links resolve there.
 */
export const appUrls = {
  base: process.env.NEXT_PUBLIC_APP_URL || "/app",
  login: process.env.NEXT_PUBLIC_APP_LOGIN_URL || "/app/login",
  register: process.env.NEXT_PUBLIC_APP_REGISTER_URL || "/app/login",
};
