# 🧪 FRONTEND TESTING GUIDE - Bharat Connect UAT

## 📋 Overview
This guide covers ALL frontend tests you need to perform to verify Bharat Connect compliance before UAT submission.

---

## 🚀 STEP 1: Deploy Latest Changes

### Option A: Quick Update (Recommended)
```bash
# On production server (13.202.102.229)
cd /home/ubuntu/utility-pay
git pull origin main

# Update frontend dist
cd utility-frontend
# Assets are already in dist/, just verify:
ls -lh dist/brand/

# Restart services
docker-compose restart frontend
```

### Option B: Full Rebuild
```bash
# On production server
cd /home/ubuntu/utility-pay
git pull origin main

# Rebuild and deploy
docker-compose down
docker-compose build frontend backend
docker-compose up -d
```

---

## ✅ STEP 2: Verify Brand Assets are Accessible

### Test 1: Check All Brand Assets Load
Open these URLs in browser (replace with your domain):

1. **Sonic Branding Audio** (CRITICAL)
   ```
   https://utilipayhub.com/app/brand/sonic-branding.mp3
   ```
   ✅ Expected: MP3 file downloads (159 KB)
   ❌ If 404: Assets not deployed correctly

2. **B Mnemonic PNG**
   ```
   https://utilipayhub.com/app/brand/b-mnemonic.png
   ```
   ✅ Expected: Blue "B" logo displays (12.7 KB)

3. **B-Assured Logo PNG**
   ```
   https://utilipayhub.com/app/brand/b-assured.png
   ```
   ✅ Expected: "B Assured" logo displays (100 KB)

4. **Bharat Connect Lockup**
   ```
   https://utilipayhub.com/app/brand/bharat-connect-logo.png
   ```
   ✅ Expected: Full "Bharat Connect" logo displays (27 KB)

### Test 2: Browser Network Tab Verification
1. Open browser DevTools (F12)
2. Go to Network tab
3. Load: `https://utilipayhub.com/app/`
4. Check for brand assets:
   - ✅ All files should return `200 OK`
   - ✅ Cache-Control should be `max-age=31536000` (1 year)
   - ❌ If 404: Check nginx config or file paths

---

## 🎨 STEP 3: UI Compliance Testing (7 Screens Required)

### Screen 1: Homepage with B Mnemonic ⭐ CRITICAL
**URL**: `https://utilipayhub.com/app/`

**What to Check**:
- [ ] Blue "B" mnemonic logo is visible in hero section (left side)
- [ ] Logo is crisp and not pixelated
- [ ] "Bharat Connect" lockup visible in top-right corner
- [ ] "Powered by" label above the logo

**Screenshot**: Capture full hero section showing B mnemonic

---

### Screen 2: Category Screen
**URL**: `https://utilipayhub.com/app/bharat-connect/categories`

**What to Check**:
- [ ] "Powered by Bharat Connect" logo in top-right corner
- [ ] All live categories are visible (Electricity, Water, Gas, etc.)
- [ ] Logo remains visible when scrolling
- [ ] Each category shows biller count

**Screenshot**: Full page showing categories + top-right logo

---

### Screen 3: Biller Selection
**URL**: `https://utilipayhub.com/app/bharat-connect/billers/electricity` (or any category)

**What to Check**:
- [ ] Bharat Connect logo in top-right
- [ ] List of billers for the category
- [ ] Search functionality works
- [ ] Logo persists on scroll

**Screenshot**: Biller list with logo visible

---

### Screen 4: Bill Fetch
**URL**: Navigate through: Select biller → Enter connection details

**What to Check**:
- [ ] Bharat Connect logo in top-right
- [ ] Bill details display correctly
- [ ] Amount, due date, customer name visible
- [ ] "Pay Bill" button present

**Screenshot**: Bill fetch screen with details + logo

---

### Screen 5: Payment Success with B-Assured & Sonic ⭐ CRITICAL
**URL**: Complete a test payment (UAT environment)

**What to Check**:
- [ ] **B-Assured logo is displayed prominently**
- [ ] **Sonic branding audio plays automatically** (listen for ~2 second audio clip)
- [ ] Green checkmark animation
- [ ] Amount paid clearly shown
- [ ] "This payment is protected under Bharat Connect" text visible
- [ ] Bharat Connect Transaction ID displayed
- [ ] CCF (Customer Convenience Fee) shown
- [ ] "Replay Bharat Connect tone" button available

**Audio Test**:
1. Ensure browser volume is ON
2. Complete payment
3. Audio should play automatically when B-Assured displays
4. If no audio: Check browser console for errors
5. Click "Replay Bharat Connect tone" button to test manually

**Screenshot**: 
- Success screen with B-Assured logo visible
- Transaction details panel
- Audio playback indicator

