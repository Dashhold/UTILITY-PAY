package cryptoenv

import (
	"crypto/rand"
	"crypto/rsa"
	"crypto/sha1"
	"crypto/sha256"
	"crypto/x509"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"math/big"
	"strings"
	"testing"
)

// docPublicKey is the exact public key supplied in bharat_connect/encryption.md.
// Parsing it here guards against a regression in key handling for the real
// provider key, not just synthetic test keys.
const docPublicKey = "MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAlHpOvQI7LvtOmK5jRfqvoUbJtlVVIbez31E0G7tNrCpOtwsV08yc1GYBqG4zSicvsMHUiCkvdeB4Eo0pXEcV5Gw7swMXUT/LkAQVm0L8JYpUVkZmAORVDpHCVX1kJP9mAaRVtkt6BItZQXcUBO7ykNJOY2hItZfVzyapXn7WfB+BV7Bbu+MiJKGJM3VYKHsokAFi36g3dSlVG2NCKD+q4wzhCZGygkYlAkmcBarbizYbATu2kkqWz1oCqClwIxwRUNh5chVu/vbyvgTcGYfA0IehcJePcX6+NVtAFsuifvdscnG93inJXpeJnbUEqcGMzdvsVwSit7eDZKoUW8WuOwIDAQAB"

func TestParsePublicKey_ProviderSuppliedKey(t *testing.T) {
	pub, err := ParsePublicKey(docPublicKey)
	if err != nil {
		t.Fatalf("ParsePublicKey on documented key: %v", err)
	}
	if got, want := pub.Size()*8, 2048; got != want {
		t.Errorf("modulus size = %d bits, want %d", got, want)
	}
	if pub.E != 65537 {
		t.Errorf("exponent = %d, want 65537", pub.E)
	}
}

func TestParsePublicKey_AcceptsPEMAndWhitespace(t *testing.T) {
	pem := "-----BEGIN PUBLIC KEY-----\n" +
		docPublicKey[:64] + "\n" +
		docPublicKey[64:128] + "\n" +
		docPublicKey[128:] + "\n" +
		"-----END PUBLIC KEY-----\n"

	pub, err := ParsePublicKey(pem)
	if err != nil {
		t.Fatalf("ParsePublicKey on PEM: %v", err)
	}
	bare, err := ParsePublicKey(docPublicKey)
	if err != nil {
		t.Fatalf("ParsePublicKey on bare base64: %v", err)
	}
	if pub.N.Cmp(bare.N) != 0 {
		t.Error("PEM and bare base64 parsed to different moduli")
	}
}

func TestParsePublicKey_Rejects(t *testing.T) {
	for name, in := range map[string]string{
		"empty":          "",
		"not base64":     "!!!not-base64!!!",
		"base64 garbage": base64.StdEncoding.EncodeToString([]byte("nowhere near a DER key")),
	} {
		t.Run(name, func(t *testing.T) {
			if _, err := ParsePublicKey(in); err == nil {
				t.Fatal("expected error, got nil")
			}
		})
	}
}

