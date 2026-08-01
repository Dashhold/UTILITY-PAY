package auth

import (
	"errors"
	"strings"
	"testing"
	"time"

	"github.com/golang-jwt/jwt/v5"
	"github.com/google/uuid"

	"github.com/utilipay/backend/internal/config"
	"github.com/utilipay/backend/internal/models"
)

func testJWTConfig() config.JWTConfig {
	return config.JWTConfig{
		Secret:          "test-secret-key-that-is-long-enough-for-hs256",
		AccessTokenTTL:  time.Hour,
		RefreshTokenTTL: 24 * time.Hour,
		Issuer:          "utilipay-api",
	}
}

func testUser(role models.Role) *models.User {
	u := &models.User{
		Name:   "Test User",
		Email:  "test@example.com",
		Role:   role,
		Status: models.AccountActive,
	}
	u.ID = uuid.New()
	return u
}

func TestHashPassword_EnforcesPolicy(t *testing.T) {
	rejected := map[string]string{
		"too short": "ab1",
		"no digit":  "onlyletters",
		"no letter": "12345678",
		"empty":     "",
		"very long": strings.Repeat("a1", 100),
	}
	for name, pw := range rejected {
		t.Run(name, func(t *testing.T) {
			if _, err := HashPassword(pw); err == nil {
				t.Errorf("HashPassword(%q) should be rejected", pw)
			} else if !errors.Is(err, ErrWeakPassword) {
				t.Errorf("error = %v, want ErrWeakPassword", err)
			}
		})
	}

	accepted := []string{"password1", "Str0ngPass!", "abcdefg1"}
	for _, pw := range accepted {
		if _, err := HashPassword(pw); err != nil {
			t.Errorf("HashPassword(%q) should be accepted: %v", pw, err)
		}
	}
}

func TestHashProvisionedPassword_BypassesPolicyButNotSafety(t *testing.T) {
	// The seeded demo credentials contain no digit and would fail the interactive
	// policy; operator-provisioned passwords must still work.
	for _, pw := range []string{"jagbiradmin", "retailerdemo"} {
		hash, err := HashProvisionedPassword(pw)
		if err != nil {
			t.Fatalf("HashProvisionedPassword(%q): %v", pw, err)
		}
		if !VerifyPassword(hash, pw) {
			t.Errorf("provisioned password %q does not verify against its own hash", pw)
		}
		// The same value must still be rejected by the interactive path, so the
		// bypass is genuinely scoped to provisioning.
		if _, err := HashPassword(pw); err == nil {
			t.Errorf("HashPassword(%q) should still enforce the policy", pw)
		}
	}

	if _, err := HashProvisionedPassword(""); err == nil {
		t.Error("empty password must be rejected even when provisioned")
	}

	// bcrypt ignores input past 72 bytes, which would make distinct passwords
	// interchangeable, so over-long input is refused rather than silently cut.
	if _, err := HashProvisionedPassword(strings.Repeat("x", 73)); err == nil {
		t.Error("password longer than 72 bytes must be rejected")
	}
}

func TestVerifyPassword(t *testing.T) {
	hash, err := HashPassword("correct1horse")
	if err != nil {
		t.Fatalf("HashPassword: %v", err)
	}

	if !VerifyPassword(hash, "correct1horse") {
		t.Error("correct password did not verify")
	}
	if VerifyPassword(hash, "wrong1password") {
		t.Error("wrong password verified")
	}
	if VerifyPassword("not-a-bcrypt-hash", "correct1horse") {
		t.Error("malformed hash verified")
	}
	if VerifyPassword(hash, "") {
		t.Error("empty password verified")
	}
}

func TestHashPassword_ProducesDistinctHashes(t *testing.T) {
	// bcrypt salts each hash, so the same password must never produce the same
	// digest twice. Identical digests would mean the salt is not applied.
	a, err := HashPassword("samepass1")
	if err != nil {
		t.Fatalf("HashPassword: %v", err)
	}
	b, err := HashPassword("samepass1")
	if err != nil {
		t.Fatalf("HashPassword: %v", err)
	}
	if a == b {
		t.Error("two hashes of the same password are identical; salting is broken")
	}
	if !VerifyPassword(a, "samepass1") || !VerifyPassword(b, "samepass1") {
		t.Error("both salted hashes must verify")
	}
}

