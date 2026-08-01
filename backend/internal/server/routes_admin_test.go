package server

import (
	"testing"

	"gorm.io/gorm/schema"

	"github.com/utilipay/backend/internal/models"
)

// TestMasterColumnsTranslatesCamelCase guards the admin update path.
//
// GORM emits an unrecognised update-map key as a literal column name, so before
// this translation existed a payload like {"pincodeFrom": "400001"} produced
// `SET "pincodeFrom" = ...` and Postgres rejected the statement. Every
// multi-word master field would have been un-editable.
func TestMasterColumnsTranslatesCamelCase(t *testing.T) {
	namer := schema.NamingStrategy{}

	cases := []struct {
		name    string
		columns map[string]string
		want    map[string]string
	}{
		{
			name:    "city",
			columns: masterColumns[models.City](namer),
			want: map[string]string{
				"name":        "name",
				"state":       "state",
				"pincodeFrom": "pincode_from",
				"pincodeTo":   "pincode_to",
				"status":      "status",
			},
		},
		{
			name:    "service",
			columns: masterColumns[models.Service](namer),
			want: map[string]string{
				"name":         "name",
				"categoryId":   "category_id",
				"apiProvider":  "api_provider",
				"providerCode": "provider_code",
				"minAmount":    "min_amount",
				"maxAmount":    "max_amount",
			},
		},
		{
			name:    "company bank",
			columns: masterColumns[models.CompanyBank](namer),
			want: map[string]string{
				"bankName":      "bank_name",
				"accountNumber": "account_number",
				"ifsc":          "ifsc",
				"upiId":         "upi_id",
				"isDefault":     "is_default",
			},
		},
		{
			name:    "commission slot",
			columns: masterColumns[models.CommissionSlot](namer),
			want: map[string]string{
				"slabType":  "slab_type",
				"value":     "value",
				"tds":       "tds",
				"gst":       "gst",
				"minAmount": "min_amount",
				"planId":    "plan_id",
			},
		},
		{
			name:    "announcement",
			columns: masterColumns[models.Announcement](namer),
			want: map[string]string{
				"publishedDate": "published_date",
				"expiryDate":    "expiry_date",
				"audience":      "audience",
			},
		},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			for jsonName, wantColumn := range tc.want {
				got, ok := tc.columns[jsonName]
				if !ok {
					t.Errorf("json field %q is not addressable; the admin panel cannot edit it", jsonName)
					continue
				}
				if got != wantColumn {
					t.Errorf("json field %q maps to column %q, want %q", jsonName, got, wantColumn)
				}
			}
		})
	}
}

// TestMasterColumnsExcludesUnwritableFields checks that identity, audit and
// relation fields are not addressable. A caller able to set `id` could reassign
// a record onto another row.
func TestMasterColumnsExcludesUnwritableFields(t *testing.T) {
	namer := schema.NamingStrategy{}

	for _, field := range []string{"id", "createdAt", "updatedAt", "deletedAt"} {
		if _, ok := masterColumns[models.City](namer)[field]; ok {
			t.Errorf("%q must not be client-writable", field)
		}
	}

	// json:"-" on the Services relation keeps it out of the map entirely.
	if _, ok := masterColumns[models.ServiceCategory](namer)["Services"]; ok {
		t.Error("relation fields must not be addressable")
	}

	// A relation exposed under a json name still has no column of its own.
	if _, ok := masterColumns[models.CommissionPlan](namer)["slots"]; ok {
		t.Error("the slots relation has no column and must not be addressable")
	}
}