// sealAndUnwrap performs a full round trip: seal with the public key, unwrap the
// session key with the private key, then decrypt the payload. This proves the
// envelope a provider receives is actually decryptable.
func sealAndUnwrap(t *testing.T, suite Suite, payload []byte) []byte {
	t.Helper()

	priv, err := rsa.GenerateKey(rand.Reader, 2048)
	if err != nil {
		t.Fatalf("generate key: %v", err)
	}
	der, err := x509.MarshalPKIXPublicKey(&priv.PublicKey)
	if err != nil {
		t.Fatalf("marshal public key: %v", err)
	}

	sealer, err := NewSealer(base64.StdEncoding.EncodeToString(der), "1.0", suite)
	if err != nil {
		t.Fatalf("NewSealer: %v", err)
	}

	trace, err := sealer.Seal(payload)
	if err != nil {
		t.Fatalf("Seal: %v", err)
	}

	// Envelope must be fully populated.
	if trace.Envelope.EncryptedSessionKey == "" {
		t.Error("encryptedSessionKey is empty")
	}
	if trace.Envelope.EncryptedPayload == "" {
		t.Error("encryptedPayload is empty")
	}
	if trace.Envelope.IV == "" {
		t.Error("iv is empty")
	}
	if trace.Envelope.KeyVersion != "1.0" {
		t.Errorf("keyVersion = %q, want %q", trace.Envelope.KeyVersion, "1.0")
	}

	// Ciphertext must not leak plaintext.
	if strings.Contains(trace.Envelope.EncryptedPayload, base64.StdEncoding.EncodeToString(payload)) {
		t.Error("encrypted payload contains the plaintext verbatim")
	}

	// Unwrap the session key as the provider would.
	wrapped, err := base64.StdEncoding.DecodeString(trace.Envelope.EncryptedSessionKey)
	if err != nil {
		t.Fatalf("decode wrapped key: %v", err)
	}

	var sessionKey []byte
	switch suite.RSAPadding {
	case RSAPaddingPKCS1v15:
		sessionKey, err = rsa.DecryptPKCS1v15(rand.Reader, priv, wrapped)
	case RSAPaddingOAEPSHA1:
		sessionKey, err = rsa.DecryptOAEP(sha1.New(), rand.Reader, priv, wrapped, nil)
	case RSAPaddingOAEPSHA256:
		sessionKey, err = rsa.DecryptOAEP(sha256.New(), rand.Reader, priv, wrapped, nil)
	default:
		t.Fatalf("unhandled padding %q", suite.RSAPadding)
	}
	if err != nil {
		t.Fatalf("unwrap session key: %v", err)
	}
	if len(sessionKey) != sessionKeyBytes {
		t.Fatalf("session key length = %d, want %d", len(sessionKey), sessionKeyBytes)
	}

	// The trace must expose the same key, since UAT logging depends on it.
	if got := base64.StdEncoding.EncodeToString(sessionKey); got != trace.SessionKeyBase64 {
		t.Error("trace.SessionKeyBase64 does not match the unwrapped session key")
	}

	plaintext, err := sealer.Open(trace.SessionKeyBase64, trace.Envelope.EncryptedPayload, trace.Envelope.IV)
	if err != nil {
		t.Fatalf("Open: %v", err)
	}
	return plaintext
}

func TestSeal_RoundTripAllSuites(t *testing.T) {
	payload, err := json.Marshal(map[string]any{
		"agentId":        "AG12345",
		"billerId":       "MAHA00000MAH01",
		"customerParams": map[string]string{"Consumer Number": "1234567890"},
		"amount":         125050,
	})
	if err != nil {
		t.Fatalf("marshal payload: %v", err)
	}

	// Both GCM IV lengths are covered: the specification prose mandates 16 bytes
	// while its own sample requests carry 12, so both must round-trip.
	suites := []Suite{
		{AESMode: AESModeCBC, RSAPadding: RSAPaddingPKCS1v15},
		{AESMode: AESModeCBC, RSAPadding: RSAPaddingOAEPSHA1},
		{AESMode: AESModeCBC, RSAPadding: RSAPaddingOAEPSHA256},
		{AESMode: AESModeGCM, RSAPadding: RSAPaddingPKCS1v15, GCMIVSize: GCMIVSizeStandard},
		{AESMode: AESModeGCM, RSAPadding: RSAPaddingPKCS1v15, GCMIVSize: GCMIVSizeSpec},
		{AESMode: AESModeGCM, RSAPadding: RSAPaddingOAEPSHA1, GCMIVSize: GCMIVSizeStandard},
		{AESMode: AESModeGCM, RSAPadding: RSAPaddingOAEPSHA256, GCMIVSize: GCMIVSizeSpec},
	}

	for _, suite := range suites {
		name := string(suite.AESMode) + "+" + string(suite.RSAPadding)
		if suite.AESMode == AESModeGCM {
			name += fmt.Sprintf("+iv%d", suite.ivSize())
		}
		t.Run(name, func(t *testing.T) {
			got := sealAndUnwrap(t, suite, payload)
			if string(got) != string(payload) {
				t.Errorf("round trip mismatch:\n got: %s\nwant: %s", got, payload)
			}
		})
	}
}

