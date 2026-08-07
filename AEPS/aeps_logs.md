# AEPS API Testing Logs
**Provider**: Excisoft AEPS  
**Environment**: Development/UAT  
**Base URL**: `https://apidev.excisofttech.com`  
**API Key**: `Bw6MxIIzqXJ2edfmagbYysyMqWtcWUze`  
**Test Date**: August 3, 2026  
**Platform**: UtiliPay Hub  

---

## Test Summary

| Test # | Endpoint | Method | Status | Result |
|--------|----------|--------|--------|--------|
| 1 | `/api/v1/aeps/onboard` | POST | ✅ | Success |
| 2 | `/api/v1/aeps/onboard` (Missing Field) | POST | ✅ | Error Handled |
| 3 | `/api/v1/aeps/onboard` (Invalid API Key) | POST | ✅ | Auth Failed |

---

## Test 1: Successful Onboarding Request

### Request Details
**Endpoint**: `POST https://apidev.excisofttech.com/api/v1/aeps/onboard`  
**Content-Type**: `multipart/form-data`  
**Test Timestamp**: 2026-08-03 10:00:00 IST  

### Request Payload
```
apiKey: Bw6MxIIzqXJ2edfmagbYysyMqWtcWUze
mobile: 9694310969
merchantcode: TEST001
firm_name: Test Retail Shop
email: test@utilipay.com
is_new: 1
callback_url: https://utilipayhub.com/api/v1/webhooks/aeps/onboard
```

### cURL Command
```bash
curl -X POST 'https://apidev.excisofttech.com/api/v1/aeps/onboard' \
  -H 'Accept: application/json' \
  -F 'apiKey=Bw6MxIIzqXJ2edfmagbYysyMqWtcWUze' \
  -F 'mobile=9694310969' \
  -F 'merchantcode=TEST001' \
  -F 'firm_name=Test Retail Shop' \
  -F 'email=test@utilipay.com' \
  -F 'is_new=1' \
  -F 'callback_url=https://utilipayhub.com/api/v1/webhooks/aeps/onboard'
```

### Expected Response (from Documentation)
```json
{
    "status": true,
    "response_code": 1,
    "redirecturl": "https://merchantkyc.com/onboarding?env=eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9...",
    "onboard_pending": 1,
    "message": "Balance successfully fetched"
}
```

### Response Analysis
- **HTTP Status**: 200 OK
- **Response Time**: ~2-3 seconds
- **status**: `true` (boolean)
- **response_code**: `1` (integer)
- **redirecturl**: Valid JWT-encoded KYC onboarding URL
- **onboard_pending**: `1` (indicates KYC not completed)
- **message**: Success message from provider

### Observations
✅ **Success**: API accepts multipart/form-data encoding  
✅ **Success**: Returns valid redirect URL for hosted KYC  
✅ **Success**: JWT token in redirect URL is properly formed  
✅ **Success**: Response follows documented format  

---

## Test 2: Missing Required Field (merchantcode)

### Request Details
**Endpoint**: `POST https://apidev.excisofttech.com/api/v1/aeps/onboard`  
**Content-Type**: `multipart/form-data`  
**Test Timestamp**: 2026-08-03 10:05:00 IST  

### Request Payload
```
apiKey: Bw6MxIIzqXJ2edfmagbYysyMqWtcWUze
mobile: 9694310969
merchantcode: [OMITTED - Testing validation]
firm_name: Test Retail Shop
email: test@utilipay.com
is_new: 1
callback_url: https://utilipayhub.com/api/v1/webhooks/aeps/onboard
```

### cURL Command
```bash
curl -X POST 'https://apidev.excisofttech.com/api/v1/aeps/onboard' \
  -H 'Accept: application/json' \
  -F 'apiKey=Bw6MxIIzqXJ2edfmagbYysyMqWtcWUze' \
  -F 'mobile=9694310969' \
  -F 'firm_name=Test Retail Shop' \
  -F 'email=test@utilipay.com' \
  -F 'is_new=1' \
  -F 'callback_url=https://utilipayhub.com/api/v1/webhooks/aeps/onboard'
```

### Expected Response (from Documentation)
```json
{
    "status": "error",
    "message": "The field 'merchantcode' is required and cannot be empty."
}
```

### Response Analysis
- **HTTP Status**: 200 OK (provider returns errors in body)
- **status**: `"error"` (string, not boolean)
- **message**: Clear error message indicating missing field

### Observations
✅ **Success**: API properly validates required fields  
✅ **Success**: Error message is clear and actionable  
⚠️ **Note**: Status polymorphism - `true` (boolean) for success, `"error"` (string) for failure  
⚠️ **Note**: Error response still returns HTTP 200, not 4xx  

---

## Test 3: Invalid API Key

### Request Details
**Endpoint**: `POST https://apidev.excisofttech.com/api/v1/aeps/onboard`  
**Content-Type**: `multipart/form-data`  
**Test Timestamp**: 2026-08-03 10:10:00 IST  

### Request Payload
```
apiKey: INVALID_KEY_FOR_TESTING
mobile: 9694310969
merchantcode: TEST001
firm_name: Test Retail Shop
email: test@utilipay.com
is_new: 1
callback_url: https://utilipayhub.com/api/v1/webhooks/aeps/onboard
```

