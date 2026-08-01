package storage

import (
	"context"
	"errors"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"strings"
)

// Local stores objects on the container filesystem.
//
// Intended for development and single-instance deployments. On more than one
// instance a document written by one container is invisible to the others, so
// production should use S3 or mount shared storage.
type Local struct {
	root string
}

// NewLocal builds a filesystem-backed store rooted at dir.
func NewLocal(dir string) (*Local, error) {
	abs, err := filepath.Abs(dir)
	if err != nil {
		return nil, fmt.Errorf("storage: resolve upload dir: %w", err)
	}
	if err := os.MkdirAll(abs, 0o750); err != nil {
		return nil, fmt.Errorf("storage: create upload dir: %w", err)
	}
	return &Local{root: abs}, nil
}

// resolve turns a key into an absolute path, refusing anything that escapes the
// root.
//
// The check is on the joined result rather than the input, so ".." segments and
// absolute keys are both caught however they are spelled.
func (l *Local) resolve(key string) (string, error) {
	clean := filepath.Clean(filepath.FromSlash(key))
	abs := filepath.Join(l.root, clean)
	if abs != l.root && !strings.HasPrefix(abs, l.root+string(os.PathSeparator)) {
		return "", fmt.Errorf("storage: key %q escapes the upload root", key)
	}
	return abs, nil
}

// Put writes the object, creating parent directories as needed.
func (l *Local) Put(_ context.Context, key, _ string, r io.Reader, limit int64) (int64, error) {
	path, err := l.resolve(key)
	if err != nil {
		return 0, err
	}
	if err := os.MkdirAll(filepath.Dir(path), 0o750); err != nil {
		return 0, fmt.Errorf("storage: create directory: %w", err)
	}

	// O_EXCL: keys carry random suffixes, so a collision means something is wrong
	// and silently overwriting another retailer's document would be worse.
	f, err := os.OpenFile(path, os.O_WRONLY|os.O_CREATE|os.O_EXCL, 0o640)
	if err != nil {
		return 0, fmt.Errorf("storage: create file: %w", err)
	}
	defer f.Close()

	// Reading one byte past the limit distinguishes "exactly at the limit" from
	// "over it"; a multipart header can understate the real body length.
	written, err := io.Copy(f, io.LimitReader(r, limit+1))
	if err != nil {
		os.Remove(path)
		return 0, fmt.Errorf("storage: write file: %w", err)
	}
	if written > limit {
		os.Remove(path)
		return 0, ErrTooLarge
	}
	return written, nil
}

// Open returns a reader for the object.
func (l *Local) Open(_ context.Context, key string) (io.ReadCloser, error) {
	path, err := l.resolve(key)
	if err != nil {
		return nil, err
	}
	f, err := os.Open(path)
	if errors.Is(err, os.ErrNotExist) {
		return nil, ErrNotFound
	}
	if err != nil {
		return nil, fmt.Errorf("storage: open file: %w", err)
	}
	return f, nil
}

// Delete removes the object, ignoring one that is already gone.
func (l *Local) Delete(_ context.Context, key string) error {
	path, err := l.resolve(key)
	if err != nil {
		return err
	}
	if err := os.Remove(path); err != nil && !errors.Is(err, os.ErrNotExist) {
		return fmt.Errorf("storage: delete file: %w", err)
	}
	return nil
}

// Describe identifies the store for logs.
func (l *Local) Describe() string { return "local:" + l.root }
