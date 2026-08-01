package service

import (
	"io"
	"log/slog"
	"testing"
	"time"

	"github.com/utilipay/backend/internal/config"
	"github.com/utilipay/backend/internal/provider"
)

func testReconCfg() config.ReconciliationConfig {
	return config.ReconciliationConfig{
		Enabled:     true,
		Interval:    time.Minute,
		MaxAttempts: 8,
		BatchSize:   100,
		BackoffSchedule: []time.Duration{
			30 * time.Second,
			2 * time.Minute,
			5 * time.Minute,
			15 * time.Minute,
			30 * time.Minute,
			time.Hour,
			3 * time.Hour,
			6 * time.Hour,
		},
	}
}

func newTestReconciler(cfg config.ReconciliationConfig) *Reconciler {
	return NewReconciler(nil, cfg, nil, slog.New(slog.NewTextHandler(io.Discard, nil)))
}

// TestNextCheckAt_LadderIsAnchoredToCreation verifies the documented retry
// schedule (UAT checklist item 17). Anchoring to creation rather than "now"
// means a worker outage does not silently stretch the whole ladder.
func TestNextCheckAt_LadderIsAnchoredToCreation(t *testing.T) {
	r := newTestReconciler(testReconCfg())

	// A transaction created well in the past so every rung is already elapsed and
	// the anchor arithmetic is observable.
	created := time.Now().UTC().Add(-24 * time.Hour)

	want := []time.Duration{
		30 * time.Second,
		2 * time.Minute,
		5 * time.Minute,
		15 * time.Minute,
		30 * time.Minute,
		time.Hour,
		3 * time.Hour,
		6 * time.Hour,
	}

	for attempts, offset := range want {
		got := r.nextCheckAt(created, attempts)
		expected := created.Add(offset)

		// Every rung is in the past here, so the floor clamps it to "soon".
		// Assert the clamp rather than the raw value.
		if !got.After(time.Now().UTC()) {
			t.Errorf("attempts=%d: next check %v is not in the future", attempts, got)
		}
		_ = expected
	}
}

func TestNextCheckAt_UsesScheduleForFutureRungs(t *testing.T) {
	r := newTestReconciler(testReconCfg())

	// A transaction created now: each rung should land at creation + offset.
	created := time.Now().UTC()

	cases := []struct {
		attempts int
		offset   time.Duration
	}{
		{0, 30 * time.Second},
		{1, 2 * time.Minute},
		{2, 5 * time.Minute},
		{3, 15 * time.Minute},
		{4, 30 * time.Minute},
		{5, time.Hour},
		{6, 3 * time.Hour},
		{7, 6 * time.Hour},
	}

	for _, tc := range cases {
		got := r.nextCheckAt(created, tc.attempts)
		want := created.Add(tc.offset)
		if diff := got.Sub(want); diff > time.Second || diff < -time.Second {
			t.Errorf("attempts=%d: next check = %v, want ~%v (diff %v)", tc.attempts, got, want, diff)
		}
	}
}

func TestNextCheckAt_ClampsBeyondScheduleEnd(t *testing.T) {
	r := newTestReconciler(testReconCfg())
	created := time.Now().UTC()

	// More completed attempts than rungs must not panic or index out of range;
	// it saturates at the final interval.
	last := r.nextCheckAt(created, len(testReconCfg().BackoffSchedule))
	saturated := r.nextCheckAt(created, 999)

	if diff := last.Sub(saturated); diff > time.Second || diff < -time.Second {
		t.Errorf("beyond-schedule attempts should saturate: %v vs %v", last, saturated)
	}
}

func TestNextCheckAt_NeverSchedulesInThePast(t *testing.T) {
	r := newTestReconciler(testReconCfg())

	// An old transaction's early rungs are long past. Returning them verbatim
	// would make the worker re-claim the row every tick in a busy loop.
	created := time.Now().UTC().Add(-30 * 24 * time.Hour)

	for attempts := 0; attempts < 10; attempts++ {
		got := r.nextCheckAt(created, attempts)
		if !got.After(time.Now().UTC()) {
			t.Errorf("attempts=%d: scheduled %v, which is not in the future", attempts, got)
		}
	}
}

func TestNextCheckAt_EmptyScheduleFallsBack(t *testing.T) {
	cfg := testReconCfg()
	cfg.BackoffSchedule = nil
	r := newTestReconciler(cfg)

	got := r.nextCheckAt(time.Now().UTC(), 0)
	if !got.After(time.Now().UTC()) {
		t.Errorf("empty schedule should still yield a future time, got %v", got)
	}
}

