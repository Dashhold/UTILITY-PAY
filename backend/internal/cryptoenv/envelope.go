// Package cryptoenv implements the hybrid RSA + AES request envelope required
// by the Bharat Connect (MobiKwik) integration.
//
// The envelope shape is mandated by bharat_connect/UAT_checklist.md:
//
//	{
//	  "encryptedSessionKey": "...",
//	  "encryptedPayload":    "...",
//	  "keyVersion":          "1.0",
//	  "iv":                  "..."
//	}
//
// Scheme:
//  1. A fresh random AES-256 session key is generated per request.
//  2. That session key is wrapped with the provider's RSA public key
//     (bharat_connect/encryption.md supplies public_key_base64 + key_version).
//  3. The JSON payload is encrypted with the session key under a fresh random IV.
//  4. All binary fields are base64 (standard, padded) encoded.
//
// # Cipher suite
//
// The provider specification (section "1. Steps for Encryption") mandates:
//
//	Session key algorithm   AES-256-GCM
//	Session key size        256 bits (32 bytes)
//	GCM tag size            128 bits
//	RSA key size            2048 bits
//	RSA padding             PKCS1Padding  (RSA/ECB/PKCS1Padding)
//	Encoding                Base64
//
// DefaultSuite implements exactly that. The suite remains configurable because
// the specification is self-contradictory on IV length; see DefaultGCMIVSize.
//
// Responses from this provider are returned as plaintext JSON rather than an
// envelope, so Open is used only for symmetric round-trip verification and for
// any future endpoint that does encrypt its response.
package cryptoenv

import (
	"crypto/aes"
	"crypto/cipher"
	"crypto/rand"
	"crypto/rsa"
	"crypto/sha1"
	"crypto/sha256"
	"crypto/x509"
	"encoding/base64"
	"errors"
	"fmt"
	"hash"
	"io"
	"strings"
)

// AESMode selects the symmetric cipher mode used for the payload.
type AESMode string

const (
	// AESModeCBC is AES-256-CBC with PKCS#7 padding and a 16-byte IV.
	AESModeCBC AESMode = "cbc"
	// AESModeGCM is AES-256-GCM; the 16-byte (128-bit) auth tag is appended to
	// the ciphertext before encoding. The IV length is configurable via
	// Suite.GCMIVSize because the provider specification is inconsistent about
	// it; see DefaultGCMIVSize.
	AESModeGCM AESMode = "gcm"
)

// RSAPadding selects the asymmetric padding used to wrap the session key.
type RSAPadding string

const (
	// RSAPaddingPKCS1v15 is RSA/ECB/PKCS1Padding.
	RSAPaddingPKCS1v15 RSAPadding = "pkcs1v15"
	// RSAPaddingOAEPSHA1 is RSA/ECB/OAEPWithSHA-1AndMGF1Padding.
	RSAPaddingOAEPSHA1 RSAPadding = "oaep-sha1"
	// RSAPaddingOAEPSHA256 is RSA/ECB/OAEPWithSHA-256AndMGF1Padding.
	RSAPaddingOAEPSHA256 RSAPadding = "oaep-sha256"
)

const (
	sessionKeyBytes = 32 // AES-256
	cbcIVBytes      = 16

	// DefaultGCMIVSize is the IV length used for AES-GCM.
	//
	// The provider specification contradicts itself here. Its prose, its
	// parameter table and its Java sample all state a 16-byte IV
	// (`byte[] iv = new byte[16]`), but every captured sample request in the
	// same document carries a 12-byte IV: "D1KIVJlHivVSImIb", "6cCRbQ0el6JGHXMy",
	// "BtIKfTiogiFytzfL" and "TsN9z/2deTUE32Aa" are each 16 base64 characters,
	// which decode to 12 bytes.
	//
	// 12 is CONFIRMED CORRECT by a live call against the provider's UAT
	// environment: a Balance Check sent with a 12-byte IV was decrypted and
	// answered with {"success":true,"data":{"balance":...}}. The specification's
	// prose and Java sample stating 16 bytes are therefore wrong, and its own
	// captured samples were right.
	//
	// Java's GCMParameterSpec accepts any IV length, which is why a server built
	// from that sample reads whichever length the client sends. Go's cipher.NewGCM
	// is fixed at 12, so NewGCMWithNonceSize is used to keep this configurable.
	// Override with BC_GCM_IV_SIZE only if the provider changes the requirement.
	DefaultGCMIVSize = GCMIVSizeStandard

	// GCMIVSizeStandard is the 12-byte nonce that GCM specifies and that every
	// sample request in the provider documentation actually carries.
	GCMIVSizeStandard = 12

	// GCMIVSizeSpec is the 16-byte IV stated in the provider documentation's prose,
	// parameter table and Java reference code.
	GCMIVSizeSpec = 16
)

