package models

import (
	"database/sql/driver"
	"encoding/json"
	"errors"
	"fmt"
)

// JSONMap is a string-keyed map persisted as PostgreSQL jsonb.
//
// It exists so provider-defined, variable-shape data (biller customer
// parameters, raw upstream payloads) can be stored without a migration per
// field, while still being queryable via jsonb operators.
type JSONMap map[string]any

// Value implements driver.Valuer.
//
// A nil map is stored as SQL NULL rather than the literal "null", so that
// `IS NULL` checks behave as an operator would expect.
func (m JSONMap) Value() (driver.Value, error) {
	if m == nil {
		return nil, nil
	}
	b, err := json.Marshal(m)
	if err != nil {
		return nil, fmt.Errorf("models: marshal JSONMap: %w", err)
	}
	return string(b), nil
}

// Scan implements sql.Scanner.
func (m *JSONMap) Scan(src any) error {
	if src == nil {
		*m = nil
		return nil
	}

	var raw []byte
	switch v := src.(type) {
	case []byte:
		raw = v
	case string:
		raw = []byte(v)
	default:
		return fmt.Errorf("models: cannot scan %T into JSONMap", src)
	}

	if len(raw) == 0 {
		*m = nil
		return nil
	}

	decoded := JSONMap{}
	if err := json.Unmarshal(raw, &decoded); err != nil {
		return fmt.Errorf("models: unmarshal JSONMap: %w", err)
	}
	*m = decoded
	return nil
}

// GormDataType tells GORM the column type for migrations.
func (JSONMap) GormDataType() string { return "jsonb" }

// String returns a compact JSON rendering, or an empty object on failure.
func (m JSONMap) String() string {
	if m == nil {
		return "{}"
	}
	b, err := json.Marshal(m)
	if err != nil {
		return "{}"
	}
	return string(b)
}

// GetString reads a string value, reporting whether it was present and of the
// expected type.
func (m JSONMap) GetString(key string) (string, bool) {
	if m == nil {
		return "", false
	}
	v, ok := m[key]
	if !ok {
		return "", false
	}
	s, ok := v.(string)
	return s, ok
}

// ErrNotAnObject is returned when JSON that is not an object is scanned.
var ErrNotAnObject = errors.New("models: JSON value is not an object")
