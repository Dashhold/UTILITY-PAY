package bharatconnect

import (
	"context"
	"errors"
	"sync"
	"testing"
	"time"
)

// clock is a controllable time source.
type clock struct{ t time.Time }

func (c *clock) now() time.Time          { return c.t }
func (c *clock) advance(d time.Duration) { c.t = c.t.Add(d) }

func newTestManager(t *testing.T, issue tokenIssuer) (*tokenManager, *clock, *MemoryTokenStore) {
	t.Helper()
	store := &MemoryTokenStore{}
	clk := &clock{t: time.Date(2026, 8, 1, 10, 0, 0, 0, time.UTC)}
	m := newTokenManager(store, issue, 30*time.Minute)
	m.now = clk.now
	return m, clk, store
}

// countingIssuer returns sequential tokens and records how often it was called.
func countingIssuer(clk *clock, calls *int) tokenIssuer {
	return func(context.Context) (string, time.Time, time.Time, error) {
		*calls++
		issued := clk.now()
		return "token-" + string(rune('A'+*calls-1)), issued, issued.Add(TokenValidity), nil
	}
}

func TestToken_CachesAcrossCalls(t *testing.T) {
	var calls int
	m, clk, _ := newTestManager(t, nil)
	m.issue = countingIssuer(clk, &calls)

	ctx := context.Background()
	first, err := m.Token(ctx)
	if err != nil {
		t.Fatalf("first Token: %v", err)
	}

	// Twenty further calls inside the validity window must not mint again: the
	// provider allows only 100 tokens per day.
	for i := 0; i < 20; i++ {
		got, err := m.Token(ctx)
		if err != nil {
			t.Fatalf("Token #%d: %v", i, err)
		}
		if got != first {
			t.Fatalf("Token #%d = %q, want the cached %q", i, got, first)
		}
	}
	if calls != 1 {
		t.Errorf("issuer called %d times, want 1", calls)
	}
}

func TestToken_RefreshesInsideSafetyWindow(t *testing.T) {
	var calls int
	m, clk, _ := newTestManager(t, nil)
	m.issue = countingIssuer(clk, &calls)

	ctx := context.Background()
	if _, err := m.Token(ctx); err != nil {
		t.Fatalf("initial Token: %v", err)
	}

	// Still comfortably valid: 23h in, 1h left, safety window is 30m.
	clk.advance(23 * time.Hour)
	if _, err := m.Token(ctx); err != nil {
		t.Fatalf("Token at 23h: %v", err)
	}
	if calls != 1 {
		t.Fatalf("issuer called %d times at 23h, want 1", calls)
	}

	// Now inside the 30-minute safety window, so it must refresh proactively
	// rather than risk a request outliving the token.
	clk.advance(40 * time.Minute)
	if _, err := m.Token(ctx); err != nil {
		t.Fatalf("Token at 23h40m: %v", err)
	}
	if calls != 2 {
		t.Errorf("issuer called %d times inside the safety window, want 2", calls)
	}
}

func TestToken_EnforcesDailyQuota(t *testing.T) {
	var calls int
	m, clk, _ := newTestManager(t, nil)
	m.issue = countingIssuer(clk, &calls)
	ctx := context.Background()

	// Force a fresh mint each time by expiring the token immediately.
	m.issue = func(context.Context) (string, time.Time, time.Time, error) {
		calls++
		issued := clk.now()
		// Expire instantly so the cache never satisfies the next call.
		return "t", issued, issued.Add(time.Millisecond), nil
	}

	for i := 0; i < DailyTokenQuota; i++ {
		if _, err := m.Token(ctx); err != nil {
			t.Fatalf("Token #%d: %v", i+1, err)
		}
	}
	if calls != DailyTokenQuota {
		t.Fatalf("issuer called %d times, want %d", calls, DailyTokenQuota)
	}

	// The 101st mint must be refused locally rather than throttled upstream.
	_, err := m.Token(ctx)
	if !errors.Is(err, ErrTokenQuotaExhausted) {
		t.Fatalf("error = %v, want ErrTokenQuotaExhausted", err)
	}
	if calls != DailyTokenQuota {
		t.Errorf("issuer called %d times after quota, want it not to be called again", calls)
	}
}

func TestToken_QuotaResetsNextDay(t *testing.T) {
	var calls int
	m, clk, _ := newTestManager(t, nil)
	ctx := context.Background()

	m.issue = func(context.Context) (string, time.Time, time.Time, error) {
		calls++
		issued := clk.now()
		return "t", issued, issued.Add(time.Millisecond), nil
	}

	for i := 0; i < DailyTokenQuota; i++ {
		if _, err := m.Token(ctx); err != nil {
			t.Fatalf("Token #%d: %v", i+1, err)
		}
	}
	if _, err := m.Token(ctx); !errors.Is(err, ErrTokenQuotaExhausted) {
		t.Fatalf("expected quota exhaustion, got %v", err)
	}

	// Crossing into the next UTC day resets the counter.
	clk.advance(24 * time.Hour)
	if _, err := m.Token(ctx); err != nil {
		t.Fatalf("Token after day rollover: %v", err)
	}
	if calls != DailyTokenQuota+1 {
		t.Errorf("issuer called %d times, want %d", calls, DailyTokenQuota+1)
	}
}