// Suite describes the concrete cipher choices.
type Suite struct {
	AESMode    AESMode
	RSAPadding RSAPadding
	// GCMIVSize is the IV length in bytes for AES-GCM. Zero means
	// DefaultGCMIVSize.
	GCMIVSize int
}

// IVSize returns the effective GCM IV length in bytes, resolving the zero value
// to DefaultGCMIVSize.
//
// Exported so startup logging can report the IV length actually in force rather
// than the compiled-in default, which would otherwise misreport an override.
func (s Suite) IVSize() int {
	if s.GCMIVSize <= 0 {
		return DefaultGCMIVSize
	}
	return s.GCMIVSize
}

// ivSize is the internal alias used by the encryption paths.
func (s Suite) ivSize() int { return s.IVSize() }

// DefaultSuite is the cipher suite mandated by the provider specification:
// AES-256-GCM for the payload and RSA-2048 with PKCS#1 v1.5 for the key wrap.
//
// Source: "Recharge & Bill Payment API Documentation", section
// "1. Steps for Encryption".
func DefaultSuite() Suite {
	return Suite{
		AESMode:    AESModeGCM,
		RSAPadding: RSAPaddingPKCS1v15,
		GCMIVSize:  DefaultGCMIVSize,
	}
}

// ParseSuite builds a Suite from free-form configuration strings, falling back
// to DefaultSuite for empty or unrecognised values.
func ParseSuite(aesMode, rsaPadding string, gcmIVSize int) (Suite, error) {
	s := DefaultSuite()

	switch strings.ToLower(strings.TrimSpace(aesMode)) {
	case "":
		// keep default
	case string(AESModeCBC):
		s.AESMode = AESModeCBC
	case string(AESModeGCM):
		s.AESMode = AESModeGCM
	default:
		return Suite{}, fmt.Errorf("cryptoenv: unsupported AES mode %q (want cbc or gcm)", aesMode)
	}

	switch strings.ToLower(strings.TrimSpace(rsaPadding)) {
	case "":
		// keep default
	case string(RSAPaddingPKCS1v15):
		s.RSAPadding = RSAPaddingPKCS1v15
	case string(RSAPaddingOAEPSHA1):
		s.RSAPadding = RSAPaddingOAEPSHA1
	case string(RSAPaddingOAEPSHA256):
		s.RSAPadding = RSAPaddingOAEPSHA256
	default:
		return Suite{}, fmt.Errorf("cryptoenv: unsupported RSA padding %q", rsaPadding)
	}

	if gcmIVSize != 0 {
		// GCM requires a non-empty IV. Anything beyond 16 bytes gains nothing and
		// suggests a misconfiguration.
		if gcmIVSize < 1 || gcmIVSize > 16 {
			return Suite{}, fmt.Errorf("cryptoenv: GCM IV size %d out of range (want 1-16)", gcmIVSize)
		}
		s.GCMIVSize = gcmIVSize
	}

	return s, nil
}

// Envelope is the wire representation sent to the provider.
type Envelope struct {
	EncryptedSessionKey string `json:"encryptedSessionKey"`
	EncryptedPayload    string `json:"encryptedPayload"`
	KeyVersion          string `json:"keyVersion"`
	IV                  string `json:"iv"`
}

// Trace carries the plaintext alongside the envelope.
//
// UAT_checklist.md requires every logged request to show BOTH the encrypted and
// the decrypted value of encryptedSessionKey and encryptedPayload. Returning
// the plaintext here lets the audit logger satisfy that requirement without
// re-deriving anything, and without the rest of the codebase having to hold
// raw key material.
type Trace struct {
	Envelope Envelope
	// PlaintextPayload is the pre-encryption JSON body.
	PlaintextPayload []byte
	// SessionKeyBase64 is the unwrapped AES session key, base64 encoded. This
	// is sensitive: log it only into the UAT audit sink, never into general
	// application logs.
	SessionKeyBase64 string
}

