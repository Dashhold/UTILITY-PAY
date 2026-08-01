# UtiliPay Hub - Complete Fintech Platform

**UTILIPAY HUB (OPC) PRIVATE LIMITED** - Digital Payments, Recharge & Utility Bill Payment Platform

---

## 🎯 Project Overview

This project consists of two integrated applications:

1. **Landing Page** (Next.js) - Public marketing website
2. **Utility Frontend** (Vite + React) - Admin & Retailer dashboards

The landing page seamlessly redirects users to the main application for authentication and dashboard access.

---

## 🚀 Quick Start

### Prerequisites
- Node.js 18+
- npm or yarn

### Installation & Running

```bash
# Terminal 1 - Landing Page (Port 3000)
cd landingpage-frontend
npm install
npm run dev

# Terminal 2 - Utility Frontend (Port 5173)
cd utility-frontend
npm install
npm run dev
```

**Visit**: http://localhost:3000

Click any "Login" or "Get Started" button to be redirected to the application!

---

## 📚 Documentation

| Document | Description |
|----------|-------------|
| **[QUICK-START.md](./QUICK-START.md)** | Fast setup and basic usage |
| **[INTEGRATION.md](./INTEGRATION.md)** | Complete integration guide |
| **[ARCHITECTURE.md](./ARCHITECTURE.md)** | System architecture overview |
| **[PRODUCTION-CHECKLIST.md](./PRODUCTION-CHECKLIST.md)** | Pre-deployment checklist |
| **[update.md](./update.md)** | Detailed change log |

---

## 🏗️ Architecture

```
Landing Page (Next.js)          Utility Frontend (Vite + React)
Port: 3000                      Port: 5173
     │                                │
     │  All Login/Register            │
     │  buttons redirect              │
     └────────────────────────────────┤
                                      │
                            ┌─────────┴─────────┐
                            │                   │
                      /admin/*            /retailer/*
                   (Protected)          (Protected)
```

---

## 🎨 Tech Stack

### Landing Page
- **Framework**: Next.js 14
- **Language**: TypeScript
- **Styling**: Tailwind CSS
- **Animations**: Framer Motion
- **Icons**: Lucide React
- **Theme**: next-themes

### Utility Frontend
- **Build Tool**: Vite
- **Framework**: React 18
- **Language**: TypeScript
- **Styling**: Tailwind CSS
- **UI Components**: Shadcn UI
- **Forms**: React Hook Form + Zod
- **Tables**: TanStack Table
- **Charts**: Recharts
- **Icons**: Lucide React

---

## 🎯 Features

### Landing Page
✅ Responsive design (mobile, tablet, desktop)
✅ Dark mode support
✅ SEO optimized
✅ Smooth animations
✅ Contact form
✅ Service catalog
✅ FAQ section
✅ Partner program

### Admin Panel
✅ Dashboard with analytics
✅ Service management (8 modules)
✅ User management
✅ Product & order management
✅ Fund requests & transfers
✅ Multiple reports
✅ Bank management
✅ Settings & security

### Retailer Panel
✅ Dashboard with stats
✅ Profile management
✅ KYC wizard (8 steps)
✅ Services hub (AEPS, BBPS)
✅ Multiple reports
✅ Commission tracking
✅ GST & TDS reports
✅ Account settings

---

## 🔐 Authentication

**Current**: Mock authentication (development)
- Any email/password works
- Select role: Admin or Retailer
- Session stored in localStorage

**Production**: Requires real backend API
- See [PRODUCTION-CHECKLIST.md](./PRODUCTION-CHECKLIST.md)

---

## 🌐 URL Configuration

### Development
```env
NEXT_PUBLIC_APP_URL=http://localhost:5173
NEXT_PUBLIC_APP_LOGIN_URL=http://localhost:5173/login
NEXT_PUBLIC_APP_REGISTER_URL=http://localhost:5173/login
```

### Production (Example)
```env
NEXT_PUBLIC_APP_URL=https://app.utilipayhub.com
NEXT_PUBLIC_APP_LOGIN_URL=https://app.utilipayhub.com/login
NEXT_PUBLIC_APP_REGISTER_URL=https://app.utilipayhub.com/login
```

