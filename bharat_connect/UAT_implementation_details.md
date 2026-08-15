# UAT Implementation Details - Bharat Connect Integration

This document provides detailed explanations for UAT checklist questions 15-18, covering pending transaction handling, timeout cases, status check intervals, and token expiry management.

---

## 15. Handling of Pending Cases

### How Pending Transactions are Identified

A transaction is classified as **PENDING** when:

1. **Payment API Returns `SUCCESSPENDING` Status**
   - Provider response: `{"success": true, "data": {"status": "SUCCESSPENDING", ...}}`
   - This is an explicit pending indication from the provider

2. **Payment API Returns Inconclusive Messages**
   - Message contains: "Sorry! The transaction couldn't succeed"
   - Message contains: "Something went wrong. Please try again later."
   - These are documented by the provider as requiring status checks

3. **Payment API Returns HTTP 5xx or Times Out**
   - Network timeout (request exceeds configured timeout duration)
   - HTTP 500/503 from provider
   - Any transport-level failure after the request was sent

4. **Status Check API Returns `RECHARGESUCCESSPENDING`**
   - When polling an existing transaction

### Steps Performed After Identifying Pending Status

**Immediate Actions**:
1. Transaction status is set to `PENDING` in database
2. Wallet debit is **retained** (NOT reversed)
3. Transaction is marked for reconciliation worker pickup
4. User is shown "Payment is being processed" message
5. Frontend polls status API every 8 seconds (limited to success page session)

**Reconciliation Worker Actions**:
1. Worker runs every 5 minutes to find pending transactions
2. For each pending transaction:
   - Check age: if < 30 minutes, call Status Check API
   - If 30min - 24h old, call Status Check API with backoff
   - If > 24h old, escalate to manual review
3. Update transaction based on status API response

### How Long Transaction Remains Pending

| Age Range | Status Check Interval | Action |
|-----------|----------------------|--------|
| 0-5 minutes | Every 30 seconds (frontend) + Every 5 minutes (backend) | Auto-reconcile |
| 5-30 minutes | Every 5 minutes | Auto-reconcile |
| 30 minutes - 24 hours | Every 30 minutes | Auto-reconcile with alerts |
| > 24 hours | Manual review | Escalate to operations team |

**Maximum Pending Duration**: 24 hours, after which it escalates to manual review

### When and How Retries/Status Checks are Triggered

**Frontend Polling** (Success Page):
- Triggers: Transaction status is PENDING when success page loads
- Interval: Every 8 seconds
- Duration: While user remains on success page
- Method: Calls `/api/retailer/bharat-connect/status/:txnId`

**Backend Reconciliation Worker**:
- Triggers: Scheduled cron job every 5 minutes
- Selection Criteria:
  ```sql
  WHERE status = 'pending' 
    AND provider = 'bharatconnect'
    AND created_at > NOW() - INTERVAL '24 hours'
  ```
- For each transaction:
  1. Call provider Status Check API with transaction reference
  2. Parse response and determine outcome
  3. Update transaction status accordingly

**Retry Logic**:
- No payment retry (would risk double charge)
- Only status checks are retried
- Uses exponential backoff after 30 minutes

### How Final Status is Updated

**Success Path**:
1. Status API returns `RECHARGESUCCESS` or `SUCCESS`
2. Transaction status → `SUCCESS`
3. Commission is credited to retailer wallet
4. SMS receipt sent to customer
5. Provider reference number stored
6. Wallet debit is finalized (hold removed)

**Failure Path**:
1. Status API returns `RECHARGEFAILURE`
2. OR: Status API returns "Invalid transaction ID!" (provider has no record)
3. Transaction status → `FAILED`
4. Wallet debit is reversed (amount returned to retailer)
5. Customer notified of failure
6. Refund processed

**Continued Pending**:
1. Status API returns `RECHARGESUCCESSPENDING`
2. OR: Status API times out
3. Transaction remains `PENDING`
4. Next reconciliation cycle will check again

---

## 16. Handling of Timeout Cases

### How Timeout is Detected

**Network Timeout Detection**:
```go
// Backend configuration
httpClient := &http.Client{
    Timeout: 30 * time.Second, // Configured per environment
}
```

A timeout is detected when:
1. HTTP request to provider exceeds 30 seconds (configurable)
2. Provider does not respond within timeout window
3. `context.DeadlineExceeded` error is returned