func TestIssueAndParseAccessToken(t *testing.T) {
	m := NewManager(testJWTConfig())
	user := testUser(models.RoleRetailer)
	retailerID := uuid.New()

	token, expiresAt, err := m.IssueAccessToken(user, &retailerID)
	if err != nil {
		t.Fatalf("IssueAccessToken: %v", err)
	}
	if !expiresAt.After(time.Now()) {
		t.Errorf("expiresAt %v is not in the future", expiresAt)
	}

	claims, err := m.ParseAccessToken(token)
	if err != nil {
		t.Fatalf("ParseAccessToken: %v", err)
	}
	if claims.UserID != user.ID {
		t.Errorf("UserID = %v, want %v", claims.UserID, user.ID)
	}
	if claims.Role != models.RoleRetailer {
		t.Errorf("Role = %v, want retailer", claims.Role)
	}
	if claims.RetailerID == nil || *claims.RetailerID != retailerID {
		t.Errorf("RetailerID = %v, want %v", claims.RetailerID, retailerID)
	}
	if claims.Email != user.Email {
		t.Errorf("Email = %q, want %q", claims.Email, user.Email)
	}
}

func TestParseAccessToken_RejectsForgedAndTampered(t *testing.T) {
	m := NewManager(testJWTConfig())
	token, _, err := m.IssueAccessToken(testUser(models.RoleAdmin), nil)
	if err != nil {
		t.Fatalf("IssueAccessToken: %v", err)
	}

	t.Run("garbage", func(t *testing.T) {
		if _, err := m.ParseAccessToken("not.a.token"); err == nil {
			t.Error("expected rejection")
		}
	})

	t.Run("empty", func(t *testing.T) {
		if _, err := m.ParseAccessToken(""); err == nil {
			t.Error("expected rejection")
		}
	})

	t.Run("tampered signature", func(t *testing.T) {
		parts := strings.Split(token, ".")
		if len(parts) != 3 {
			t.Fatalf("unexpected token shape")
		}
		forged := parts[0] + "." + parts[1] + ".AAAAinvalidsignatureAAAA"
		if _, err := m.ParseAccessToken(forged); err == nil {
			t.Error("expected rejection of a tampered signature")
		}
	})

	t.Run("signed with a different secret", func(t *testing.T) {
		other := NewManager(config.JWTConfig{
			Secret:         "a-completely-different-secret-key-value",
			AccessTokenTTL: time.Hour,
			Issuer:         "utilipay-api",
		})
		foreign, _, err := other.IssueAccessToken(testUser(models.RoleAdmin), nil)
		if err != nil {
			t.Fatalf("IssueAccessToken: %v", err)
		}
		if _, err := m.ParseAccessToken(foreign); err == nil {
			t.Error("a token signed with another secret must be rejected")
		}
	})

	t.Run("wrong issuer", func(t *testing.T) {
		other := NewManager(config.JWTConfig{
			Secret:         testJWTConfig().Secret,
			AccessTokenTTL: time.Hour,
			Issuer:         "some-other-service",
		})
		foreign, _, err := other.IssueAccessToken(testUser(models.RoleAdmin), nil)
		if err != nil {
			t.Fatalf("IssueAccessToken: %v", err)
		}
		// Same secret but a different issuer must not be accepted, otherwise a
		// token minted for another service would grant access here.
		if _, err := m.ParseAccessToken(foreign); err == nil {
			t.Error("a token from another issuer must be rejected")
		}
	})
}

// TestParseAccessToken_RejectsAlgNone guards against the classic JWT bypass
// where an attacker strips the signature and sets alg to "none".
func TestParseAccessToken_RejectsAlgNone(t *testing.T) {
	m := NewManager(testJWTConfig())

	claims := Claims{
		RegisteredClaims: jwt.RegisteredClaims{
			Issuer:    "utilipay-api",
			Subject:   uuid.NewString(),
			ExpiresAt: jwt.NewNumericDate(time.Now().Add(time.Hour)),
		},
		UserID: uuid.New(),
		Role:   models.RoleAdmin,
	}

	unsigned, err := jwt.NewWithClaims(jwt.SigningMethodNone, claims).
		SignedString(jwt.UnsafeAllowNoneSignatureType)
	if err != nil {
		t.Fatalf("build alg=none token: %v", err)
	}

	if _, err := m.ParseAccessToken(unsigned); err == nil {
		t.Fatal("an alg=none token was accepted; this is a full authentication bypass")
	}
}

func TestParseAccessToken_ExpiredIsDistinguishable(t *testing.T) {
	// The middleware shows a different message for an expired session than for an
	// invalid one, so the error must be distinguishable.
	cfg := testJWTConfig()
	cfg.AccessTokenTTL = -time.Minute
	m := NewManager(cfg)

	token, _, err := m.IssueAccessToken(testUser(models.RoleAdmin), nil)
	if err != nil {
		t.Fatalf("IssueAccessToken: %v", err)
	}

	_, err = m.ParseAccessToken(token)
	if !errors.Is(err, ErrTokenExpired) {
		t.Fatalf("error = %v, want ErrTokenExpired", err)
	}
}