Create `.env.local` in `landingpage-frontend/` with your URLs.

---

## 📂 Project Structure

```
utility-pay/
├── landingpage-frontend/      # Next.js marketing site
│   ├── src/
│   │   ├── app/               # Pages & routes
│   │   ├── components/        # React components
│   │   └── lib/               # Utilities & config
│   ├── public/                # Static assets
│   └── .env.local             # Environment variables
│
├── utility-frontend/          # Vite application
│   ├── src/
│   │   ├── pages/             # Route pages
│   │   ├── components/        # React components
│   │   ├── context/           # State management
│   │   └── lib/               # Utilities
│   └── public/                # Static assets
│
└── docs/                      # Documentation
    ├── QUICK-START.md
    ├── INTEGRATION.md
    ├── ARCHITECTURE.md
    └── PRODUCTION-CHECKLIST.md
```

---

## 🧪 Testing

### Landing Page
```bash
cd landingpage-frontend
npm run lint
npm run build
```

### Utility Frontend
```bash
cd utility-frontend
npm run lint
npm run build
```

---

## 🚀 Deployment

### Landing Page (Recommended: Vercel)
```bash
cd landingpage-frontend
npm run build
# Deploy to Vercel, Netlify, or custom server
```

### Utility Frontend (Recommended: Vercel/Netlify)
```bash
cd utility-frontend
npm run build
# Deploy to Vercel, Netlify, or custom server
```

See [INTEGRATION.md](./INTEGRATION.md) for detailed deployment strategies.

---

## 🔧 Configuration

### Key Files

**Landing Page:**
- `landingpage-frontend/.env.local` - Environment variables
- `landingpage-frontend/src/lib/site.ts` - Site configuration
- `landingpage-frontend/next.config.mjs` - Next.js config

**Utility Frontend:**
- `utility-frontend/src/context/auth-context.tsx` - Auth logic
- `utility-frontend/src/App.tsx` - Route configuration
- `utility-frontend/vite.config.ts` - Vite config

---

## 🐛 Troubleshooting

### Port already in use
```bash
# Kill process on Windows
netstat -ano | findstr :3000
taskkill /PID <PID> /F
```

### Module not found
```bash
rm -rf node_modules package-lock.json
npm install
```

### Environment variables not working
- Ensure `.env.local` exists in `landingpage-frontend/`
- Restart dev server after changes
- Variables must start with `NEXT_PUBLIC_`

---

## 📈 Roadmap

### Phase 1 (Current) ✅
- Landing page with marketing content
- Utility frontend with admin & retailer panels
- Mock authentication
- Protected routes
- Integration between both apps

### Phase 2 (Next)
- Real backend API
- Database integration
- Real authentication
- Payment gateway
- Email notifications

### Phase 3 (Future)
- Mobile apps (React Native)
- Advanced analytics
- Real-time features
- Multi-language support
- Advanced reporting

---

## 👥 Company Information

**Company**: UTILIPAY HUB (OPC) PRIVATE LIMITED  
**CIN**: U62099PB2026OPC068915  
**GST**: 03AAECU2233L1ZI  
**Phone**: +91 1762490887  
**Email**: UTILIPAYHUP@GMAIL.COM  
**WhatsApp**: +91 8699995732  
**Address**: 420, 4th Floor, Metro Trade Center, VIP Road, Zirakpur, Mohali - 140603

---

## 📄 License

Proprietary - All rights reserved by UTILIPAY HUB (OPC) PRIVATE LIMITED

---

## 🤝 Support

For setup help or questions:
1. Check documentation files
2. Review code comments
3. Test with mock authentication
4. Contact development team

---

## 🎉 Status

**Development**: ✅ Complete  
**Integration**: ✅ Complete  
**Authentication**: ⚠️ Mock (development only)  
**Backend API**: ⏳ Pending  
**Production Ready**: ⏳ Requires backend

---

**Built with ❤️ for digital payments in India**