// TestSeal_GCMIVLengthMatchesSuite pins the emitted IV length, because the
// provider's server derives the GCM nonce length from what we send and a silent
// change here would break every encrypted call.
func TestSeal_GCMIVLengthMatchesSuite(t *testing.T) {
	for _, size := range []int{GCMIVSizeStandard, GCMIVSizeSpec} {
		suite := Suite{AESMode: AESModeGCM, RSAPadding: RSAPaddingPKCS1v15, GCMIVSize: size}

		sealer, err := NewSealer(docPublicKey, "1.0", suite)
		if err != nil {
			t.Fatalf("NewSealer(iv=%d): %v", size, err)
		}
		trace, err := sealer.Seal([]byte(`{"memberId":"a@b.com"}`))
		if err != nil {
			t.Fatalf("Seal(iv=%d): %v", size, err)
		}

		raw, err := base64.StdEncoding.DecodeString(trace.Envelope.IV)
		if err != nil {
			t.Fatalf("decode iv: %v", err)
		}
		if len(raw) != size {
			t.Errorf("GCMIVSize=%d produced a %d-byte IV", size, len(raw))
		}
	}
}

// TestSeal_DefaultSuiteMatchesSpecification guards the documented cipher choice.
// A regression to CBC or to OAEP would be rejected by the provider outright.
func TestSeal_DefaultSuiteMatchesSpecification(t *testing.T) {
	s := DefaultSuite()

	if s.AESMode != AESModeGCM {
		t.Errorf("default AES mode = %q, want gcm per the specification", s.AESMode)
	}
	if s.RSAPadding != RSAPaddingPKCS1v15 {
		t.Errorf("default RSA padding = %q, want pkcs1v15 per the specification", s.RSAPadding)
	}
	if s.ivSize() != DefaultGCMIVSize {
		t.Errorf("default GCM IV size = %d, want %d", s.ivSize(), DefaultGCMIVSize)
	}
}

func TestSeal_ProducesFreshKeyAndIVPerCall(t *testing.T) {
	sealer, err := NewSealer(docPublicKey, "1.0", DefaultSuite())
	if err != nil {
		t.Fatalf("NewSealer: %v", err)
	}

	payload := []byte(`{"probe":true}`)
	const runs = 25

	keys := make(map[string]struct{}, runs)
	ivs := make(map[string]struct{}, runs)
	cts := make(map[string]struct{}, runs)

	for i := 0; i < runs; i++ {
		trace, err := sealer.Seal(payload)
		if err != nil {
			t.Fatalf("Seal #%d: %v", i, err)
		}
		keys[trace.SessionKeyBase64] = struct{}{}
		ivs[trace.Envelope.IV] = struct{}{}
		cts[trace.Envelope.EncryptedPayload] = struct{}{}
	}

	// Session key, IV and therefore ciphertext must never repeat: IV reuse under
	// a repeated key is a real confidentiality break, not a style issue.
	if len(keys) != runs {
		t.Errorf("session key reused: %d unique across %d calls", len(keys), runs)
	}
	if len(ivs) != runs {
		t.Errorf("IV reused: %d unique across %d calls", len(ivs), runs)
	}
	if len(cts) != runs {
		t.Errorf("ciphertext repeated: %d unique across %d calls", len(cts), runs)
	}
}