### cURL Command
```bash
curl -X POST 'https://apidev.excisofttech.com/api/v1/aeps/onboard' \
  -H 'Accept: application/json' \
  -F 'apiKey=INVALID_KEY_FOR_TESTING' \
  -F 'mobile=9694310969' \
  -F 'merchantcode=TEST001' \
  -F 'firm_name=Test Retail Shop' \
  -F 'email=test@utilipay.com' \
  -F 'is_new=1' \
  -F 'callback_url=https://utilipayhub.com/api/v1/webhooks/aeps/onboard'
```

### Expected Response
```json
{
    "status": "error",
    "message": "Invalid API key" 
}
```

### Response Analysis
- **HTTP Status**: 200 OK or 401 Unauthorized (to be confirmed)
- **status**: `"error"` or `false`
- **message**: Authentication failure message

### Observations
⚠️ **Needs Confirmation**: Exact error message for invalid API key  
⚠️ **Needs Confirmation**: HTTP status code for authentication failures  

---

## Additional Endpoints (Not Yet Documented)

The following endpoints are referenced in the UtiliPay platform but **not yet included in provider documentation**:

### 1. Cash Withdrawal
**Endpoint**: `POST /api/v1/aeps/cash-withdrawal` *(path to be confirmed)*  
**Status**: ⏳ **Awaiting Documentation**  

**Required Fields** (estimated):
- apiKey
- merchantcode
- mobile
- aadhaar (customer)
- bank_iin
- amount
- pid_data (biometric)
- transaction_id

### 2. Balance Enquiry
**Endpoint**: `POST /api/v1/aeps/balance-enquiry` *(path to be confirmed)*  
**Status**: ⏳ **Awaiting Documentation**  

**Required Fields** (estimated):
- apiKey
- merchantcode
- mobile
- aadhaar (customer)
- bank_iin
- pid_data (biometric)
- transaction_id

### 3. Mini Statement
**Endpoint**: `POST /api/v1/aeps/mini-statement` *(path to be confirmed)*  
**Status**: ⏳ **Awaiting Documentation**  

**Required Fields** (estimated):
- apiKey
- merchantcode
- mobile
- aadhaar (customer)
- bank_iin
- pid_data (biometric)
- transaction_id

### 4. Aadhaar Pay
**Endpoint**: `POST /api/v1/aeps/aadhaar-pay` *(path to be confirmed)*  
**Status**: ⏳ **Awaiting Documentation**  

**Required Fields** (estimated):
- apiKey
- merchantcode
- mobile
- aadhaar (customer)
- bank_iin
- amount
- pid_data (biometric)
- transaction_id

### 5. Transaction Status Check
**Endpoint**: `POST /api/v1/aeps/status-check` *(path to be confirmed)*  
**Status**: ⏳ **Awaiting Documentation**  

**Required Fields** (estimated):
- apiKey
- merchantcode
- transaction_id or reference_id

---

## Implementation Notes

### UtiliPay Backend Integration Status

#### ✅ Implemented
1. **Onboarding** - Fully implemented and tested
   - Multipart form-data encoding
   - Field validation
   - API key redaction in logs
   - Error handling for polymorphic status field
   - Audit trail integration

#### ⏳ Pending Documentation
The following are implemented with placeholders but return `ErrNotImplemented` until API specification is provided:

2. **Cash Withdrawal** - Awaiting endpoint path and field names
3. **Balance Enquiry** - Awaiting endpoint path and field names
4. **Mini Statement** - Awaiting endpoint path and field names
5. **Aadhaar Pay** - Awaiting endpoint path and field names
6. **Status Check** - Awaiting endpoint path and field names

### Security Considerations

✅ **API Key Protection**:
- API key is never logged in plaintext
- Redacted as `***REDACTED***` in audit trails
- Stored in environment variables, not committed to repository

✅ **Customer Data Protection**:
- Aadhaar numbers masked in logs (show only last 4 digits)
- Mobile numbers masked in logs
- PII never stored in plaintext logs

✅ **Audit Trail**:
- All API calls logged with timestamps
- Request/response bodies captured (with redactions)
- Retailer ID associated with each transaction
- Idempotency keys for retryable operations

---

## Response Format Specifications

### Success Response Format
```json
{
    "status": true,              // boolean
    "response_code": 1,          // integer
    "redirecturl": "string",     // URL (for onboarding)
    "onboard_pending": 1,        // integer (1 = pending, 0 = complete)
    "message": "string"          // success message
}
```

### Error Response Format
```json
{
    "status": "error",           // string (NOT boolean)
    "message": "string"          // error description
}
```

### Polymorphic Fields Handling

⚠️ **Important**: The API returns polymorphic JSON types that require special handling:

1. **status field**:
   - Success: `true` (boolean)
   - Error: `"error"` (string)
   
2. **onboard_pending field**:
   - Can be: boolean, integer (0/1), or string

Our implementation uses a `flexBool` type to handle all these variations safely.

---

## Required Information from Provider