// Sealer wraps payloads into provider envelopes.
type Sealer struct {
	pub        *rsa.PublicKey
	keyVersion string
	suite      Suite
}

// NewSealer parses a base64-encoded RSA public key and returns a Sealer.
//
// It accepts either a bare base64 DER blob (as supplied in encryption.md) or a
// full PEM block, and tolerates embedded whitespace/newlines.
func NewSealer(publicKeyBase64, keyVersion string, suite Suite) (*Sealer, error) {
	if strings.TrimSpace(publicKeyBase64) == "" {
		return nil, errors.New("cryptoenv: public key is empty")
	}
	if strings.TrimSpace(keyVersion) == "" {
		return nil, errors.New("cryptoenv: key version is empty")
	}

	pub, err := ParsePublicKey(publicKeyBase64)
	if err != nil {
		return nil, err
	}

	// A 2048-bit modulus must be able to wrap a 32-byte key under the chosen
	// padding. Catch an undersized key at construction rather than per-request.
	if err := checkKeyCapacity(pub, suite.RSAPadding); err != nil {
		return nil, err
	}

	return &Sealer{pub: pub, keyVersion: keyVersion, suite: suite}, nil
}

// KeyVersion returns the configured key version.
func (s *Sealer) KeyVersion() string { return s.keyVersion }

// Suite returns the active cipher suite.
func (s *Sealer) Suite() Suite { return s.suite }

// Seal encrypts payload and returns the envelope plus its plaintext trace.
func (s *Sealer) Seal(payload []byte) (*Trace, error) {
	sessionKey := make([]byte, sessionKeyBytes)
	if _, err := io.ReadFull(rand.Reader, sessionKey); err != nil {
		return nil, fmt.Errorf("cryptoenv: generate session key: %w", err)
	}

	ciphertext, iv, err := s.encryptPayload(sessionKey, payload)
	if err != nil {
		return nil, err
	}

	wrappedKey, err := s.wrapSessionKey(sessionKey)
	if err != nil {
		return nil, err
	}

	return &Trace{
		Envelope: Envelope{
			EncryptedSessionKey: base64.StdEncoding.EncodeToString(wrappedKey),
			EncryptedPayload:    base64.StdEncoding.EncodeToString(ciphertext),
			KeyVersion:          s.keyVersion,
			IV:                  base64.StdEncoding.EncodeToString(iv),
		},
		PlaintextPayload: payload,
		SessionKeyBase64: base64.StdEncoding.EncodeToString(sessionKey),
	}, nil
}

// Open decrypts a provider response that was encrypted with a session key we
// originally generated. Responses in this scheme are symmetric-only: the
// provider reuses our session key, so no private key is involved.
func (s *Sealer) Open(sessionKeyBase64, encryptedPayloadBase64, ivBase64 string) ([]byte, error) {
	sessionKey, err := base64.StdEncoding.DecodeString(sessionKeyBase64)
	if err != nil {
		return nil, fmt.Errorf("cryptoenv: decode session key: %w", err)
	}
	ciphertext, err := base64.StdEncoding.DecodeString(encryptedPayloadBase64)
	if err != nil {
		return nil, fmt.Errorf("cryptoenv: decode payload: %w", err)
	}
	iv, err := base64.StdEncoding.DecodeString(ivBase64)
	if err != nil {
		return nil, fmt.Errorf("cryptoenv: decode iv: %w", err)
	}
	return s.decryptPayload(sessionKey, ciphertext, iv)
}