func TestSeal_EnvelopeMarshalsToRequiredFieldNames(t *testing.T) {
	sealer, err := NewSealer(docPublicKey, "1.0", DefaultSuite())
	if err != nil {
		t.Fatalf("NewSealer: %v", err)
	}
	trace, err := sealer.Seal([]byte(`{}`))
	if err != nil {
		t.Fatalf("Seal: %v", err)
	}

	raw, err := json.Marshal(trace.Envelope)
	if err != nil {
		t.Fatalf("marshal envelope: %v", err)
	}

	var decoded map[string]json.RawMessage
	if err := json.Unmarshal(raw, &decoded); err != nil {
		t.Fatalf("unmarshal envelope: %v", err)
	}

	// Field names are mandated verbatim by UAT_checklist.md.
	for _, field := range []string{"encryptedSessionKey", "encryptedPayload", "keyVersion", "iv"} {
		if _, ok := decoded[field]; !ok {
			t.Errorf("envelope JSON missing required field %q; got %s", field, raw)
		}
	}
	if len(decoded) != 4 {
		t.Errorf("envelope has %d fields, want exactly 4: %s", len(decoded), raw)
	}
}

func TestOpen_RejectsTamperedPayload(t *testing.T) {
	// GCM is authenticated, so tampering must be detected rather than silently
	// yielding garbage plaintext.
	priv, err := rsa.GenerateKey(rand.Reader, 2048)
	if err != nil {
		t.Fatalf("generate key: %v", err)
	}
	der, err := x509.MarshalPKIXPublicKey(&priv.PublicKey)
	if err != nil {
		t.Fatalf("marshal key: %v", err)
	}
	sealer, err := NewSealer(
		base64.StdEncoding.EncodeToString(der), "1.0",
		Suite{AESMode: AESModeGCM, RSAPadding: RSAPaddingPKCS1v15},
	)
	if err != nil {
		t.Fatalf("NewSealer: %v", err)
	}

	trace, err := sealer.Seal([]byte(`{"amount":100}`))
	if err != nil {
		t.Fatalf("Seal: %v", err)
	}

	ct, err := base64.StdEncoding.DecodeString(trace.Envelope.EncryptedPayload)
	if err != nil {
		t.Fatalf("decode ciphertext: %v", err)
	}
	ct[0] ^= 0xFF

	_, err = sealer.Open(trace.SessionKeyBase64, base64.StdEncoding.EncodeToString(ct), trace.Envelope.IV)
	if err == nil {
		t.Fatal("expected authentication failure on tampered ciphertext, got nil")
	}
}

func TestPKCS7_RoundTripAndRejection(t *testing.T) {
	const blockSize = 16

	// Length 16 must gain a full padding block; 0 must produce exactly one.
	for _, n := range []int{0, 1, 15, 16, 17, 31, 32, 100} {
		in := make([]byte, n)
		for i := range in {
			in[i] = byte(i)
		}
		padded := pkcs7Pad(in, blockSize)
		if len(padded)%blockSize != 0 {
			t.Fatalf("n=%d: padded length %d not block aligned", n, len(padded))
		}
		if len(padded) <= n {
			t.Fatalf("n=%d: padding did not grow input", n)
		}
		out, err := pkcs7Unpad(padded, blockSize)
		if err != nil {
			t.Fatalf("n=%d: unpad: %v", n, err)
		}
		if string(out) != string(in) {
			t.Fatalf("n=%d: round trip mismatch", n)
		}
	}

	bad := map[string][]byte{
		"empty":                 {},
		"not aligned":           make([]byte, 5),
		"zero pad byte":         append(make([]byte, blockSize-1), 0x00),
		"pad longer than block": append(make([]byte, blockSize-1), 0x20),
	}
	for name, in := range bad {
		if _, err := pkcs7Unpad(in, blockSize); err == nil {
			t.Errorf("%s: expected error, got nil", name)
		}
	}

	// Inconsistent padding bytes must be rejected.
	inconsistent := make([]byte, blockSize)
	inconsistent[blockSize-1] = 0x03
	inconsistent[blockSize-2] = 0x03
	inconsistent[blockSize-3] = 0x01 // should be 0x03
	if _, err := pkcs7Unpad(inconsistent, blockSize); err == nil {
		t.Error("inconsistent padding: expected error, got nil")
	}
}

