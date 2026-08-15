# AEPS API Test Logs

## API Key
```
kGxc8E68fiU1HYwlImyMGouxlK0MUsqH
```

## Base URL
```
https://apidev.excisofttech.com
```

---

## Test 1: Bank List API

### Endpoint
```
POST /api/v1/aeps/get_bank_list
```

### Request
```bash
curl -X POST "https://apidev.excisofttech.com/api/v1/aeps/get_bank_list" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "apiKey=kGxc8E68fiU1HYwlImyMGouxlK0MUsqH"
```

### Request Parameters
```
apiKey: kGxc8E68fiU1HYwlImyMGouxlK0MUsqH
```

### Response
```json
{
  "status": true,
  "response_code": 1,
  "banklist": {
    "status": true,
    "message": "Request Completed",
    "data": [
      {
        "id": "1",
        "bankName": "Airtel Payment Bank",
        "iinno": "990320",
        "activeFlag": "1",
        "aadharpayiinno": null
      },
      {
        "id": "2",
        "bankName": "Allahabad Bank",
        "iinno": "608112",
        "activeFlag": "1",
        "aadharpayiinno": null
      },
      {
        "id": "3",
        "bankName": "Allahabad UP Gramin Bank",
        "iinno": "607024",
        "activeFlag": "1",
        "aadharpayiinno": null
      },
      {
        "id": "31",
        "bankName": "Federal Bank",
        "iinno": "607363",
        "activeFlag": "1",
        "aadharpayiinno": "607322"
      },
      {
        "id": "37",
        "bankName": "ICICI Bank",
        "iinno": "508534",
        "activeFlag": "1",
        "aadharpayiinno": null
      },
      {
        "id": "35",
        "bankName": "HDFC Bank",
        "iinno": "607152",
        "activeFlag": "1",
        "aadharpayiinno": null
      },
      {
        "id": "85",
        "bankName": "State Bank of India",
        "iinno": "607094",
        "activeFlag": "1",
        "aadharpayiinno": null
      }
    ]
  },
  "message": "Bank list successfully fetched"
}
```

### HTTP Status
```
200 OK
```

### Response Time
```
1.104493s
```

### Result
✅ SUCCESS - Retrieved 107 banks

---

## Test 2: Onboarding API

### Endpoint
```
POST /api/v1/aeps/onboard
```

### Request
```bash
curl -X POST "https://apidev.excisofttech.com/api/v1/aeps/onboard" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "apiKey=kGxc8E68fiU1HYwlImyMGouxlK0MUsqH&mobile=9999999999&merchantcode=TEST001&firm=TestFirm&email=test@example.com&is_new=1&callback=https://utilipayhub.com/callback"
```

### Request Parameters
```
apiKey: kGxc8E68fiU1HYwlImyMGouxlK0MUsqH
mobile: 9999999999
merchantcode: TEST001
firm: TestFirm
email: test@example.com
is_new: 1
callback: https://utilipayhub.com/callback
```

### Response
```json
{
  "status": true,
  "response_code": 1,
  "redirecturl": "https://paysprint.co.in/onboarding?env=eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJwYXJ0bmVyaWQiOiIyMDE4MTE2OSIsIm1lcmNoYW50Y29kZSI6IlRFU1QwMDEiLCJtb2JpbGUiOiI5OTk5OTk5OTk5IiwiaXNfbmV3IjoiMSIsImVtYWlsIjoidGVzdEBleGFtcGxlLmNvbSIsImZpcm1uYW1lIjoiVGVzdEZpcm0iLCJyZXFpZCI6IjE3ODYxMDAwNTgxNzkiLCJjYWxsYmFjayI6Imh0dHBzOlwvXC91dGlsaXBheWh1Yi5jb21cL2NhbGxiYWNrIiwicGlwZSI6bnVsbCwiY3VycmVudF90aW1lIjoxNzg2MTAwMDU4fQ.mNyxlbasbu1jQ7sRqzWlrOdbnMkaqU87VaVS0REs9eY",
  "onboard_pending": 1,
  "message": "Onboarding URL generated successfully."
}
```

### HTTP Status
```
200 OK
```

### Response Time
```
0.370897s
```

### Result
✅ SUCCESS - Onboarding URL generated

---

## Test 3: Onboard Status Check API

### Endpoint
```
POST /api/v1/aeps/onboard_status_check
```

### Request
```bash
curl -X POST "https://apidev.excisofttech.com/api/v1/aeps/onboard_status_check" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "apiKey=kGxc8E68fiU1HYwlImyMGouxlK0MUsqH&merchantcode=TEST001&mobile=9999999999&pipe=bank2"
```