**Browser Console Check**:
```javascript
// Open DevTools Console (F12)
// Should NOT see these errors:
❌ "404 Not Found: sonic-branding.mp3"
❌ "Official sonic branding clip missing"

// Should see:
✅ Audio element loading
✅ No 404 errors for brand assets
```

---

### Screen 6: Payment Receipt
**URL**: Click "View receipt" after successful payment

**What to Check**:
- [ ] **B-Assured logo at bottom**
- [ ] **Bharat Connect Transaction ID** (prominent, copiable)
- [ ] **CCF (Customer Convenience Fee)** displayed
- [ ] Partner Transaction ID
- [ ] Biller reference number
- [ ] Full amount breakdown (Bill Amount + CCF = Total)
- [ ] Date and time
- [ ] "B Assured" text: "This payment is B Assured..."
- [ ] Bharat Connect logo in header
- [ ] Print/Share buttons work

**Screenshot**: Full receipt showing all details + B-Assured logo

---

### Screen 7: Complaint Registration
**URL**: `https://utilipayhub.com/app/bharat-connect/complaints`

**What to Check**:
- [ ] Bharat Connect logo in top-right
- [ ] Two search options visible:
  - Option 1: Mobile number + Date range
  - Option 2: Transaction reference ID
- [ ] Links to MobiKwik complaint system:
  - Desktop: https://www.mobikwik.com/help/bbpscomplaint
  - Mobile: https://m.mobikwik.com/help/createticket/bbpscomplaint
- [ ] Both lookup methods work

**Screenshot**: Complaint form with both search options + logo

---

## 🔍 STEP 4: Detailed Feature Testing

### Test A: Sonic Branding Audio Playback
**Location**: Payment Success screen

**Manual Test**:
1. Complete a test payment
2. When success screen loads:
   - ✅ Audio should play automatically (2-second clip)
   - ✅ "Playing Bharat Connect tone" text appears briefly
3. Click "Replay Bharat Connect tone" button
   - ✅ Audio plays again
   - ✅ Button text updates to "Playing..."

**Troubleshooting**:
```javascript
// In browser console on success page:
console.log('Testing sonic branding...');

// Check if audio file is accessible:
fetch('/app/brand/sonic-branding.mp3')
  .then(r => console.log('Audio file status:', r.status))
  .catch(e => console.error('Audio file error:', e));

// Expected: status: 200
```

**If audio doesn't play**:
- Check browser autoplay policy (some browsers block)
- Check volume settings
- Check console for errors
- Try clicking the "Replay" button manually
- Verify file exists: `curl -I https://utilipayhub.com/app/brand/sonic-branding.mp3`

---

### Test B: Brand Asset Fallbacks
**Purpose**: Verify graceful degradation if assets are missing

**Test** (DO THIS AFTER verifying assets work):
1. Open browser DevTools → Network tab
2. Block requests to `/app/brand/b-mnemonic.png`
3. Reload homepage
4. ✅ Should show cropped mnemonic from lockup (not broken image)
5. Console should warn: "B mnemonic PNG not found, using cropped lockup"

---

### Test C: Transaction History Search
**URL**: `https://utilipayhub.com/app/bharat-connect/transactions`

**Test Both Search Methods**:

**Method 1: Mobile + Date**
1. Enter customer mobile: 9999999999
2. Select date range: Last 7 days
3. Click Search
4. ✅ Results should show matching transactions

**Method 2: Transaction Reference**
1. Enter Bharat Connect Txn ID: `MBK766722936` (example)
2. Click Search
3. ✅ Should find exact transaction
4. ✅ Transaction details accessible

---

### Test D: SMS Receipt Format
**Location**: Payment Success screen

**What to Check**:
- [ ] SMS preview box visible (right side on desktop)
- [ ] Contains:
  - Payment confirmation message
  - Amount
  - Biller name
  - Bharat Connect Txn ID
  - Customer mobile number
  - Outlet name
- [ ] "View SMS receipt details" link works
- [ ] Format matches provider requirements

---

## 🐛 STEP 5: Error Scenarios to Test

### Error Test 1: Invalid Token (Auto-Recovery)
**How**:
1. Let token expire (wait 24 hours) OR manually invalidate
2. Try to fetch bill
3. ✅ Should auto-refresh token and retry
4. ✅ Should NOT show "Token expired" error to user

---

### Error Test 2: Timeout Handling
**How**:
1. Disconnect internet briefly during payment
2. ✅ Transaction should show as "PENDING"
3. ✅ Should NOT be marked as "FAILED"
4. ✅ Status check should auto-trigger
5. ✅ Frontend should poll every 8 seconds

---

### Error Test 3: Provider Rejection
**How**:
1. Use invalid connection number
2. Try to fetch bill
3. ✅ Should show clear error message from provider
4. ✅ Should NOT crash app
5. ✅ User can try again

---