func TestParseAccessToken_RejectsUnknownRole(t *testing.T) {
	m := NewManager(testJWTConfig())
	user := testUser("superuser") // not a valid role

	token, _, err := m.IssueAccessToken(user, nil)
	if err != nil {
		t.Fatalf("IssueAccessToken: %v", err)
	}
	// A token carrying a role the system does not recognise must not authenticate,
	// since role checks downstream would not match any known policy.
	if _, err := m.ParseAccessToken(token); err == nil {
		t.Fatal("a token with an unknown role was accepted")
	}
}

func TestGenerateRefreshToken(t *testing.T) {
	plain, hash, err := GenerateRefreshToken()
	if err != nil {
		t.Fatalf("GenerateRefreshToken: %v", err)
	}
	if plain == "" || hash == "" {
		t.Fatal("token or hash is empty")
	}
	// Only the hash is persisted, so it must not be reversible to the plaintext.
	if strings.Contains(hash, plain) {
		t.Error("hash contains the plaintext token")
	}
	if got := HashToken(plain); got != hash {
		t.Error("HashToken does not reproduce the stored hash")
	}
	if len(hash) != 64 {
		t.Errorf("hash length = %d, want 64 hex chars for SHA-256", len(hash))
	}

	// Tokens must be unique across calls.
	seen := map[string]bool{plain: true}
	for i := 0; i < 200; i++ {
		p, _, err := GenerateRefreshToken()
		if err != nil {
			t.Fatalf("GenerateRefreshToken #%d: %v", i, err)
		}
		if seen[p] {
			t.Fatalf("refresh token collision at iteration %d", i)
		}
		seen[p] = true
	}
}

func TestGenerateAPIKey(t *testing.T) {
	plain, prefix, hash, err := GenerateAPIKey()
	if err != nil {
		t.Fatalf("GenerateAPIKey: %v", err)
	}
	if !strings.HasPrefix(plain, "up_live_") {
		t.Errorf("key = %q, want the up_live_ prefix", plain)
	}
	if !strings.HasPrefix(plain, prefix) {
		t.Errorf("prefix %q is not a prefix of the key", prefix)
	}
	// The stored prefix is shown in the UI, so it must be too short to be useful
	// on its own.
	if len(prefix) >= len(plain) {
		t.Error("stored prefix reveals the whole key")
	}
	if got := HashToken(plain); got != hash {
		t.Error("HashToken does not reproduce the stored hash")
	}
}

func TestNormalizeEmail(t *testing.T) {
	// Normalisation must match the database's lower(email) unique index,
	// otherwise two accounts could exist for the same address.
	for in, want := range map[string]string{
		"Test@Example.COM":     "test@example.com",
		"  spaced@mail.com  ":  "spaced@mail.com",
		"already@lower.com":    "already@lower.com",
		"JAGBIR2308@GMAIL.COM": "jagbir2308@gmail.com",
	} {
		if got := NormalizeEmail(in); got != want {
			t.Errorf("NormalizeEmail(%q) = %q, want %q", in, got, want)
		}
	}
}

func TestLockoutPolicy(t *testing.T) {
	p := DefaultLockoutPolicy()

	if p.MaxAttempts != 5 {
		t.Errorf("MaxAttempts = %d, want 5", p.MaxAttempts)
	}
	if p.LockFor != 15*time.Minute {
		t.Errorf("LockFor = %v, want 15m", p.LockFor)
	}

	for attempts, wantLock := range map[int]bool{
		0: false, 1: false, 4: false, 5: true, 6: true, 99: true,
	} {
		if got := p.ShouldLock(attempts); got != wantLock {
			t.Errorf("ShouldLock(%d) = %v, want %v", attempts, got, wantLock)
		}
	}
}

func TestUserCanLogin(t *testing.T) {
	future := time.Now().Add(time.Hour)
	past := time.Now().Add(-time.Hour)

	cases := []struct {
		name  string
		user  models.User
		allow bool
	}{
		{"active", models.User{Status: models.AccountActive}, true},
		{"inactive", models.User{Status: models.AccountInactive}, false},
		{"suspended", models.User{Status: models.AccountSuspended}, false},
		{"locked", models.User{Status: models.AccountActive, LockedUntil: &future}, false},
		// An elapsed lock must stop blocking, otherwise a lockout is permanent.
		{"lock expired", models.User{Status: models.AccountActive, LockedUntil: &past}, true},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			if got := tc.user.CanLogin(); got != tc.allow {
				t.Errorf("CanLogin() = %v, want %v", got, tc.allow)
			}
		})
	}
}

func TestRoleValid(t *testing.T) {
	if !models.RoleAdmin.Valid() || !models.RoleRetailer.Valid() {
		t.Error("admin and retailer must be valid roles")
	}
	for _, r := range []models.Role{"", "superuser", "Admin", "ADMIN"} {
		if r.Valid() {
			t.Errorf("role %q should be invalid", r)
		}
	}
}
