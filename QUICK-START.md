# Quick Start Guide - UtiliPay Hub

## 🚀 Getting Started

### Prerequisites
- Node.js 18+ installed
- npm or yarn package manager

### Installation

#### 1. Install Landing Page Dependencies
```bash
cd landingpage-frontend
npm install
```

#### 2. Install Utility Frontend Dependencies
```bash
cd utility-frontend
npm install
```

### Running the Applications

#### Development Mode

**Start Both Applications** (use 2 terminals):

**Terminal 1 - Landing Page:**
```bash
cd landingpage-frontend
npm run dev
```
→ Opens on http://localhost:3000

**Terminal 2 - Utility Frontend:**
```bash
cd utility-frontend
npm run dev
```
→ Opens on http://localhost:5173

### Testing the Integration

1. Visit: http://localhost:3000
2. Click any "Login" or "Get Started" button
3. You'll be redirected to: http://localhost:5173/login
4. Select role (Admin or Retailer)
5. Enter any email/password (mock auth)
6. Access the dashboard!

## 📱 Applications Overview

### Landing Page (Port 3000)
**Purpose**: Public marketing website
**Pages**:
- `/` - Home page
- `/services` - Service catalog
- `/about` - About us
- `/contact` - Contact form
- `/partner` - Partner program
- `/privacy-policy` - Privacy policy
- `/terms` - Terms & conditions
- `/refund-policy` - Refund policy

### Utility Frontend (Port 5173)
**Purpose**: Main application with dashboards
**Access**:
- `/login` - Login page (public)
- `/admin/*` - Admin dashboard (protected)
- `/retailer/*` - Retailer dashboard (protected)

## 🔐 Mock Login Credentials

Currently using **mock authentication** - any credentials work!

**Examples**:
- Email: `admin@test.com` | Password: `anything`
- Email: `retailer@test.com` | Password: `123456`

**Steps**:
1. Go to login page
2. Select **Admin** or **Retailer** tab
3. Enter any email and password
4. Click "Login"

## 🎨 Features

### Landing Page
- ✅ Responsive design (mobile, tablet, desktop)
- ✅ Dark mode support
- ✅ SEO optimized
- ✅ Framer Motion animations
- ✅ Contact form
- ✅ Service catalog
- ✅ FAQ section
- ✅ Testimonials

### Utility Frontend - Admin Panel
- ✅ Dashboard with stats and charts
- ✅ Service management (8 modules)
- ✅ User management
- ✅ Product & order management
- ✅ Fund requests & transfers
- ✅ Reports (service, account, commission)
- ✅ Company & payout banks
- ✅ Settings (profile, security, API keys)

### Utility Frontend - Retailer Panel
- ✅ Dashboard with analytics
- ✅ Profile management
- ✅ KYC wizard (8 steps)
- ✅ Services hub (AEPS, BBPS, etc.)
- ✅ Reports (5 types)
- ✅ Commission tracking
- ✅ GST & TDS reports
- ✅ Settings (password, 2FA, sessions)

## 🛠️ Tech Stack

### Landing Page
- Next.js 14
- TypeScript
- Tailwind CSS
- Framer Motion
- Lucide Icons
- next-themes

### Utility Frontend
- Vite
- React 18
- TypeScript
- Tailwind CSS
- Shadcn UI
- TanStack Table
- Recharts
- React Hook Form
- Zod
- Lucide Icons

## 📝 Development Tips

### Hot Reload
Both applications support hot module replacement (HMR):
- Save any file and see changes instantly
- No need to refresh the browser

### Build for Production

**Landing Page:**
```bash
cd landingpage-frontend
npm run build
npm run start
```

**Utility Frontend:**
```bash
cd utility-frontend
npm run build
npm run preview
```

### Linting

**Landing Page:**
```bash
cd landingpage-frontend
npm run lint
```

**Utility Frontend:**
```bash
cd utility-frontend
npm run lint
```

## 🐛 Common Issues

### Port Already in Use
```bash
# Find and kill process on port
# Windows:
netstat -ano | findstr :3000
taskkill /PID <PID> /F

# Or change port in package.json
"dev": "next dev -p 3001"
```

### Module Not Found
```bash
# Clear cache and reinstall
rm -rf node_modules package-lock.json
npm install
```

### Environment Variables Not Working
```bash
# Make sure .env.local exists
# Restart dev server after changes
```

## 📚 Documentation

- **INTEGRATION.md** - Detailed integration guide
- **update.md** - Complete update summary
- **README.md** - Project-specific documentation

## 🎯 Next Steps

1. ✅ Test login flow
2. ✅ Explore admin dashboard
3. ✅ Explore retailer dashboard
4. 🔲 Connect to real backend API
5. 🔲 Implement real authentication
6. 🔲 Deploy to production

## 🚀 Production Deployment

See **INTEGRATION.md** for detailed deployment strategies:
- Option 1: Same domain with reverse proxy
- Option 2: Separate subdomains

## 💡 Support

For questions or issues:
- Check documentation files
- Review code comments
- Test with mock authentication first

---

**Happy Coding! 🎉**