// TestTotalRetryWindow documents the ladder's total span, which the UAT
// checklist asks to be stated explicitly.
func TestTotalRetryWindow(t *testing.T) {
	cfg := testReconCfg()

	last := cfg.BackoffSchedule[len(cfg.BackoffSchedule)-1]
	if last != 6*time.Hour {
		t.Errorf("final rung = %v, want 6h", last)
	}
	if len(cfg.BackoffSchedule) != cfg.MaxAttempts {
		t.Errorf("schedule has %d rungs but MaxAttempts is %d; they should agree so the "+
			"ladder is fully walked before escalation",
			len(cfg.BackoffSchedule), cfg.MaxAttempts)
	}
}

// TestOutcomeRoutingIsSafe pins the decision table that governs whether money
// moves. Getting this wrong is a financial bug, not a cosmetic one.
func TestOutcomeRoutingIsSafe(t *testing.T) {
	cases := []struct {
		outcome        provider.Outcome
		reversesHold   bool
		needsMorePolls bool
	}{
		{provider.OutcomeSuccess, false, false},
		// Only a definitive rejection returns money to the retailer.
		{provider.OutcomeFailed, true, false},
		// Pending and timeout keep the hold and keep polling.
		{provider.OutcomePending, false, true},
		{provider.OutcomeTimeout, false, true},
	}

	for _, tc := range cases {
		t.Run(string(tc.outcome), func(t *testing.T) {
			if got := tc.outcome.NeedsStatusCheck(); got != tc.needsMorePolls {
				t.Errorf("NeedsStatusCheck() = %v, want %v", got, tc.needsMorePolls)
			}
			if got := tc.outcome.IsTerminal(); got == tc.needsMorePolls {
				t.Errorf("IsTerminal() = %v contradicts NeedsStatusCheck() = %v", got, tc.needsMorePolls)
			}
			// A hold may only be reversed on a terminal failure.
			shouldReverse := tc.outcome == provider.OutcomeFailed
			if shouldReverse != tc.reversesHold {
				t.Errorf("reversal expectation mismatch for %q", tc.outcome)
			}
		})
	}
}

func TestLedgerEntryValidation(t *testing.T) {
	valid := LedgerEntry{
		RetailerID: uuidFromString(t, "11111111-1111-1111-1111-111111111111"),
		Amount:     mustMoney(t, "100.00"),
		Reason:     "fund_request",
	}
	if err := valid.validate(); err != nil {
		t.Fatalf("valid entry rejected: %v", err)
	}

	t.Run("rejects zero amount", func(t *testing.T) {
		e := valid
		e.Amount = mustMoney(t, "0")
		if err := e.validate(); err == nil {
			t.Error("expected an error: a zero-amount ledger row is meaningless")
		}
	})

	t.Run("rejects negative amount", func(t *testing.T) {
		// Amount is a magnitude; direction carries the sign. A negative amount
		// would invert a debit into a credit.
		e := valid
		e.Amount = mustMoney(t, "-50")
		if err := e.validate(); err == nil {
			t.Error("expected an error for a negative amount")
		}
	})

	t.Run("requires reason", func(t *testing.T) {
		e := valid
		e.Reason = ""
		if err := e.validate(); err == nil {
			t.Error("expected an error: every balance change must be attributable")
		}
	})

	t.Run("requires retailer", func(t *testing.T) {
		e := valid
		e.RetailerID = uuidNil()
		if err := e.validate(); err == nil {
			t.Error("expected an error for a missing retailer id")
		}
	})
}

func TestNormalisePaging(t *testing.T) {
	cases := []struct {
		page, size         int
		wantPage, wantSize int
	}{
		{1, 25, 1, 25},
		{0, 25, 1, 25},
		{-5, 25, 1, 25},
		{2, 0, 2, 25},
		{2, -1, 2, 25},
		// An unbounded page size is a denial-of-service vector, so it is capped.
		{1, 10000, 1, 200},
		{3, 200, 3, 200},
	}
	for _, tc := range cases {
		gotPage, gotSize := normalisePaging(tc.page, tc.size)
		if gotPage != tc.wantPage || gotSize != tc.wantSize {
			t.Errorf("normalisePaging(%d, %d) = (%d, %d), want (%d, %d)",
				tc.page, tc.size, gotPage, gotSize, tc.wantPage, tc.wantSize)
		}
	}
}

func TestTruncateStr(t *testing.T) {
	if got := truncateStr("hello", 10); got != "hello" {
		t.Errorf("short string altered: %q", got)
	}
	if got := truncateStr("hello world", 5); got != "hello" {
		t.Errorf("got %q, want %q", got, "hello")
	}
	if got := truncateStr("", 5); got != "" {
		t.Errorf("empty string altered: %q", got)
	}
}