### Request Parameters
```
apiKey: kGxc8E68fiU1HYwlImyMGouxlK0MUsqH
merchantcode: TEST001
mobile: 9999999999
pipe: bank2
```

### Response
```json
{
  "response_code": 2,
  "status": false,
  "message": "Merchantcode not found"
}
```

### HTTP Status
```
200 OK
```

### Response Time
```
0.231757s
```

### Result
❌ EXPECTED ERROR - Merchantcode not found (test merchant not onboarded)

---

## Test 4: Register API (Biometric Registration)

### Endpoint
```
POST /api/v1/aeps/register.php
```

### Request
```bash
curl -X POST "https://apidev.excisofttech.com/api/v1/aeps/register.php" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "apiKey=kGxc8E68fiU1HYwlImyMGouxlK0MUsqH&mobile=9999999999&adhaarnumber=123456789012&bank_pipe=bank3&device=Mantra&pid=test_pid_data&latitude=26.9124336&longitude=75.7872709&ref_id=TEST123456&submerchantid=TEST001&ipaddress=192.168.1.1&accessmodetype=SITE"
```

### Request Parameters
```
apiKey: kGxc8E68fiU1HYwlImyMGouxlK0MUsqH
mobile: 9999999999
adhaarnumber: 123456789012
bank_pipe: bank3
device: Mantra
pid: test_pid_data
latitude: 26.9124336
longitude: 75.7872709
ref_id: TEST123456
submerchantid: TEST001
ipaddress: 192.168.1.1
accessmodetype: SITE
```

### Response
```json
{
  "response_code": 24,
  "status": false,
  "message": "MerchantID not found.,Please onboard merchant"
}
```

### HTTP Status
```
200 OK
```

### Response Time
```
0.938779s
```

### Result
❌ EXPECTED ERROR - Merchant not onboarded (requires real biometric PID data)

---

## Test 5: Merchant Auth API (Two-Factor Authentication)

### Endpoint
```
POST /api/v1/aeps/merchant_auth
```

### Request
```bash
curl -X POST "https://apidev.excisofttech.com/api/v1/aeps/merchant_auth" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "apiKey=kGxc8E68fiU1HYwlImyMGouxlK0MUsqH&mobilenumber=9999999999&adhaarnumber=123456789012&bank_pipe=bank3&device=Mantra&data=test_pid_data&latitude=26.9124336&longitude=75.7872709&referenceno=TEST123456&submerchantid=TEST001&ipaddress=192.168.1.1&accessmodetype=SITE"
```

### Request Parameters
```
apiKey: kGxc8E68fiU1HYwlImyMGouxlK0MUsqH
mobilenumber: 9999999999
adhaarnumber: 123456789012
bank_pipe: bank3
device: Mantra
data: test_pid_data
latitude: 26.9124336
longitude: 75.7872709
referenceno: TEST123456
submerchantid: TEST001
ipaddress: 192.168.1.1
accessmodetype: SITE
```

### Response
```json
{
  "response_code": 25,
  "status": false,
  "message": "MerchantID not found.,Please onboard merchant"
}
```

### HTTP Status
```
200 OK
```

### Response Time
```
0.240631s
```

### Result
❌ EXPECTED ERROR - Merchant not onboarded (requires real biometric PID data)

---

## Test 6: Cash Withdrawal API

### Endpoint
```
POST /api/v1/aeps/withdrawal
```

### Request
```bash
curl -X POST "https://apidev.excisofttech.com/api/v1/aeps/withdrawal" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "apiKey=kGxc8E68fiU1HYwlImyMGouxlK0MUsqH&mobile=9999999999&latitude=26.9124336&longitude=75.7872709&adhaarnumber=123456789012&bank_pipe=bank3&device=Mantra&pid=test_pid_data&ref_id=TEST123456&submerchantid=TEST001&ipaddress=192.168.1.1&accessmodetype=SITE&bank=607094&remark=CW&type=CW&amount=100&MerAuthTxnId=123456789"
```

### Request Parameters
```
apiKey: kGxc8E68fiU1HYwlImyMGouxlK0MUsqH
mobile: 9999999999
latitude: 26.9124336
longitude: 75.7872709
adhaarnumber: 123456789012
bank_pipe: bank3
device: Mantra
pid: test_pid_data
ref_id: TEST123456
submerchantid: TEST001
ipaddress: 192.168.1.1
accessmodetype: SITE
bank: 607094
remark: CW
type: CW
amount: 100
MerAuthTxnId: 123456789
```