func (s *Sealer) encryptPayload(key, plaintext []byte) (ciphertext, iv []byte, err error) {
	block, err := aes.NewCipher(key)
	if err != nil {
		return nil, nil, fmt.Errorf("cryptoenv: new aes cipher: %w", err)
	}

	switch s.suite.AESMode {
	case AESModeGCM:
		ivLen := s.suite.ivSize()
		nonce := make([]byte, ivLen)
		if _, err := io.ReadFull(rand.Reader, nonce); err != nil {
			return nil, nil, fmt.Errorf("cryptoenv: generate nonce: %w", err)
		}
		// NewGCMWithNonceSize is required rather than NewGCM: the latter is fixed
		// at 12 bytes, and the provider's specification allows a 16-byte IV.
		aead, err := cipher.NewGCMWithNonceSize(block, ivLen)
		if err != nil {
			return nil, nil, fmt.Errorf("cryptoenv: new gcm with %d-byte iv: %w", ivLen, err)
		}
		// Seal appends the 128-bit auth tag to the ciphertext, which is what the
		// provider's GCMParameterSpec(128, iv) expects.
		return aead.Seal(nil, nonce, plaintext, nil), nonce, nil

	case AESModeCBC:
		ivBuf := make([]byte, cbcIVBytes)
		if _, err := io.ReadFull(rand.Reader, ivBuf); err != nil {
			return nil, nil, fmt.Errorf("cryptoenv: generate iv: %w", err)
		}
		padded := pkcs7Pad(plaintext, block.BlockSize())
		out := make([]byte, len(padded))
		cipher.NewCBCEncrypter(block, ivBuf).CryptBlocks(out, padded)
		return out, ivBuf, nil

	default:
		return nil, nil, fmt.Errorf("cryptoenv: unsupported AES mode %q", s.suite.AESMode)
	}
}

func (s *Sealer) decryptPayload(key, ciphertext, iv []byte) ([]byte, error) {
	block, err := aes.NewCipher(key)
	if err != nil {
		return nil, fmt.Errorf("cryptoenv: new aes cipher: %w", err)
	}

	switch s.suite.AESMode {
	case AESModeGCM:
		if len(iv) == 0 {
			return nil, errors.New("cryptoenv: gcm iv is empty")
		}
		// The IV length is taken from the message rather than the configured
		// suite, so a response encrypted with a different IV length than we send
		// still decrypts.
		aead, err := cipher.NewGCMWithNonceSize(block, len(iv))
		if err != nil {
			return nil, fmt.Errorf("cryptoenv: new gcm with %d-byte iv: %w", len(iv), err)
		}
		plaintext, err := aead.Open(nil, iv, ciphertext, nil)
		if err != nil {
			return nil, fmt.Errorf("cryptoenv: gcm open: %w", err)
		}
		return plaintext, nil

	case AESModeCBC:
		if len(iv) != block.BlockSize() {
			return nil, fmt.Errorf("cryptoenv: iv length %d, want %d", len(iv), block.BlockSize())
		}
		if len(ciphertext) == 0 || len(ciphertext)%block.BlockSize() != 0 {
			return nil, errors.New("cryptoenv: ciphertext is not a whole number of blocks")
		}
		out := make([]byte, len(ciphertext))
		cipher.NewCBCDecrypter(block, iv).CryptBlocks(out, ciphertext)
		return pkcs7Unpad(out, block.BlockSize())

	default:
		return nil, fmt.Errorf("cryptoenv: unsupported AES mode %q", s.suite.AESMode)
	}
}

func (s *Sealer) wrapSessionKey(sessionKey []byte) ([]byte, error) {
	switch s.suite.RSAPadding {
	case RSAPaddingPKCS1v15:
		return rsa.EncryptPKCS1v15(rand.Reader, s.pub, sessionKey)
	case RSAPaddingOAEPSHA1:
		return rsa.EncryptOAEP(sha1.New(), rand.Reader, s.pub, sessionKey, nil)
	case RSAPaddingOAEPSHA256:
		return rsa.EncryptOAEP(sha256.New(), rand.Reader, s.pub, sessionKey, nil)
	default:
		return nil, fmt.Errorf("cryptoenv: unsupported RSA padding %q", s.suite.RSAPadding)
	}
}

// EncryptWithSessionKey encrypts plaintext under an existing base64 session key
// and returns the base64 ciphertext and IV.
//
// This is the counterpart to Open: it exists for encrypting a response under the
// session key the peer already holds, and for constructing fixtures in tests.
// The RSA key wrap is not involved because no new session key is created.
func EncryptWithSessionKey(s *Sealer, sessionKeyBase64 string, plaintext []byte) (ciphertextBase64, ivBase64 string, err error) {
	key, err := base64.StdEncoding.DecodeString(sessionKeyBase64)
	if err != nil {
		return "", "", fmt.Errorf("cryptoenv: decode session key: %w", err)
	}
	if len(key) != sessionKeyBytes {
		return "", "", fmt.Errorf("cryptoenv: session key is %d bytes, want %d", len(key), sessionKeyBytes)
	}

	ciphertext, iv, err := s.encryptPayload(key, plaintext)
	if err != nil {
		return "", "", err
	}
	return base64.StdEncoding.EncodeToString(ciphertext),
		base64.StdEncoding.EncodeToString(iv),
		nil
}

