// Package storage abstracts where retailer-uploaded files are kept.
//
// KYC scans are identity documents. Whichever backend is in use, they are never
// exposed by a URL: the API streams them through an authenticated handler that
// checks ownership, so a bucket or directory must not be publicly readable.
package storage

import (
	"context"
	"errors"
	"io"
)

// ErrNotFound is returned when a key does not exist.
var ErrNotFound = errors.New("storage: object not found")

// Store is the minimal interface the KYC service needs.
//
// Keys are forward-slash relative paths such as
// "kyc/<retailerId>/pan-9f2b.png". The backend decides how that maps onto a
// filesystem path or an object key.
type Store interface {
	// Put writes an object and returns the number of bytes stored.
	//
	// The reader is consumed fully. limit caps how much is accepted; exceeding it
	// is an error rather than a silent truncation, because a truncated identity
	// document looks corrupt to whoever reviews it.
	Put(ctx context.Context, key, contentType string, r io.Reader, limit int64) (int64, error)

	// Open returns a reader for an object. The caller closes it.
	Open(ctx context.Context, key string) (io.ReadCloser, error)

	// Delete removes an object. A missing object is not an error, so a retry
	// after a partial failure is safe.
	Delete(ctx context.Context, key string) error

	// Describe returns a short human-readable identifier for logs and health
	// output, e.g. "local:./data/uploads" or "s3://bucket/prefix".
	Describe() string
}

// ErrTooLarge is returned when an upload exceeds the permitted size.
var ErrTooLarge = errors.New("storage: object exceeds the size limit")