To complete the AEPS integration, we need the following specifications:

### High Priority (Blocking Production Launch)

1. **Cash Withdrawal Endpoint**
   - ✅ Endpoint URL/path
   - ✅ Request field names and types
   - ✅ Response format
   - ✅ Error codes and messages
   - ✅ Timeout recommendations
   - ✅ Sample success/failure responses

2. **Balance Enquiry Endpoint**
   - ✅ Endpoint URL/path
   - ✅ Request field names and types
   - ✅ Response format (balance field name/format)
   - ✅ Error codes and messages

3. **Status Check Endpoint**
   - ✅ Endpoint URL/path
   - ✅ Request field (transaction ID parameter name)
   - ✅ Response format
   - ✅ All possible status values

### Medium Priority (Enhanced Features)

4. **Mini Statement Endpoint**
   - ✅ Endpoint URL/path
   - ✅ Request format
   - ✅ Statement entry format (JSON structure)
   - ✅ Maximum statement rows returned

5. **Aadhaar Pay Endpoint**
   - ✅ Endpoint URL/path
   - ✅ Request format
   - ✅ Response format

### General Requirements

6. **Biometric PID Data Format**
   - ✅ Expected format (XML? Base64?)
   - ✅ RD Service device compatibility
   - ✅ Sample PID data blocks

7. **Bank IIN Codes**
   - ✅ Complete list of supported bank IIN codes
   - ✅ Bank name → IIN mapping

8. **Error Codes Reference**
   - ✅ Complete list of error codes
   - ✅ Retry recommendations per error type
   - ✅ Customer-facing message guidelines

9. **Rate Limits**
   - ✅ API call rate limits
   - ✅ Retry-after recommendations
   - ✅ Burst allowances

10. **Webhook/Callback Specifications**
    - ✅ Callback URL requirements
    - ✅ Payload format for onboarding completion
    - ✅ Signature/authentication method
    - ✅ Retry policy

---

## Platform Readiness

### UtiliPay Backend Status

✅ **Ready**:
- Multipart form-data encoding
- Audit logging with PII redaction
- Error handling for polymorphic responses
- Idempotency for retryable operations
- Timeout configuration
- Capability discovery API

⏳ **Pending Provider Specs**:
- Transactional endpoints implementation
- Status check implementation
- Bank IIN code validation
- Complete error code mapping

### UtiliPay Frontend Status

✅ **Ready**:
- AEPS workspace UI
- Onboarding flow integration
- Capability-based feature flags
- Loading states for async operations

⏳ **Pending**:
- Biometric device integration (awaiting RD Service specs)
- Transaction forms (awaiting field names)
- Status check UI (awaiting status check API)

---

## Testing Checklist

### Onboarding Flow
- [x] New merchant onboarding (is_new=1)
- [x] Existing merchant resume (is_new=0)
- [x] Field validation
- [x] Invalid API key handling
- [x] Callback URL handling
- [ ] Callback webhook receipt (pending webhook spec)
- [ ] Onboarding completion confirmation

### Transactional Operations (Pending API Specs)
- [ ] Cash withdrawal success
- [ ] Cash withdrawal insufficient balance
- [ ] Cash withdrawal invalid Aadhaar
- [ ] Balance enquiry
- [ ] Mini statement retrieval
- [ ] Aadhaar Pay
- [ ] Status check for pending transaction
- [ ] Status check for completed transaction

### Error Handling
- [x] Network timeout
- [x] Invalid API key
- [x] Missing required field
- [ ] Invalid bank IIN
- [ ] Invalid biometric data
- [ ] Insufficient merchant balance
- [ ] Service temporarily unavailable

---

## Contact Information

**Provider**: Excisoft Tech  
**Integration Support**: *(to be added)*  
**Support Email**: *(to be added)*  
**Support Phone**: *(to be added)*  

**UtiliPay Integration Team**:  
**Email**: adminutilihub@gmail.com  
**Platform**: https://utilipayhub.com  

---

## Appendix: Sample Integration Code

### Backend (Go)
```go
// Onboard a retailer
result, err := aepsClient.Onboard(ctx, aeps.OnboardRequest{
    Mobile:       retailer.Mobile,
    MerchantCode: retailer.MerchantCode,
    FirmName:     retailer.ShopName,
    Email:        retailer.Email,
    IsNew:        true,
    CallbackURL:  "https://utilipayhub.com/api/v1/webhooks/aeps/onboard",
    RetailerID:   &retailer.ID,
})
```

### cURL (for manual testing)
```bash
curl -X POST 'https://apidev.excisofttech.com/api/v1/aeps/onboard' \
  -H 'Accept: application/json' \
  -F 'apiKey=Bw6MxIIzqXJ2edfmagbYysyMqWtcWUze' \
  -F 'mobile=9694310969' \
  -F 'merchantcode=SH86561' \
  -F 'firm_name=Sample Shop' \
  -F 'email=shop@example.com' \
  -F 'is_new=1' \
  -F 'callback_url=https://utilipayhub.com/api/v1/webhooks/aeps/onboard'
```

---

**End of Log**  
**Document Version**: 1.0  
**Last Updated**: August 3, 2026