**Timeout Scenarios**:
- Payment API times out after sending request
- Status Check API times out
- View Bill API times out
- Validation API times out

### System Logic After Timeout Occurs

**For Payment API Timeout**:
1. **DO NOT reverse wallet debit** (critical: payment may have succeeded)
2. Mark transaction as `PENDING` (not FAILED)
3. Store partial provider context if available
4. Log timeout event with correlation ID
5. Immediately trigger status check attempt
6. If status check also times out, hand over to reconciler

**For Status Check API Timeout**:
1. Keep transaction in `PENDING` state
2. Log timeout for monitoring
3. Wait for next reconciliation cycle
4. Do NOT mark as failed (would reverse wallet incorrectly)

**For Non-Payment API Timeout (Validation, ViewBill)**:
1. Return HTTP 503 to client
2. No wallet impact (these are read-only)
3. User can retry immediately
4. No reconciliation needed

### Whether Retries or Status Checks are Initiated

**Immediate Retry** (None for payments):
- Payments are NEVER retried automatically (double-charge risk)
- Status checks may retry once after 30 seconds
- Validation/ViewBill may retry with exponential backoff

**Status Check Schedule After Payment Timeout**:
1. **t=0**: Payment times out
2. **t=30s**: First status check attempt (backend)
3. **t=5min**: Second status check (reconciler)
4. **t=10min**: Third status check (reconciler)
5. **t=15min**: Fourth status check (reconciler)
6. Continue every 5 minutes for 30 minutes
7. Then every 30 minutes up to 24 hours

### How to Differentiate Between Timeout vs Pending vs Failed

| Scenario | Outcome Classification | Wallet Action | Next Step |
|----------|----------------------|---------------|-----------|
| **Payment times out** | `PENDING` | Hold debit | Status check |
| **Payment returns SUCCESSPENDING** | `PENDING` | Hold debit | Status check |
| **Payment returns RECHARGEFAILURE** | `FAILED` | Reverse debit | Done |
| **Payment returns HTTP 200 + success=true + status=SUCCESS** | `SUCCESS` | Finalize debit | Done |
| **Status check times out** | Remain `PENDING` | Hold debit | Wait for next cycle |
| **Status check returns RECHARGESUCCESS** | `SUCCESS` | Finalize debit | Done |
| **Status check returns "Invalid transaction ID!"** | `FAILED` | Reverse debit | Done (provider has no record) |

**Key Decision Logic**:
```
IF payment_sent AND (timeout OR 5xx OR inconclusive_message):
    outcome = PENDING  # Cannot confirm success or failure
    
ELSE IF payment_success=false AND error_code != "500":
    outcome = FAILED  # Definitive rejection
    
ELSE IF payment_success=true AND status="RECHARGEFAILURE":
    outcome = FAILED  # Biller rejected
    
ELSE IF payment_success=true AND status="SUCCESS":
    outcome = SUCCESS  # Confirmed success
```

### How Final Reconciliation is Performed

**Daily Reconciliation Process**:
1. **T+1 EOD**: Export all transactions from last 24 hours
2. **Match with provider settlement report**:
   - Match by: Bharat Connect Txn ID (mobikwikstamp)
   - Match by: Partner Txn ID (reqid)
3. **Identify mismatches**:
   - Transactions marked SUCCESS locally but FAILED in provider report → Reverse
   - Transactions marked FAILED locally but SUCCESS in provider report → Retry status check
   - Transactions marked PENDING after 24h → Escalate to manual review
4. **Generate reconciliation report**:
   - Total transactions
   - Success count & amount
   - Failed count & amount
   - Pending count & amount (should be zero)
   - Mismatches requiring action

**File-Based Reconciliation**:
- Provider sends settlement file via SFTP (daily at 9 AM)
- Automated job parses file and matches with local records
- Discrepancies logged and alerted to operations team
- Manual intervention required for unresolved cases after 48h

---

## 17. Interval for Status Check on Pending/Timeout Cases

### Exact Time Interval for Retry/Status Check

**Phase 1: Active Reconciliation (0-30 minutes)**
- **First check**: 30 seconds after payment
- **Frequency**: Every 5 minutes
- **Method**: Backend reconciliation worker
- **Total attempts in phase**: 6 attempts

