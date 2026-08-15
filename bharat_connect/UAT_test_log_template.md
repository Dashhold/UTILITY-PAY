# UAT Test Log Template - Bharat Connect Integration

This document provides the structure for capturing all UAT test evidence required by MobiKwik.

**IMPORTANT**: Enable UAT logging in `.env`:
```bash
BC_UAT_LOGGING=true
```

**AFTER UAT submission, IMMEDIATELY disable it**:
```bash
BC_UAT_LOGGING=false
```

---

## How to Collect UAT Logs

### Backend Setup
1. Set `BC_UAT_LOGGING=true` in `backend/.env`
2. Restart backend: `cd backend && go run cmd/api/main.go`
3. Logs will include structured entries with:
   - `"component":"bharatconnect_uat"` 
   - Both encrypted AND decrypted payloads

### Log Collection Commands
```bash
# Token Generation logs
grep 'bharatconnect_uat.*TOKEN' backend/logs/app.log

# Balance Check logs
grep 'bharatconnect_uat.*balance' backend/logs/app.log

# Validation logs
grep 'bharatconnect_uat.*validation' backend/logs/app.log

# View Bill logs
grep 'bharatconnect_uat.*view_bill' backend/logs/app.log

# Payment logs
grep 'bharatconnect_uat.*payment' backend/logs/app.log

# Status Check logs
grep 'bharatconnect_uat.*status' backend/logs/app.log
```

---

## 1. Token Generation API – Success Cases

