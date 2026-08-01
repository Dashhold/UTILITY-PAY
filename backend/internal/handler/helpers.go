package handler

import (
	"strconv"

	"github.com/gin-gonic/gin"
)

// queryIntDefault reads an integer query parameter, treating a malformed value as
// absent rather than as an error, so a stray page number cannot fail an otherwise
// valid request.
func queryIntDefault(c *gin.Context, key string, fallback int) int {
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