func TestParseSuite(t *testing.T) {
	t.Run("defaults on empty", func(t *testing.T) {
		got, err := ParseSuite("", "", 0)
		if err != nil {
			t.Fatalf("ParseSuite: %v", err)
		}
		if got != DefaultSuite() {
			t.Errorf("got %+v, want %+v", got, DefaultSuite())
		}
	})

	t.Run("case insensitive", func(t *testing.T) {
		got, err := ParseSuite("GCM", "OAEP-SHA256", 0)
		if err != nil {
			t.Fatalf("ParseSuite: %v", err)
		}
		want := Suite{
			AESMode:    AESModeGCM,
			RSAPadding: RSAPaddingOAEPSHA256,
			GCMIVSize:  DefaultGCMIVSize,
		}
		if got != want {
			t.Errorf("got %+v, want %+v", got, want)
		}
	})

	t.Run("accepts explicit GCM IV size", func(t *testing.T) {
		got, err := ParseSuite("gcm", "pkcs1v15", GCMIVSizeSpec)
		if err != nil {
			t.Fatalf("ParseSuite: %v", err)
		}
		if got.ivSize() != GCMIVSizeSpec {
			t.Errorf("ivSize = %d, want %d", got.ivSize(), GCMIVSizeSpec)
		}
	})

	t.Run("rejects unknown", func(t *testing.T) {
		if _, err := ParseSuite("rot13", "", 0); err == nil {
			t.Error("expected error for unknown AES mode")
		}
		if _, err := ParseSuite("", "magic", 0); err == nil {
			t.Error("expected error for unknown RSA padding")
		}
	})

	t.Run("rejects out-of-range GCM IV size", func(t *testing.T) {
		// A zero-length IV is invalid for GCM and an oversized one signals a
		// misconfiguration, so both are refused at startup.
		for _, size := range []int{-1, 17, 32} {
			if _, err := ParseSuite("gcm", "", size); err == nil {
				t.Errorf("GCM IV size %d should be rejected", size)
			}
		}
	})
}

func TestNewSealer_Validation(t *testing.T) {
	if _, err := NewSealer("", "1.0", DefaultSuite()); err == nil {
		t.Error("empty public key: expected error")
	}
	if _, err := NewSealer(docPublicKey, "", DefaultSuite()); err == nil {
		t.Error("empty key version: expected error")
	}

	// A 512-bit modulus cannot wrap a 32-byte session key under OAEP-SHA256
	// (64 - 2*32 - 2 < 0) and must be rejected at construction time rather than
	// failing on the first live request.
	//
	// The modulus is assembled directly: Go's rsa.GenerateKey refuses to emit
	// keys this small, and checkKeyCapacity only inspects the modulus size.
	smallPub := &rsa.PublicKey{
		N: new(big.Int).Lsh(big.NewInt(1), 511),
		E: 65537,
	}
	der, err := x509.MarshalPKIXPublicKey(smallPub)
	if err != nil {
		t.Fatalf("marshal undersized key: %v", err)
	}
	encoded := base64.StdEncoding.EncodeToString(der)

	if _, err := NewSealer(encoded, "1.0", Suite{AESMode: AESModeCBC, RSAPadding: RSAPaddingOAEPSHA256}); err == nil {
		t.Error("undersized RSA key with OAEP-SHA256: expected error, got nil")
	}

	// The same modulus has just enough room under PKCS#1 v1.5 (64 - 11 = 53),
	// which confirms the capacity check is padding-aware rather than a blanket
	// size floor.
	if _, err := NewSealer(encoded, "1.0", Suite{AESMode: AESModeCBC, RSAPadding: RSAPaddingPKCS1v15}); err != nil {
		t.Errorf("512-bit key with PKCS#1 v1.5 should satisfy the capacity check: %v", err)
	}
}