### Response
```json
{
  "response_code": 25,
  "status": false,
  "message": "You do not have permission.,Please onboard merchant"
}
```

### HTTP Status
```
200 OK
```

### Response Time
```
0.645738s
```

### Result
❌ EXPECTED ERROR - No permission (requires merchant onboarding and real biometric data)

---

## Test 7: Balance Enquiry API

### Endpoint
```
POST /api/v1/aeps/balanceEnquiry
```

### Request
```bash
curl -X POST "https://apidev.excisofttech.com/api/v1/aeps/balanceEnquiry" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "apiKey=kGxc8E68fiU1HYwlImyMGouxlK0MUsqH&mobile=9999999999&latitude=26.9124336&longitude=75.7872709&adhaarnumber=123456789012&bank_pipe=bank3&device=Mantra&pid=test_pid_data&ref_id=TEST123456&submerchantid=TEST001&ipaddress=192.168.1.1&accessmodetype=SITE&bank=607094&remark=BE&type=BE"
```

### Request Parameters
```
apiKey: kGxc8E68fiU1HYwlImyMGouxlK0MUsqH
mobile: 9999999999
latitude: 26.9124336
longitude: 75.7872709
adhaarnumber: 123456789012
bank_pipe: bank3
device: Mantra
pid: test_pid_data
ref_id: TEST123456
submerchantid: TEST001
ipaddress: 192.168.1.1
accessmodetype: SITE
bank: 607094
remark: BE
type: BE
```

### Response
```json
{
  "status": false,
  "message": "You do not have permission.,Please onboard merchant",
  "response_code": 25
}
```

### HTTP Status
```
200 OK
```

### Response Time
```
1.296259s
```

### Result
❌ EXPECTED ERROR - No permission (requires merchant onboarding and real biometric data)

---

## Test 8: Mini Statement API

### Endpoint
```
POST /api/v1/aeps/miniStatement
```

### Request
```bash
curl -X POST "https://apidev.excisofttech.com/api/v1/aeps/miniStatement" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "apiKey=kGxc8E68fiU1HYwlImyMGouxlK0MUsqH&mobile=9999999999&latitude=26.9124336&longitude=75.7872709&adhaarnumber=123456789012&bank_pipe=bank3&device=Mantra&pid=test_pid_data&ref_id=TEST123456&submerchantid=TEST001&ipaddress=192.168.1.1&accessmodetype=SITE&bank=607094&remark=MS&type=MS"
```

### Request Parameters
```
apiKey: kGxc8E68fiU1HYwlImyMGouxlK0MUsqH
mobile: 9999999999
latitude: 26.9124336
longitude: 75.7872709
adhaarnumber: 123456789012
bank_pipe: bank3
device: Mantra
pid: test_pid_data
ref_id: TEST123456
submerchantid: TEST001
ipaddress: 192.168.1.1
accessmodetype: SITE
bank: 607094
remark: MS
type: MS
```

### Response
```json
{
  "response_code": 14,
  "status": false,
  "message": "You do not have permission.,Please onboard merchant"
}
```

### HTTP Status
```
200 OK
```

### Response Time
```
0.494014s
```

### Result
❌ EXPECTED ERROR - No permission (requires merchant onboarding and real biometric data)

---

## Summary

| API | Endpoint | Status | Result |
|-----|----------|--------|--------|
| Bank List | `/api/v1/aeps/get_bank_list` | ✅ SUCCESS | Retrieved 107 banks |
| Onboarding | `/api/v1/aeps/onboard` | ✅ SUCCESS | URL generated |
| Onboard Status | `/api/v1/aeps/onboard_status_check` | ⚠️ ERROR | Merchantcode not found |
| Register | `/api/v1/aeps/register.php` | ⚠️ ERROR | Merchant not onboarded |
| Merchant Auth | `/api/v1/aeps/merchant_auth` | ⚠️ ERROR | Merchant not onboarded |
| Withdrawal | `/api/v1/aeps/withdrawal` | ⚠️ ERROR | No permission |
| Balance Enquiry | `/api/v1/aeps/balanceEnquiry` | ⚠️ ERROR | No permission |
| Mini Statement | `/api/v1/aeps/miniStatement` | ⚠️ ERROR | No permission |

**Test Date:** August 7, 2026
**API Key Used:** kGxc8E68fiU1HYwlImyMGouxlK0MUsqH
**API Connectivity:** ✅ Working
**API Key Validation:** ✅ Valid

**Note:** Tests 3-8 returned expected errors because they require:
1. Merchant to complete onboarding process via the redirect URL
2. Real biometric fingerprint data (PID) from physical device
3. Actual merchant credentials and approved merchant status