**Phase 2: Extended Reconciliation (30 minutes - 24 hours)**
- **Frequency**: Every 30 minutes
- **Method**: Backend reconciliation worker with lower priority
- **Total attempts in phase**: 47 attempts
- **Reason**: Most pending transactions resolve within 30 minutes; longer delays indicate provider issues

**Phase 3: Manual Review (> 24 hours)**
- **Frequency**: Daily review by operations team
- **Method**: Manual status check + provider support ticket
- **Total duration**: Up to 7 days (provider SLA)

### Number of Attempts

| Time Window | Check Interval | Number of Attempts |
|-------------|---------------|-------------------|
| 0-30 minutes | 5 minutes | 6 attempts |
| 30 min - 1 hour | 30 minutes | 2 attempts |
| 1-24 hours | 30 minutes | 46 attempts |
| **Total automatic attempts** | | **54 attempts** |

**After 54 attempts**: Transaction escalates to manual review

### Total Retry Duration

- **Automatic reconciliation window**: 24 hours
- **Manual review window**: Additional 7 days (provider SLA)
- **Maximum resolution time**: 8 days (1 day auto + 7 days manual)

**Hard Timeout**:
- After 8 days, if provider cannot resolve:
  - Transaction marked as FAILED
  - Wallet debit reversed
  - Customer refunded
  - Incident logged for audit

### Logic Behind Retry Mechanism

**Why 5-minute intervals initially?**
- Most timeouts are transient network issues
- Provider typically responds within 5-10 minutes
- Balances between quick resolution and API load

**Why exponential backoff after 30 minutes?**
- If still pending after 30 minutes, likely a provider-side issue
- Reduces unnecessary API calls
- Gives provider systems time to settle

**Why 24-hour cutoff for automation?**
- Industry standard for payment reconciliation
- Regulatory requirement for T+1 settlement
- Beyond 24h, manual intervention is more effective

**Backoff Algorithm**:
```
if age < 30 minutes:
    interval = 5 minutes
elif age < 1 hour:
    interval = 15 minutes
elif age < 24 hours:
    interval = 30 minutes
else:
    escalate to manual review
```

---

## 18. Handling of Token Expiry Cases

### How Token Expiry is Detected

**Proactive Detection**:
```go
// Token validity check BEFORE using
if tokenExpiresAt.Sub(time.Now()) < safetyWindow {
    // Token expires within safety window (30 minutes)
    refreshToken()
}
```

**Configuration**:
- Token validity: 24 hours (provider-stated)
- Safety window: 30 minutes (configured in backend)
- Tokens are refreshed proactively at 23h 30m mark

**Reactive Detection** (Token Already Expired):
1. **Provider returns HTTP 200 with code="401"**:
   ```json
   {
     "success": false,
     "message": {
       "code": "401",
       "text": "Token is expired/Invalid Token/Token not found in request"
     }
   }
   ```
2. **HTTP 401 Unauthorized** (less common, but handled)

**Detection Points**:
- Payment API call
- Status Check API call
- Balance Check API call
- Validation API call
- View Bill API call
- Plans API call

### How System Regenerates Token

**Token Generation Process**:
1. **Check current token validity**:
   ```
   IF current_token.expires_at - now < 30 minutes:
       generate new token
   ```

2. **Call Token API**:
   ```
   POST /recharge/v1/verify/retailer
   Body: {
     "clientId": "<from config>",
     "clientSecret": "<from config>"
   }
   ```

3. **Store new token with metadata**:
   ```go
   tokenRecord := TokenRecord{
       Token:            "<new token>",
       IssuedAt:         time.Now(),
       ExpiresAt:        time.Now().Add(24 * time.Hour),
       IssuedTodayCount: previousCount + 1,
       QuotaDate:        today,
   }
   store.Save(tokenRecord)
   ```

4. **Quota Management**:
   - Track tokens issued per day
   - Maximum: 100 tokens/day (provider limit)
   - If quota exhausted: Return error, alert operations
   - Reset quota at midnight UTC

**Token Storage**:
- Persisted in database (survives restarts)
- Shared across all API instances (prevents quota exhaustion)
- Encrypted at rest

### How Previously Failed Request is Retried

**Automatic Retry Logic** (One-time):

1. **API call fails with token expiry error**
2. **Invalidate current token**:
   ```go
   tokenManager.Invalidate(ctx)
   ```
3. **Fetch fresh token** (or use proactively cached one)
4. **Retry EXACT same request** with new token:
   - Same parameters
   - Same payload
   - Same operation
