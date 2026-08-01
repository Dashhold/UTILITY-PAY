package service

import "github.com/utilipay/backend/internal/models"

// Money is an alias for the domain monetary type, so service signatures read
// cleanly without repeating the models qualifier on every field.
//
// It is an alias rather than a distinct type so values pass to and from the
// models layer without conversion.
type Money = models.Money