## 📸 STEP 6: Screenshots for UAT Submission

Take HIGH-QUALITY screenshots (1920x1080 or higher) of:

1. **Homepage** - Full hero with B mnemonic visible
2. **Categories** - All categories + top-right logo
3. **Biller Selection** - List view + logo
4. **Bill Fetch** - Successful bill fetch with details
5. **Payment Success** - B-Assured logo + transaction details
   - IMPORTANT: Capture WHILE audio is playing (show indicator)
6. **Payment Receipt** - Full receipt with B-Assured at bottom
7. **Complaint Registration** - Form with both search options

**Screenshot Format**:
- Format: PNG (not JPEG)
- Resolution: At least 1920x1080
- Full browser window (include URL bar to show domain)
- No developer tools visible (F12 closed)

---

## 🧪 STEP 7: Browser Compatibility Testing

Test on these browsers (UAT requirement):

### Desktop
- [ ] Chrome (latest)
- [ ] Firefox (latest)
- [ ] Edge (latest)
- [ ] Safari (if Mac available)

### Mobile
- [ ] Chrome Mobile (Android)
- [ ] Safari Mobile (iOS if available)

**For Each Browser, Verify**:
- All logos display correctly
- Sonic branding plays on success screen
- No console errors
- Payment flow works end-to-end

---

## 📊 STEP 8: Performance Checks

### Loading Speed
```bash
# Check asset sizes
curl -I https://utilipayhub.com/app/brand/sonic-branding.mp3
# Expected: Content-Length: 159488

curl -I https://utilipayhub.com/app/brand/b-assured.png
# Expected: Content-Length: 100011
```

### Caching
```bash
# Should have 1-year cache
curl -I https://utilipayhub.com/app/brand/sonic-branding.mp3 | grep -i cache
# Expected: Cache-Control: public, max-age=31536000
```

---

## ✅ FINAL CHECKLIST

Before declaring "TESTING COMPLETE":

**Brand Assets**:
- [ ] Sonic branding MP3 loads (159 KB)
- [ ] B mnemonic PNG loads (12.7 KB)
- [ ] B-Assured PNG loads (100 KB)
- [ ] Bharat Connect lockup loads (27 KB)

**UI Compliance (7 Screens)**:
- [ ] Homepage has B mnemonic
- [ ] Categories screen has logo
- [ ] Biller selection has logo
- [ ] Bill fetch has logo
- [ ] Payment success has B-Assured + audio
- [ ] Receipt has B-Assured + CCF + Txn ID
- [ ] Complaints has logo + both search options

**Audio**:
- [ ] Sonic branding plays automatically on success
- [ ] Replay button works
- [ ] No 404 errors for audio file
- [ ] Works on Chrome, Firefox, Edge

**Transaction Flow**:
- [ ] Can fetch bill successfully
- [ ] Can complete payment successfully
- [ ] Transaction history search works (both methods)
- [ ] Receipt is printable/shareable

**Error Handling**:
- [ ] Token expiry recovers automatically
- [ ] Timeouts marked as pending (not failed)
- [ ] Provider errors show clear messages

**Screenshots Captured**:
- [ ] All 7 required screens captured in high quality
- [ ] Audio playback indicator visible in success screenshot

---

## 🚨 Common Issues & Solutions

### Issue 1: Sonic branding doesn't play
**Solution**:
```bash
# Verify file exists
curl https://utilipayhub.com/app/brand/sonic-branding.mp3 -o test.mp3
# Should download 159KB file

# Check nginx logs
docker-compose logs frontend | grep sonic-branding

# If 404, assets not copied to dist:
cd utility-frontend
cp public/brand/* dist/brand/
docker-compose restart frontend
```

### Issue 2: Images show as broken
**Solution**:
- Check browser console for 404 errors
- Verify paths use `/app/brand/` prefix (not `/brand/`)
- Clear browser cache (Ctrl+Shift+R)
- Check nginx is serving `/app/brand/` route

### Issue 3: Audio plays but no sound
**Solution**:
- Check browser volume
- Check system volume
- Try different browser
- Check browser autoplay settings: chrome://settings/content/sound

### Issue 4: B-Assured logo not showing on success
**Solution**:
```javascript
// In browser console on success page:
fetch('/app/brand/b-assured.png')
  .then(r => console.log('B-Assured status:', r.status))

// If 404, file missing from dist/
// If 200, check React component mount
```

---

## 📞 Support

If any test fails:
1. Check `bharat_connect/VERIFICATION_CHECKLIST.txt`
2. Review browser console for errors
3. Check nginx logs: `docker-compose logs frontend`
4. Verify assets in: `utility-frontend/dist/brand/`

All tests should pass before UAT submission!

---

**Testing Complete?**
✅ All checks passed → Proceed to UAT evidence collection
❌ Any failures → Fix issues before submission
