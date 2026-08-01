package server

import (
	"context"
	"fmt"
	"io"
	"path/filepath"
	"strconv"
	"strings"
	"time"
	"unicode"

	"github.com/gin-gonic/gin"
)

// queryInt reads an integer query parameter, falling back when absent or
// malformed. A bad value is treated as absent rather than an error, because a
// stray page number should not fail an otherwise valid request.
func queryInt(c *gin.Context, key string, fallback int) int {
	raw := c.Query(key)
	if raw == "" {
		return fallback
	}
	v, err := strconv.Atoi(raw)
	if err != nil {
		return fallback
	}
	return v
}

// contextWithTimeout derives a bounded context from the request.
func contextWithTimeout(c *gin.Context, d time.Duration) (context.Context, context.CancelFunc) {
	return context.WithTimeout(c.Request.Context(), d)
}

// nonNilSlice ensures JSON represents an empty collection as [] rather than
// null. Dashboard consumers always render these values as lists, and a null
// collection would otherwise force every client to special-case Go's nil slice.
func nonNilSlice[T any](items []T) []T {
	if items == nil {
		return []T{}
	}
	return items
}

// streamDocument writes a KYC document to the response.
//
// Shared by the retailer and admin handlers so both get the same headers. The
// content is an identity document, so it must never be cached by a browser or an
// intermediate proxy, and it is served with a nosniff guard because the stored
// type is trusted only as far as the upload-time sniff established it.
func streamDocument(c *gin.Context, body io.Reader, mimeType, filename string) {
	if mimeType == "" {
		mimeType = "application/octet-stream"
	}

	c.Header("Content-Type", mimeType)
	c.Header("X-Content-Type-Options", "nosniff")
	c.Header("Cache-Control", "private, no-store, max-age=0")
	c.Header("Pragma", "no-cache")

	// inline so the wizard and the reviewer can preview the scan rather than
	// download it. The filename is quoted and stripped of anything that could
	// break out of the header.
	safe := sanitiseFilename(filename)
	if safe == "" {
		c.Header("Content-Disposition", "inline")
	} else {
		c.Header("Content-Disposition", fmt.Sprintf("inline; filename=%q", safe))
	}

	if _, err := io.Copy(c.Writer, body); err != nil {
		// The status line is already sent, so the only useful action is to abort
		// the connection rather than try to write an error body.
		c.Abort()
	}
}

// sanitiseFilename reduces a client-supplied name to something safe for a header.
func sanitiseFilename(name string) string {
	name = filepath.Base(strings.TrimSpace(name))
	if name == "." || name == string(filepath.Separator) {
		return ""
	}

	var b strings.Builder
	for _, r := range name {
		switch {
		case r == '"' || r == '\\' || r == '\r' || r == '\n' || r < 0x20:
			// Quotes and control characters could terminate or inject a header.
			continue
		case r > unicode.MaxASCII:
			// Non-ASCII needs RFC 5987 encoding to be legal here; dropping it is
			// simpler than encoding a name that is only a display hint.
			continue
		default:
			b.WriteRune(r)
		}
	}

	out := b.String()
	if len(out) > 100 {
		out = out[:100]
	}
	return out
}