5. **If second attempt also fails with 401**: Return error (credential issue, not expiry)

**Critical: Only ONE auto-retry**:
- Second consecutive token rejection = credential problem
- Further retries would waste daily quota (100 tokens/day)
- Alert operations team immediately

**Retry Example**:
```go
func (c *Client) call(ctx context.Context, spec callSpec) (*rawResponse, error) {
    // First attempt
    resp, err := c.callOnce(ctx, spec)
    
    // Check for token expiry
    if !provider.IsAuthExpired(err) && !c.tokenRejected(resp) {
        return resp, err  // Not a token issue
    }
    
    // Invalidate and fetch new token
    if invErr := c.tokens.Invalidate(ctx); invErr != nil {
        return resp, fmt.Errorf("invalidate token: %w", invErr)
    }
    
    // Retry ONCE
    spec.attempt++
    return c.callOnce(ctx, spec)
}
```

### Fail-Safes Implemented

**1. Quota Protection**:
- Track daily token issuance count
- Reject new token requests if quota (100) exhausted
- Alert operations at 80% quota usage
- Automatic quota reset at midnight UTC

**2. Token Persistence**:
- Store in database (not memory)
- Survives application restarts
- Shared across multiple instances
- Prevents quota exhaustion on deployment

**3. Proactive Refresh**:
- Refresh 30 minutes before expiry (safety window)
- Prevents user-facing token expiry errors
- Runs as background job every 1 hour

**4. Concurrent Request Protection**:
- Mutex lock on token refresh
- Only one goroutine refreshes at a time
- Others wait for new token
- Prevents thundering herd exhausting quota

**5. Error Handling**:
- Token fetch failure → Use cached token if < 30 min to expiry
- Token save failure → Still return token (usable, not persisted)
- Credential error → Alert immediately, stop retrying

**6. Monitoring & Alerts**:
- Alert when 80% of daily quota used
- Alert on consecutive token generation failures
- Alert when token is rejected despite being fresh
- Dashboard shows: current token age, quota usage, last refresh time

**7. Fallback for Critical Operations**:
- If quota exhausted and token expired:
  - Mark service as degraded
  - Queue new payment requests (don't reject)
  - Process queue when quota resets at midnight
  - Notify customer of delay

**8. Credential Rotation Support**:
- Supports hot-reload of new credentials
- No downtime during credential update
- Old tokens invalidated gracefully

---

## Summary Table

| Aspect | Value | Notes |
|--------|-------|-------|
| **Pending Detection** | Auto-detect from provider response | SUCCESSPENDING, timeout, 5xx |
| **Pending Duration** | Max 24h auto, then manual | 54 automatic status checks |
| **Status Check Interval** | 5 min (0-30min), 30 min (30min-24h) | Exponential backoff |
| **Timeout Classification** | Always PENDING, never FAILED | Prevents wrong reversals |
| **Token Validity** | 24 hours | Provider-stated |
| **Token Refresh Window** | 30 minutes before expiry | Proactive |
| **Token Quota** | 100/day | Provider limit |
| **Retry Count** | 1 attempt for token expiry | Prevents quota waste |
| **Reconciliation Window** | 24 hours automatic | Then manual review |
| **Maximum Resolution Time** | 8 days (1 auto + 7 manual) | After that, forced refund |

---

## Technical Implementation References

**Backend Files**:
- `backend/internal/provider/bharatconnect/client.go` - API client with timeout handling
- `backend/internal/provider/bharatconnect/token.go` - Token management
- `backend/internal/service/reconciliation.go` - Reconciliation worker
- `backend/internal/service/transaction.go` - Transaction state machine

**Configuration**:
- `BC_TIMEOUT` - HTTP client timeout (default: 30s)
- `BC_TOKEN_SAFETY_WINDOW` - Proactive refresh window (default: 30m)
- `RECONCILIATION_INTERVAL` - Status check frequency (default: 5m)

**Database Schema**:
- `transactions` table with `status`, `provider_txn_id`, `needs_manual_review`
- `token_cache` table with `token`, `expires_at`, `issued_today_count`, `quota_date`

---

**Document Version**: 1.0  
**Last Updated**: 2026-08-16  
**Prepared For**: MobiKwik Bharat Connect UAT Submission  
**Contact**: operations@utilipayhub.com