func TestToken_ConcurrentCallersMintOnce(t *testing.T) {
	// A cold cache hit by concurrent traffic must not mint N tokens: the
	// provider's rotation policy would invalidate all but the last, breaking
	// in-flight requests, and it would burn quota.
	var mu sync.Mutex
	calls := 0

	store := &MemoryTokenStore{}
	clk := &clock{t: time.Date(2026, 8, 1, 10, 0, 0, 0, time.UTC)}
	m := newTokenManager(store, func(context.Context) (string, time.Time, time.Time, error) {
		mu.Lock()
		calls++
		mu.Unlock()
		// Simulate provider latency to widen the race window.
		time.Sleep(20 * time.Millisecond)
		return "shared-token", clk.now(), clk.now().Add(TokenValidity), nil
	}, 30*time.Minute)
	m.now = clk.now

	const goroutines = 40
	var wg sync.WaitGroup
	results := make([]string, goroutines)
	errs := make([]error, goroutines)

	wg.Add(goroutines)
	for i := 0; i < goroutines; i++ {
		go func(idx int) {
			defer wg.Done()
			results[idx], errs[idx] = m.Token(context.Background())
		}(i)
	}
	wg.Wait()

	for i, err := range errs {
		if err != nil {
			t.Fatalf("goroutine %d: %v", i, err)
		}
		if results[i] != "shared-token" {
			t.Fatalf("goroutine %d got %q, want the shared token", i, results[i])
		}
	}

	mu.Lock()
	got := calls
	mu.Unlock()
	if got != 1 {
		t.Errorf("issuer called %d times under concurrency, want exactly 1", got)
	}
}

func TestToken_InvalidatePreservesQuotaCounter(t *testing.T) {
	var calls int
	m, clk, store := newTestManager(t, nil)
	m.issue = countingIssuer(clk, &calls)
	ctx := context.Background()

	if _, err := m.Token(ctx); err != nil {
		t.Fatalf("Token: %v", err)
	}
	if err := m.Invalidate(ctx); err != nil {
		t.Fatalf("Invalidate: %v", err)
	}

	rec, err := store.Load(ctx)
	if err != nil {
		t.Fatalf("Load: %v", err)
	}
	// Invalidation must not reset the counter, otherwise repeated invalidation
	// would be a way to bypass the daily cap entirely.
	if rec.IssuedTodayCount != 1 {
		t.Errorf("IssuedTodayCount = %d after invalidate, want 1", rec.IssuedTodayCount)
	}

	if _, err := m.Token(ctx); err != nil {
		t.Fatalf("Token after invalidate: %v", err)
	}
	if calls != 2 {
		t.Errorf("issuer called %d times, want 2 (invalidation forces a re-mint)", calls)
	}
}

func TestToken_DerivesExpiryWhenProviderOmitsIt(t *testing.T) {
	m, clk, store := newTestManager(t, nil)
	m.issue = func(context.Context) (string, time.Time, time.Time, error) {
		// Provider returns no expiry information.
		return "tok", time.Time{}, time.Time{}, nil
	}

	if _, err := m.Token(context.Background()); err != nil {
		t.Fatalf("Token: %v", err)
	}
	rec, err := store.Load(context.Background())
	if err != nil {
		t.Fatalf("Load: %v", err)
	}

	// The documented 24h validity is applied so the cache still works.
	want := clk.now().Add(TokenValidity)
	if !rec.ExpiresAt.Equal(want) {
		t.Errorf("ExpiresAt = %v, want the documented 24h default %v", rec.ExpiresAt, want)
	}
}

func TestToken_RejectsEmptyProviderToken(t *testing.T) {
	m, _, _ := newTestManager(t, nil)
	m.issue = func(context.Context) (string, time.Time, time.Time, error) {
		return "", time.Now(), time.Now().Add(TokenValidity), nil
	}
	if _, err := m.Token(context.Background()); err == nil {
		t.Fatal("expected an error when the provider returns an empty token")
	}
}

func TestToken_PropagatesIssuerFailure(t *testing.T) {
	sentinel := errors.New("provider is down")
	m, _, _ := newTestManager(t, nil)
	m.issue = func(context.Context) (string, time.Time, time.Time, error) {
		return "", time.Time{}, time.Time{}, sentinel
	}
	if _, err := m.Token(context.Background()); !errors.Is(err, sentinel) {
		t.Fatalf("error = %v, want it to wrap the issuer failure", err)
	}
}

func TestNewTokenManager_ClampsInvalidSafetyWindow(t *testing.T) {
	// A zero or oversized window would either disable proactive refresh or force
	// a mint on every call, so it is clamped to a sane default.
	for _, in := range []time.Duration{0, -time.Hour, 48 * time.Hour} {
		m := newTokenManager(&MemoryTokenStore{}, nil, in)
		if m.safety <= 0 || m.safety >= TokenValidity {
			t.Errorf("safety window %v was not clamped (got %v)", in, m.safety)
		}
	}
}