### Test Case Details
- **Date/Time**: [FILL]
- **Environment**: UAT (https://alpha3.mobikwik.com)
- **Tester**: [FILL]

### cURL Request
```bash
curl -X POST https://alpha3.mobikwik.com/recharge/v1/verify/retailer \
  -H "Content-Type: application/json" \
  -H "Accept: application/json" \
  -d '{
    "clientId": "YOUR_CLIENT_ID",
    "clientSecret": "YOUR_CLIENT_SECRET"
  }'
```

### Request URL
```
POST https://alpha3.mobikwik.com/recharge/v1/verify/retailer
```

### Request Headers
```
Content-Type: application/json
Accept: application/json
```

### Request Body
**Encrypted**: N/A (plaintext endpoint)

**Decrypted**:
```json
{
  "clientId": "RCH_7avjk23DutLnwa0r3xzUUqw",
  "clientSecret": "[REDACTED in logs]"
}
```

### Response
```json
{
  "success": true,
  "data": {
    "token": "wQltGT9mP1HlXNHq0ZrdK-GhwdnHnIXs7mw33S8xTrI",
    "expiryTime": "2026-08-17 12:26:53"
  }
}
```

### Response Status Code
`200 OK`

---

## 2. Token Generation API – Failed Cases

### Test Case Details
- **Date/Time**: [FILL]
- **Environment**: UAT
- **Failure Type**: Invalid credentials
- **Tester**: [FILL]

### cURL Request
```bash
curl -X POST https://alpha3.mobikwik.com/recharge/v1/verify/retailer \
  -H "Content-Type: application/json" \
  -d '{
    "clientId": "INVALID_CLIENT_ID",
    "clientSecret": "INVALID_SECRET"
  }'
```

### Request URL
```
POST https://alpha3.mobikwik.com/recharge/v1/verify/retailer
```

### Request Body
**Decrypted**:
```json
{
  "clientId": "INVALID_CLIENT_ID",
  "clientSecret": "INVALID_SECRET"
}
```

### Response
```json
{
  "success": false,
  "message": {
    "code": "1308",
    "text": "Invalid Request"
  }
}
```

### Response Status Code
`200 OK` (with success=false)

---

## 3. Balance Check API – Success Cases

### Test Case Details
- **Date/Time**: [FILL]
- **Member ID**: testalpha1@gmail.com
- **Tester**: [FILL]

### cURL Request
```bash
curl -X POST https://alpha3.mobikwik.com/recharge/v3/retailerBalance \
  -H "Content-Type: application/json" \
  -H "Accept: application/json" \
  -H "Authorization: YOUR_TOKEN" \
  -d '{
    "encryptedSessionKey": "...",
    "encryptedPayload": "...",
    "keyVersion": "1.0",
    "iv": "..."
  }'
```

### Request URL
```
POST https://alpha3.mobikwik.com/recharge/v3/retailerBalance
```

### Request Headers
```
Content-Type: application/json
Accept: application/json
Authorization: [TOKEN from step 1]
```

### Request Body
**Encrypted**:
```json
{
  "encryptedSessionKey": "M8SJTP/d81pftW3cjTcT5CsAPtOHlS+CLYrNet+T3LYGDYn/...",
  "encryptedPayload": "sI5m6gHd1xWVW0LKyA+FgoEnH419SiDq9ku07q1N5J/6S64IgGkR...",
  "keyVersion": "1.0",
  "iv": "D1KIVJlHivVSImIb"
}
```

**Decrypted Session Key**:
```
[Base64 encoded 32-byte AES key from UAT log]
```

**Decrypted Payload**:
```json
{
  "memberId": "testalpha1@gmail.com"
}
```

### Response
```json
{
  "success": true,
  "data": {
    "balance": 303.5
  }
}
```

### Response Status Code
`200 OK`

---

## 4. Balance Check API – Failed Cases

### Test Case Details
- **Date/Time**: [FILL]
- **Failure Type**: Invalid/expired token
- **Tester**: [FILL]

### Request Body
**Encrypted**: [Same format as success case]

**Decrypted Payload**:
```json
{
  "memberId": "testalpha1@gmail.com"
}
```

### Response
```json
{
  "success": false,
  "message": {
    "code": "401",
    "text": "Token is expired/Invalid Token/Token not found in request"
  }
}
```

### Response Status Code
`200 OK` (with success=false)

---

## 5. Validation API – Success Cases

### Test Case Details
- **Date/Time**: [FILL]
- **Operator**: BSNL (op=7)
- **Circle**: Andhra Pradesh (cir=1)
- **Amount**: ₹100
- **Connection**: 9876876768
- **Tester**: [FILL]

### Request Body
**Encrypted**:
```json
{
  "encryptedSessionKey": "DO/Fdag28ZVA/8splzD12rjcTtXlO6Z/qbWMY9YpE/d82Ds61xg/...",
  "encryptedPayload": "6lxUZUX6xvP1S7+P0lOJm/uerCEf15v5DvoUcTTng95Keijv6TiNTbxp...",
  "iv": "6cCRbQ0el6JGHXMy",
  "keyVersion": "1.0"
}
```

**Decrypted Session Key**:
```
[Base64 AES key]
```

**Decrypted Payload**:
```json
{
  "amt": "100",
  "cn": "9876876768",
  "op": "7",
  "cir": "1",
  "agentId": "MK01MK01INB523643654",
  "planCode": "bsnl-Andhra-Pradesh-topup-plans-Rs-100.0",
  "adParams": {}
}
```

### Response
```json
{
  "success": true,
  "data": {
    "status": "RECHARGEVALIDATIONSUCCESS",
    "description": "",
    "balance": 0.0,
    "discountedPrice": 0.0,
    "businessError": false
  }
}
```

---

## 6. Validation API – Failed Cases

### Test Case Details
- **Date/Time**: [FILL]
- **Failure Type**: Invalid hash value
- **Tester**: [FILL]

### Response
```json
{
  "success": false,
  "message": {
    "code": "RECHARGEVALIDATIONFAILURE",
    "text": "Invalid Hash Value"
  },
  "data": {
    "status": "RECHARGEVALIDATIONFAILURE",
    "description": "Invalid Hash Value",
    "businessError": true
  }
}
```

---

## 7. View Bill API – Success Cases

### Test Case Details
- **Date/Time**: [FILL]
- **Connection**: 151608882
- **Operator**: op=31
- **Tester**: [FILL]

### Request Body
**Decrypted Payload**:
```json
{
  "cn": "151608882",
  "op": "31",
  "cir": "",
  "agentId": "MK01MK01INB523643654",
  "adParams": {}
}
```

### Response
```json
{
  "success": true,
  "data": [
    {
      "billAmount": "1930.0",
      "billnetamount": "1930.0",
      "billdate": "24-Nov-2025",
      "dueDate": "15-Dec-2025",
      "acceptPayment": true,
      "acceptPartPay": false,
      "userName": "***** **** Ma***"
    }
  ]
}
```

---

## 8. View Bill API – Failed Cases

[Fill similar to above success case structure]

---

## 9. Recharge API – Success Cases

### Test Case Details
- **Date/Time**: [FILL]
- **Connection**: 9876543210
- **Amount**: ₹10
- **Operator**: BSNL (op=7)
- **Request ID**: tessjdk103
- **Tester**: [FILL]

### Request Body
**Decrypted Payload**:
```json
{
  "cn": "9876543210",
  "op": "7",
  "cir": "",
  "amt": "10",
  "reqid": "tessjdk103",
  "remitterName": "Test User",
  "customerMobile": "9999999999",
  "paymentRefID": "NX231107767681728991",
  "paymentMode": "UPI",
  "agentId": "MK01MK01INB523643654",
  "paymentAccountInfo": "1234567890@ybl"
}
```

### Response
```json
{
  "success": true,
  "data": {
    "status": "SUCCESS",
    "txId": "223407623",
    "balance": 200000.0,
    "mobikwikstamp": "MBK766722936",
    "opRefNo": "null",
    "discountprice": 10.0
  }
}
```

---

## 10. Recharge API – Failed Cases

### Test Case Details
- **Date/Time**: [FILL]
- **Connection**: 7797833489
- **Failure Type**: Transaction couldn't succeed
- **Tester**: [FILL]

### Response
```json
{
  "success": false,
  "message": {
    "code": "500",
    "text": "Sorry! The transaction couldn't succeed"
  }
}
```

**Action Taken**: Status check performed (as required by spec)

---

## 11. Recharge API – Pending Cases

### Test Case Details
- **Date/Time**: [FILL]
- **Connection**: 9459738434
- **Status**: SUCCESSPENDING
- **Tester**: [FILL]

### Response
```json
{
  "success": true,
  "data": {
    "status": "SUCCESSPENDING",
    "txId": "xxxxxxxxx",
    "balance": 299.5,
    "mobikwikstamp": "xxxxxxxxxxx",
    "opRefNo": "null",
    "discountprice": 10.0
  }
}
```

**Action Taken**: Status check initiated (scheduled every 5 minutes)

---

## 12. Transaction Status Check API – Success Cases

### Test Case Details
- **Date/Time**: [FILL]
- **Transaction ID**: tessjdk103
- **Tester**: [FILL]

### Request Body
**Decrypted Payload**:
```json
{
  "txId": "tessjdk103"
}
```

### Response
```json
{
  "success": true,
  "data": {
    "txId": "tessjdk103",
    "status": "RECHARGESUCCESS",
    "description": "Recharge Successful",
    "discountedPrice": 100.0,
    "balance": 99999900.0,
    "operatorRefNo": "xxxxxxxxxxx",
    "mobikwikStamp": "xxxxxxxxx"
  }
}
```

---

## 13. Transaction Status Check API – Failed Cases

### Response
```json
{
  "success": true,
  "data": {
    "txId": "tessjdk103",
    "status": "RECHARGEFAILURE",
    "description": "Recharge Failed",
    "discountedPrice": 0.0,
    "balance": 100000000.0,
    "operatorRefNo": null,
    "mobikwikStamp": "xxxxxxxxxxx"
  }
}
```

---

## 14. Transaction Status Check API – Pending Cases

### Response
```json
{
  "success": true,
  "data": {
    "txId": "tessjdk103",
    "status": "RECHARGESUCCESSPENDING",
    "description": "Recharge Initiated",
    "discountedPrice": 100.0,
    "balance": 99999900.0,
    "operatorRefNo": null,
    "mobikwikStamp": "xxxxxxxxxxx"
  }
}
```

---

## 15. Handling of Pending Cases

**Reference Document**: `UAT_implementation_details.md` - Section 15

**Summary**:
- Pending transactions identified by: SUCCESSPENDING status, timeout, HTTP 5xx
- Wallet debit retained (NOT reversed)
- Frontend polls every 8 seconds
- Backend reconciler runs every 5 minutes
- Maximum automatic reconciliation: 24 hours (54 attempts)
- After 24h: escalated to manual review

---

## 16. Handling of Timeout Cases

**Reference Document**: `UAT_implementation_details.md` - Section 16

**Summary**:
- Timeout threshold: 30 seconds (configurable)
- Payment timeout → Mark as PENDING (never FAILED)
- Status check timeout → Keep PENDING
- Differentiation: Payment sent + (timeout OR 5xx) = PENDING
- Final reconciliation: Daily T+1 settlement with provider report

---

## 17. Interval for Status Check on Pending/Timeout Cases

**Reference Document**: `UAT_implementation_details.md` - Section 17

**Summary**:
- Phase 1 (0-30min): Every 5 minutes (6 attempts)
- Phase 2 (30min-24h): Every 30 minutes (47 attempts)
- Total automatic attempts: 54
- After 24h: Manual review
- Maximum resolution: 8 days (1 auto + 7 manual)

---

## 18. Handling of Token Expiry Cases

**Reference Document**: `UAT_implementation_details.md` - Section 18

**Summary**:
- Token validity: 24 hours
- Proactive refresh: 30 minutes before expiry
- Reactive detection: HTTP 200 with code="401"
- Automatic retry: Once with new token
- Quota protection: 100 tokens/day limit tracked
- Fail-safe: Alert at 80% quota usage

---

## UAT Evidence Package Checklist

- [ ] Token Generation - Success logs (encrypted + decrypted)
- [ ] Token Generation - Failure logs
- [ ] Balance Check - Success logs (encrypted + decrypted)
- [ ] Balance Check - Failure logs
- [ ] Validation - Success logs (encrypted + decrypted)
- [ ] Validation - Failure logs
- [ ] View Bill - Success logs (encrypted + decrypted)
- [ ] View Bill - Failure logs
- [ ] Payment - Success logs (encrypted + decrypted)
- [ ] Payment - Failure logs
- [ ] Payment - Pending logs
- [ ] Status Check - Success logs (encrypted + decrypted)
- [ ] Status Check - Failure logs
- [ ] Status Check - Pending logs
- [ ] Written explanation for question 15 (Pending handling)
- [ ] Written explanation for question 16 (Timeout handling)
- [ ] Written explanation for question 17 (Status check intervals)
- [ ] Written explanation for question 18 (Token expiry)
- [ ] Screenshots of all compliance screens (7 screens)
- [ ] AI Consent Letter (signed and stamped)
- [ ] Declaration and Undertaking by Directors
- [ ] Board Approved Authorized Signatory List
- [ ] Login credentials for UAT testing

---

**Document Version**: 1.0  
**Last Updated**: 2026-08-16  
**Prepared For**: MobiKwik Bharat Connect UAT Submission  
**Contact**: operations@utilipayhub.com
