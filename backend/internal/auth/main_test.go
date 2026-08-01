package auth

import (
	"os"
	"testing"

	"golang.org/x/crypto/bcrypt"
)

// TestMain lowers the bcrypt cost for the whole package.
//
// Production uses cost 12 by design. Under the race detector that makes each
// hash take seconds and the suite take minutes, which buys no additional
// confidence: these tests verify hashing logic, not its work factor. The cost
// itself is asserted separately in TestDefaultBcryptCostIsHardened.
func TestMain(m *testing.M) {
	restore := SetBcryptCostForTesting(bcrypt.MinCost)
	code := m.Run()
	restore()
	os.Exit(code)
}

func TestDefaultBcryptCostIsHardened(t *testing.T) {
	// A regression that lowered the production cost would weaken every stored
	// password, so the constant is pinned explicitly.
	if DefaultBcryptCost < 12 {
		t.Errorf("DefaultBcryptCost = %d, want at least 12", DefaultBcryptCost)
	}
	if DefaultBcryptCost > bcrypt.MaxCost {
		t.Errorf("DefaultBcryptCost = %d exceeds bcrypt.MaxCost %d", DefaultBcryptCost, bcrypt.MaxCost)
	}
}

func TestSetBcryptCostForTesting_RejectsOutOfRange(t *testing.T) {
	for _, cost := range []int{bcrypt.MinCost - 1, bcrypt.MaxCost + 1, -1, 0} {
		func() {
			defer func() {
				if recover() == nil {
					t.Errorf("cost %d should have panicked", cost)
				}
			}()
			SetBcryptCostForTesting(cost)
		}()
	}
}

func TestSetBcryptCostForTesting_Restores(t *testing.T) {
	before := bcryptCost
	restore := SetBcryptCostForTesting(bcrypt.MinCost + 1)
	if bcryptCost == before {
		t.Fatal("cost was not changed")
	}
	restore()
	if bcryptCost != before {
		t.Errorf("cost = %d after restore, want %d", bcryptCost, before)
	}
}