// ParsePublicKey decodes an RSA public key from base64 DER or PEM.
func ParsePublicKey(encoded string) (*rsa.PublicKey, error) {
	cleaned := stripPEMArmour(encoded)

	der, err := base64.StdEncoding.DecodeString(cleaned)
	if err != nil {
		return nil, fmt.Errorf("cryptoenv: base64 decode public key: %w", err)
	}

	// Prefer SPKI (X.509 SubjectPublicKeyInfo), which is what a
	// "public_key_base64" blob from these providers normally is.
	if parsed, err := x509.ParsePKIXPublicKey(der); err == nil {
		rsaPub, ok := parsed.(*rsa.PublicKey)
		if !ok {
			return nil, fmt.Errorf("cryptoenv: public key is %T, want *rsa.PublicKey", parsed)
		}
		return rsaPub, nil
	}

	// Fall back to bare PKCS#1.
	if rsaPub, err := x509.ParsePKCS1PublicKey(der); err == nil {
		return rsaPub, nil
	}

	return nil, errors.New("cryptoenv: public key is neither valid PKIX/SPKI nor PKCS#1 DER")
}

// stripPEMArmour removes PEM headers/footers and all whitespace so that both
// PEM and bare-base64 inputs converge on the same representation.
func stripPEMArmour(in string) string {
	var b strings.Builder
	for _, line := range strings.Split(in, "\n") {
		trimmed := strings.TrimSpace(line)
		if trimmed == "" || strings.HasPrefix(trimmed, "-----") {
			continue
		}
		b.WriteString(trimmed)
	}
	out := b.String()
	// Handle single-line input that still contains inline whitespace or \r.
	out = strings.NewReplacer(" ", "", "\t", "", "\r", "").Replace(out)
	return out
}

// checkKeyCapacity verifies the modulus can wrap a 32-byte session key.
func checkKeyCapacity(pub *rsa.PublicKey, padding RSAPadding) error {
	k := pub.Size()

	var maxPlaintext int
	switch padding {
	case RSAPaddingPKCS1v15:
		maxPlaintext = k - 11
	case RSAPaddingOAEPSHA1:
		maxPlaintext = k - 2*sha1.Size - 2
	case RSAPaddingOAEPSHA256:
		maxPlaintext = k - 2*sha256.Size - 2
	default:
		return fmt.Errorf("cryptoenv: unsupported RSA padding %q", padding)
	}

	if maxPlaintext < sessionKeyBytes {
		return fmt.Errorf(
			"cryptoenv: RSA key too small: %d-bit modulus wraps at most %d bytes under %s, need %d",
			k*8, maxPlaintext, padding, sessionKeyBytes,
		)
	}
	return nil
}

// pkcs7Pad appends PKCS#7 padding. A full block is added when the input is
// already block-aligned, per the standard.
func pkcs7Pad(data []byte, blockSize int) []byte {
	padLen := blockSize - (len(data) % blockSize)
	out := make([]byte, 0, len(data)+padLen)
	out = append(out, data...)
	for i := 0; i < padLen; i++ {
		out = append(out, byte(padLen))
	}
	return out
}

// pkcs7Unpad validates and strips PKCS#7 padding.
func pkcs7Unpad(data []byte, blockSize int) ([]byte, error) {
	if len(data) == 0 || len(data)%blockSize != 0 {
		return nil, errors.New("cryptoenv: invalid padded length")
	}
	padLen := int(data[len(data)-1])
	if padLen == 0 || padLen > blockSize || padLen > len(data) {
		return nil, errors.New("cryptoenv: invalid padding byte")
	}
	for _, b := range data[len(data)-padLen:] {
		if int(b) != padLen {
			return nil, errors.New("cryptoenv: inconsistent padding")
		}
	}
	return data[:len(data)-padLen], nil
}

// interface guard: keep hash import meaningful if OAEP variants are pruned.
var _ func() hash.Hash = sha256.New
