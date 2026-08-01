package bharatconnect

import (
	"context"
	"errors"
	"fmt"
	"sync"
	"time"
)

// Documented token constraints, from recharge&billpayment_api_doc.md:
//
//   - A generated token is valid for 24 hours.
//   - There is a daily limit of 100 tokens.
//   - Requesting a new token while one is active expires the incumbent after
//     5 minutes (token rotation policy), and the new token gets a fresh 24h.
//
// These rules make caching mandatory rather than an optimisation: minting a
// token per request would blow the daily quota within minutes and would also
// keep invalidating the token that in-flight requests are using.
const (
	// TokenValidity is the provider-stated lifetime of an issued token.
	TokenValidity = 24 * time.Hour
	// DailyTokenQuota is the provider-stated maximum tokens per day.
	DailyTokenQuota = 100
	// RotationGrace is how long an incumbent token keeps working after a new
	// one is issued.
	RotationGrace = 5 * time.Minute
)

// ErrTokenQuotaExhausted is returned when the daily issuance cap is reached.
//
// Failing explicitly is better than issuing a request we know the provider will
// throttle: the caller can surface a precise operational alert.
var ErrTokenQuotaExhausted = errors.New("bharatconnect: daily token quota exhausted")

// TokenRecord is the persisted state of the cached token.
type TokenRecord struct {
	Token            string
	IssuedAt         time.Time
	ExpiresAt        time.Time
	IssuedTodayCount int
	QuotaDate        time.Time
}

// TokenStore persists the token across process restarts.
//
// Persistence is required, not optional: an in-memory-only cache would mint a
// fresh token on every deploy or restart and walk into the 100/day cap.
type TokenStore interface {
	// Load returns the stored record, or nil when nothing is stored.
	Load(ctx context.Context) (*TokenRecord, error)
	// Save writes the record.
	Save(ctx context.Context, rec TokenRecord) error
}

// MemoryTokenStore is an in-process TokenStore for tests and single-run tools.
type MemoryTokenStore struct {
	mu  sync.Mutex
	rec *TokenRecord
}

// Load implements TokenStore.
func (m *MemoryTokenStore) Load(context.Context) (*TokenRecord, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	if m.rec == nil {
		return nil, nil
	}
	clone := *m.rec
	return &clone, nil
}

// Save implements TokenStore.
func (m *MemoryTokenStore) Save(_ context.Context, rec TokenRecord) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.rec = &rec
	return nil
}

// tokenIssuer mints a brand-new token from the provider.
type tokenIssuer func(ctx context.Context) (token string, issuedAt time.Time, expiresAt time.Time, err error)

// tokenManager serialises token acquisition and enforces the quota.
type tokenManager struct {
	store  TokenStore
	issue  tokenIssuer
	safety time.Duration
	now    func() time.Time

	// mu ensures only one goroutine mints a token at a time. Without it, a burst
	// of concurrent requests on a cold cache would each mint a token, and the
	// provider's rotation policy would invalidate all but the last.
	mu sync.Mutex
}

func newTokenManager(store TokenStore, issue tokenIssuer, safety time.Duration) *tokenManager {
	if safety <= 0 || safety >= TokenValidity {
		// A nonsensical safety window would either disable proactive refresh or
		// force a refresh on every call.
		safety = 30 * time.Minute
	}
	return &tokenManager{
		store:  store,
		issue:  issue,
		safety: safety,
		now:    time.Now,
	}
}

// Token returns a usable token, minting one only when necessary.
func (m *tokenManager) Token(ctx context.Context) (string, error) {
	// Fast path: a cached token that is comfortably valid needs no lock
	// contention beyond the store read.
	if rec, err := m.store.Load(ctx); err == nil && rec != nil && m.isFresh(*rec) {
		return rec.Token, nil
	}

	m.mu.Lock()
	defer m.mu.Unlock()

	// Re-check under the lock: another goroutine may have refreshed while we
	// waited, and reusing its token avoids burning quota.
	rec, err := m.store.Load(ctx)
	if err != nil {
		return "", fmt.Errorf("bharatconnect: load cached token: %w", err)
	}
	if rec != nil && m.isFresh(*rec) {
		return rec.Token, nil
	}

	return m.mint(ctx, rec)
}

// Invalidate marks the cached token unusable so the next call re-mints.
// Used when the provider rejects a token we believed was valid.
func (m *tokenManager) Invalidate(ctx context.Context) error {
	m.mu.Lock()
	defer m.mu.Unlock()

	rec, err := m.store.Load(ctx)
	if err != nil {
		return err
	}
	if rec == nil {
		return nil
	}
	// Expire it in place rather than deleting, so the quota counter for today
	// survives and cannot be reset by repeated invalidation.
	rec.Token = ""
	rec.ExpiresAt = m.now().Add(-time.Second)
	return m.store.Save(ctx, *rec)
}

// mint issues a new token, carrying the daily counter forward.
func (m *tokenManager) mint(ctx context.Context, prev *TokenRecord) (string, error) {
	today := m.today()

	count := 0
	if prev != nil && sameDay(prev.QuotaDate, today) {
		count = prev.IssuedTodayCount
	}

	if count >= DailyTokenQuota {
		return "", fmt.Errorf("%w (%d issued on %s)", ErrTokenQuotaExhausted, count, today.Format("2006-01-02"))
	}

	token, issuedAt, expiresAt, err := m.issue(ctx)
	if err != nil {
		return "", err
	}
	if token == "" {
		return "", errors.New("bharatconnect: provider returned an empty token")
	}

	if issuedAt.IsZero() {
		issuedAt = m.now()
	}
	if expiresAt.IsZero() || expiresAt.Before(issuedAt) {
		// The provider documents 24h validity; derive it when the response does
		// not state an explicit expiry.
		expiresAt = issuedAt.Add(TokenValidity)
	}

	rec := TokenRecord{
		Token:            token,
		IssuedAt:         issuedAt,
		ExpiresAt:        expiresAt,
		IssuedTodayCount: count + 1,
		QuotaDate:        today,
	}
	if err := m.store.Save(ctx, rec); err != nil {
		// The token is usable even if persistence failed; returning it avoids
		// wasting quota, but the error is worth surfacing upstream via logs.
		return token, fmt.Errorf("bharatconnect: persist token: %w", err)
	}
	return token, nil
}

// isFresh reports whether a cached token can still be presented safely.
//
// The safety window is subtracted so a token is never handed out when it is
// close enough to expiry that a slow request could outlive it.
func (m *tokenManager) isFresh(rec TokenRecord) bool {
	if rec.Token == "" {
		return false
	}
	return m.now().Add(m.safety).Before(rec.ExpiresAt)
}

func (m *tokenManager) today() time.Time {
	n := m.now().UTC()
	return time.Date(n.Year(), n.Month(), n.Day(), 0, 0, 0, 0, time.UTC)
}

func sameDay(a, b time.Time) bool {
	ay, am, ad := a.UTC().Date()
	by, bm, bd := b.UTC().Date()
	return ay == by && am == bm && ad == bd
}
