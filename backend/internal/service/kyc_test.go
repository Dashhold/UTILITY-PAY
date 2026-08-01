package service

import (
	"bytes"
	"errors"
	"strings"
	"testing"

	"github.com/utilipay/backend/internal/httpx"
	"github.com/utilipay/backend/internal/models"
)

// TestSniffMimeRejectsDisguisedFiles guards the KYC upload path.
//
// The Content-Type header and the filename extension are both attacker-controlled,
// so the stored type is derived from the bytes. Without this, a caller could store
// arbitrary content under a .png name for a reviewer to open later.
func TestSniffMimeRejectsDisguisedFiles(t *testing.T) {
	// Minimal valid files, identified by their magic bytes.
	png := []byte("\x89PNG\r\n\x1a\n" + strings.Repeat("\x00", 32))
	jpeg := []byte("\xff\xd8\xff\xe0" + strings.Repeat("\x00", 32))
	pdf := []byte("%PDF-1.7\n" + strings.Repeat("x", 32))

	cases := []struct {
		name    string
		content []byte
		want    string
		wantErr bool
	}{
		{name: "png", content: png, want: "image/png"},
		{name: "jpeg", content: jpeg, want: "image/jpeg"},
		{name: "pdf", content: pdf, want: "application/pdf"},
		{
			name:    "plain text named as an image",
			content: []byte("this is not a scan, it is a note"),
			wantErr: true,
		},
		{
			name:    "html masquerading as a document",
			content: []byte("<!DOCTYPE html><html><body>hello</body></html>"),
			wantErr: true,
		},
		{
			name: "windows executable",
			// MZ header.
			content: append([]byte("MZ"), bytes.Repeat([]byte{0x00}, 64)...),
			wantErr: true,
		},
		{
			name:    "shell script",
			content: []byte("#!/bin/sh\nrm -rf /\n"),
			wantErr: true,
		},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			got, err := sniffMime(bytes.NewReader(tc.content))

			if tc.wantErr {
				if err == nil {
					t.Fatalf("expected rejection, got type %q", got)
				}
				// The caller must be able to map this to a 400, not a 500.
				if !errors.Is(err, httpx.ErrValidation) {
					t.Errorf("error should wrap ErrValidation, got %v", err)
				}
				return
			}

			if err != nil {
				t.Fatalf("unexpected error: %v", err)
			}
			if got != tc.want {
				t.Errorf("sniffed %q, want %q", got, tc.want)
			}
		})
	}
}

// TestMissingDocTypesTreatsRejectedAsAbsent checks the completeness rule.
//
// A rejected document must not satisfy its requirement: leaving it would let a
// retailer resubmit an application the reviewer has already turned down, with the
// same unusable scan attached.
func TestMissingDocTypesTreatsRejectedAsAbsent(t *testing.T) {
	docs := []models.KYCDocument{
		{DocType: "pan", Status: models.KYCVerified},
		{DocType: "aadhaar_front", Status: models.KYCPending},
		{DocType: "aadhaar_back", Status: models.KYCRejected},
		{DocType: "shop_photo", Status: models.KYCPending},
		{DocType: "address_proof", Status: models.KYCVerified},
		// cancelled_cheque is absent entirely.
		{DocType: "gst", Status: models.KYCPending},
	}

	missing := missingDocTypes(docs)

	want := map[string]bool{"aadhaar_back": true, "cancelled_cheque": true}
	if len(missing) != len(want) {
		t.Fatalf("missing = %v, want exactly %d entries", missing, len(want))
	}
	for _, docType := range missing {
		if !want[docType] {
			t.Errorf("%q reported missing but should be satisfied", docType)
		}
	}
}

// TestMissingDocTypesIgnoresOptionalDocuments confirms an optional document does
// not block submission.
func TestMissingDocTypesIgnoresOptionalDocuments(t *testing.T) {
	docs := make([]models.KYCDocument, 0, len(RequiredDocTypes))
	for _, docType := range RequiredDocTypes {
		docs = append(docs, models.KYCDocument{DocType: docType, Status: models.KYCPending})
	}

	if missing := missingDocTypes(docs); len(missing) != 0 {
		t.Errorf("all required documents present but missing = %v", missing)
	}
}

// TestRequiredAndOptionalDocTypesAreDisjoint catches a document type listed in
// both sets, which would make the completeness rule ambiguous.
func TestRequiredAndOptionalDocTypesAreDisjoint(t *testing.T) {
	required := make(map[string]bool, len(RequiredDocTypes))
	for _, docType := range RequiredDocTypes {
		required[docType] = true
	}
	for _, docType := range OptionalDocTypes {
		if required[docType] {
			t.Errorf("%q is both required and optional", docType)
		}
	}

	// Every listed type must also be accepted by the upload handler, otherwise a
	// required document could never be supplied.
	for _, docType := range append(append([]string{}, RequiredDocTypes...), OptionalDocTypes...) {
		if !allowedDocTypes[docType] {
			t.Errorf("%q is listed but not in the accepted set", docType)
		}
	}
}

// TestAllowedMimeTypesHaveExtensions ensures every accepted type can be written to
// disk with a sensible suffix; an empty extension would produce extensionless
// files that are awkward for a reviewer to open.
func TestAllowedMimeTypesHaveExtensions(t *testing.T) {
	for mimeType, ext := range allowedMimeTypes {
		if ext == "" || !strings.HasPrefix(ext, ".") {
			t.Errorf("%q maps to extension %q", mimeType, ext)
		}
	}
}
