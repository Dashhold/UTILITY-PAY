package service

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"errors"
	"fmt"
	"io"
	"mime/multipart"
	"net/http"
	"path/filepath"
	"regexp"
	"strings"
	"time"

	"github.com/google/uuid"
	"gorm.io/gorm"

	"github.com/utilipay/backend/internal/httpx"
	"github.com/utilipay/backend/internal/models"
	"github.com/utilipay/backend/internal/storage"
)

// KYCService drives the retailer KYC wizard.
//
// The wizard is stateful across sessions: a retailer may upload their PAN today
// and their shop photos next week, so progress and documents are persisted rather
// than held in the browser.
type KYCService struct {
	db *gorm.DB

	store        storage.Store
	maxFileBytes int64
}

// NewKYCService builds a KYCService over the given object store.
func NewKYCService(db *gorm.DB, store storage.Store, maxFileBytes int64) *KYCService {
	return &KYCService{db: db, store: store, maxFileBytes: maxFileBytes}
}

// RequiredDocTypes are the documents a submission must carry.
//
// Enforced server-side as well as in the wizard: a client that skips a step must
// not be able to submit an incomplete application by calling the endpoint
// directly.
var RequiredDocTypes = []string{
	"pan",
	"aadhaar_front",
	"aadhaar_back",
	"shop_photo",
	"address_proof",
	"cancelled_cheque",
}

// OptionalDocTypes may be supplied but are not required.
var OptionalDocTypes = []string{"gst", "shop_interior", "other"}

// allowedDocTypes is the union, as a set, so an unknown type is rejected rather
// than stored and silently ignored by the reviewer.
var allowedDocTypes = func() map[string]bool {
	set := make(map[string]bool, len(RequiredDocTypes)+len(OptionalDocTypes))
	for _, t := range RequiredDocTypes {
		set[t] = true
	}
	for _, t := range OptionalDocTypes {
		set[t] = true
	}
	return set
}()

// allowedMimeTypes bounds what may be stored.
//
// An allow-list rather than a block-list: anything not explicitly a scan or a
// photo has no business in a KYC folder, and accepting arbitrary types invites
// stored-content attacks against whoever opens the file later.
var allowedMimeTypes = map[string]string{
	"image/jpeg":      ".jpg",
	"image/png":       ".png",
	"image/webp":      ".webp",
	"application/pdf": ".pdf",
}

var (
	panPattern     = regexp.MustCompile(`^[A-Z]{5}[0-9]{4}[A-Z]$`)
	aadhaarPattern = regexp.MustCompile(`^[0-9]{12}$`)
	gstinPattern   = regexp.MustCompile(`^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$`)
)

// KYCApplicationView is the wizard state plus its documents.
type KYCApplicationView struct {
	*models.KYCApplication

	// MissingDocTypes tells the wizard exactly what is still outstanding, so the
	// UI does not have to duplicate the server's completeness rule.
	MissingDocTypes []string `json:"missingDocTypes"`
	CanSubmit       bool     `json:"canSubmit"`

	// Identity numbers live on the retailer record, and are echoed here so the
	// wizard can prefill without a second call.
	PAN          string `json:"pan"`
	GSTIN        string `json:"gstin"`
	AadhaarLast4 string `json:"aadhaarLast4"`
}

// Application returns a retailer's KYC application, creating it on first access.
//
// Creating lazily rather than at signup keeps the retailer table free of empty
// application rows for accounts that never start the wizard.
func (s *KYCService) Application(ctx context.Context, retailerID uuid.UUID) (*KYCApplicationView, error) {
	app, err := s.ensureApplication(ctx, retailerID)
	if err != nil {
		return nil, err
	}

	var docs []models.KYCDocument
	if err := s.db.WithContext(ctx).
		Where("application_id = ?", app.ID).
		Order("uploaded_at ASC").
		Find(&docs).Error; err != nil {
		return nil, fmt.Errorf("kyc: load documents: %w", err)
	}
	app.Documents = docs

	var retailer models.Retailer
	if err := s.db.WithContext(ctx).
		Select("pan", "gstin", "aadhaar_last4").
		Where("id = ?", retailerID).First(&retailer).Error; err != nil {
		return nil, fmt.Errorf("kyc: load retailer: %w", err)
	}

	missing := missingDocTypes(docs)
	return &KYCApplicationView{
		KYCApplication:  app,
		MissingDocTypes: missing,
		// A submitted or verified application must not be resubmittable; only a
		// rejected or not-yet-started one can be sent again.
		CanSubmit: len(missing) == 0 &&
			(app.Status == models.KYCNotSubmitted || app.Status == models.KYCRejected),
		PAN:          retailer.PAN,
		GSTIN:        retailer.GSTIN,
		AadhaarLast4: retailer.AadhaarLast4,
	}, nil
}

// missingDocTypes reports which required documents are absent.
//
// A rejected document does not count as present: leaving it would let a retailer
// submit an application the reviewer has already turned down.
func missingDocTypes(docs []models.KYCDocument) []string {
	present := make(map[string]bool, len(docs))
	for _, d := range docs {
		if d.Status != models.KYCRejected {
			present[d.DocType] = true
		}
	}

	missing := make([]string, 0, len(RequiredDocTypes))
	for _, t := range RequiredDocTypes {
		if !present[t] {
			missing = append(missing, t)
		}
	}
	return missing
}

func (s *KYCService) ensureApplication(ctx context.Context, retailerID uuid.UUID) (*models.KYCApplication, error) {
	var app models.KYCApplication
	err := s.db.WithContext(ctx).Where("retailer_id = ?", retailerID).First(&app).Error
	if err == nil {
		return &app, nil
	}
	if !errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, fmt.Errorf("kyc: load application: %w", err)
	}

	app = models.KYCApplication{
		RetailerID:  retailerID,
		Status:      models.KYCNotSubmitted,
		CurrentStep: 1,
		TotalSteps:  8,
	}
	if err := s.db.WithContext(ctx).Create(&app).Error; err != nil {
		// A concurrent first request may have won the race against the unique
		// index; re-reading is correct rather than surfacing a conflict.
		if isUniqueViolation(err) {
			if readErr := s.db.WithContext(ctx).
				Where("retailer_id = ?", retailerID).First(&app).Error; readErr == nil {
				return &app, nil
			}
		}
		return nil, fmt.Errorf("kyc: create application: %w", err)
	}
	return &app, nil
}

// SaveProgressInput carries a wizard step save.
type SaveProgressInput struct {
	CurrentStep int    `json:"currentStep"`
	PAN         string `json:"pan"`
	GSTIN       string `json:"gstin"`
	// Aadhaar is the full 12-digit number. Only the last four are persisted.
	Aadhaar string `json:"aadhaar"`
}

// SaveProgress records wizard position and any identity numbers entered.
//
// Only the last four Aadhaar digits are stored. Retaining the full number would
// make this database a UIDAI-regulated Aadhaar repository, which the platform is
// not authorised to be, and the last four are all a reviewer needs to match
// against the uploaded scan.
func (s *KYCService) SaveProgress(ctx context.Context, retailerID uuid.UUID, in SaveProgressInput) (*KYCApplicationView, error) {
	app, err := s.ensureApplication(ctx, retailerID)
	if err != nil {
		return nil, err
	}

	if app.Status == models.KYCVerified {
		return nil, fmt.Errorf("%w: KYC is already verified", httpx.ErrConflict)
	}
	if app.Status == models.KYCPending {
		return nil, fmt.Errorf("%w: KYC is under review and cannot be edited", httpx.ErrConflict)
	}

	retailerUpdates := map[string]any{}

	if pan := strings.ToUpper(strings.TrimSpace(in.PAN)); pan != "" {
		if !panPattern.MatchString(pan) {
			return nil, fmt.Errorf("%w: PAN must look like ABCDE1234F", httpx.ErrValidation)
		}
		retailerUpdates["pan"] = pan
	}

	if gstin := strings.ToUpper(strings.TrimSpace(in.GSTIN)); gstin != "" {
		if !gstinPattern.MatchString(gstin) {
			return nil, fmt.Errorf("%w: GSTIN must be 15 characters, e.g. 27ABCDE1234F1Z5", httpx.ErrValidation)
		}
		retailerUpdates["gstin"] = gstin
	}

	if aadhaar := strings.TrimSpace(in.Aadhaar); aadhaar != "" {
		if !aadhaarPattern.MatchString(aadhaar) {
			return nil, fmt.Errorf("%w: Aadhaar number must be 12 digits", httpx.ErrValidation)
		}
		retailerUpdates["aadhaar_last4"] = aadhaar[len(aadhaar)-4:]
	}

	err = s.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		if in.CurrentStep > 0 {
			step := in.CurrentStep
			if step > app.TotalSteps {
				step = app.TotalSteps
			}
			// Progress only moves forward, so revisiting an earlier step to correct
			// something does not make the application look less complete.
			if step > app.CurrentStep {
				if err := tx.Model(&models.KYCApplication{}).
					Where("id = ?", app.ID).
					Update("current_step", step).Error; err != nil {
					return fmt.Errorf("kyc: save step: %w", err)
				}
			}
		}

		if len(retailerUpdates) > 0 {
			if err := tx.Model(&models.Retailer{}).
				Where("id = ?", retailerID).
				Updates(retailerUpdates).Error; err != nil {
				return fmt.Errorf("kyc: save identity numbers: %w", err)
			}
		}
		return nil
	})
	if err != nil {
		return nil, err
	}

	return s.Application(ctx, retailerID)
}

// UploadDocumentInput carries one uploaded file.
type UploadDocumentInput struct {
	RetailerID uuid.UUID
	DocType    string
	DocNumber  string
	Header     *multipart.FileHeader
}

// UploadDocument stores a file and records it against the application.
//
// Replacing an existing document of the same type is allowed and deletes the old
// file, because a retailer correcting a blurry scan should not leave two
// candidate documents for the reviewer to choose between.
func (s *KYCService) UploadDocument(ctx context.Context, in UploadDocumentInput) (*models.KYCDocument, error) {
	if !allowedDocTypes[in.DocType] {
		return nil, fmt.Errorf("%w: unknown document type %q", httpx.ErrValidation, in.DocType)
	}
	if in.Header == nil {
		return nil, fmt.Errorf("%w: no file was uploaded", httpx.ErrValidation)
	}
	if in.Header.Size <= 0 {
		return nil, fmt.Errorf("%w: the uploaded file is empty", httpx.ErrValidation)
	}
	if in.Header.Size > s.maxFileBytes {
		return nil, fmt.Errorf("%w: the file must be %d MB or smaller",
			httpx.ErrValidation, s.maxFileBytes/(1024*1024))
	}

	app, err := s.ensureApplication(ctx, in.RetailerID)
	if err != nil {
		return nil, err
	}
	if app.Status == models.KYCVerified {
		return nil, fmt.Errorf("%w: KYC is already verified", httpx.ErrConflict)
	}
	if app.Status == models.KYCPending {
		return nil, fmt.Errorf("%w: KYC is under review and cannot be edited", httpx.ErrConflict)
	}

	src, err := in.Header.Open()
	if err != nil {
		return nil, fmt.Errorf("%w: the uploaded file could not be read", httpx.ErrValidation)
	}
	defer src.Close()

	// Content type is sniffed from the bytes rather than trusted from the
	// Content-Type header or the extension, either of which a client can lie about.
	mimeType, err := sniffMime(src)
	if err != nil {
		return nil, err
	}
	if _, err := src.Seek(0, io.SeekStart); err != nil {
		return nil, fmt.Errorf("kyc: rewind upload: %w", err)
	}

	key, size, err := s.writeFile(ctx, in.RetailerID, in.DocType, mimeType, src)
	if err != nil {
		return nil, err
	}

	doc := models.KYCDocument{
		ApplicationID: app.ID,
		RetailerID:    in.RetailerID,
		DocType:       in.DocType,
		// The client filename is recorded for the reviewer's benefit but never used
		// as a path component.
		Name: filepath.Base(in.Header.Filename),
		// FileURL holds the storage key, not a browsable URL. These documents are
		// never publicly addressable.
		FileURL:    key,
		FileSize:   size,
		MimeType:   mimeType,
		DocNumber:  strings.ToUpper(strings.TrimSpace(in.DocNumber)),
		Status:     models.KYCPending,
		UploadedAt: time.Now().UTC(),
	}

	var previous []models.KYCDocument
	err = s.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		if err := tx.Where("application_id = ? AND doc_type = ?", app.ID, in.DocType).
			Find(&previous).Error; err != nil {
			return fmt.Errorf("kyc: load existing documents: %w", err)
		}
		if len(previous) > 0 {
			if err := tx.Where("application_id = ? AND doc_type = ?", app.ID, in.DocType).
				Delete(&models.KYCDocument{}).Error; err != nil {
				return fmt.Errorf("kyc: replace document: %w", err)
			}
		}
		if err := tx.Create(&doc).Error; err != nil {
			return fmt.Errorf("kyc: record document: %w", err)
		}
		return nil
	})
	if err != nil {
		// The row was not written, so the orphaned object is removed rather than
		// left consuming storage with nothing pointing at it.
		s.removeFile(ctx, key)
		return nil, err
	}

	// Superseded objects are deleted after the transaction commits: doing it inside
	// would leave the file gone if the commit then failed.
	for _, old := range previous {
		s.removeFile(ctx, old.FileURL)
	}

	return &doc, nil
}

// sniffMime detects the content type from the leading bytes.
func sniffMime(r io.Reader) (string, error) {
	// 512 bytes is what http.DetectContentType examines.
	head := make([]byte, 512)
	n, err := io.ReadFull(r, head)
	if err != nil && !errors.Is(err, io.ErrUnexpectedEOF) && !errors.Is(err, io.EOF) {
		return "", fmt.Errorf("%w: the uploaded file could not be read", httpx.ErrValidation)
	}

	// DetectContentType appends a charset for some types, so only the media type
	// is compared against the allow-list.
	detected := strings.TrimSpace(strings.Split(http.DetectContentType(head[:n]), ";")[0])
	if _, ok := allowedMimeTypes[detected]; !ok {
		return "", fmt.Errorf("%w: only JPG, PNG, WebP and PDF files are accepted", httpx.ErrValidation)
	}
	return detected, nil
}

// writeFile stores the upload under a per-retailer key and returns that key.
//
// Keys are random rather than derived from user input, which removes both path
// traversal and the chance of one retailer's upload colliding with another's.
func (s *KYCService) writeFile(
	ctx context.Context, retailerID uuid.UUID, docType, mimeType string, src io.Reader,
) (string, int64, error) {
	suffix := make([]byte, 8)
	if _, err := rand.Read(suffix); err != nil {
		return "", 0, fmt.Errorf("kyc: generate object key: %w", err)
	}

	key := fmt.Sprintf("kyc/%s/%s-%s%s",
		retailerID.String(), docType, hex.EncodeToString(suffix), allowedMimeTypes[mimeType])

	written, err := s.store.Put(ctx, key, mimeType, src, s.maxFileBytes)
	if errors.Is(err, storage.ErrTooLarge) {
		return "", 0, fmt.Errorf("%w: the file must be %d MB or smaller",
			httpx.ErrValidation, s.maxFileBytes/(1024*1024))
	}
	if err != nil {
		return "", 0, err
	}
	return key, written, nil
}

// removeFile deletes a stored object, ignoring one that is already gone.
func (s *KYCService) removeFile(ctx context.Context, key string) {
	if key == "" {
		return
	}
	_ = s.store.Delete(ctx, key)
}

// DocumentFile opens a document for an authorised reader.
//
// Ownership is checked here rather than by the caller so no handler can serve a
// document by id alone. Passing a nil retailerID means an admin read. The caller
// closes the returned reader.
func (s *KYCService) DocumentFile(
	ctx context.Context, docID uuid.UUID, retailerID *uuid.UUID,
) (io.ReadCloser, string, string, error) {
	q := s.db.WithContext(ctx).Where("id = ?", docID)
	if retailerID != nil {
		q = q.Where("retailer_id = ?", *retailerID)
	}

	var doc models.KYCDocument
	err := q.First(&doc).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		// A document belonging to someone else is reported as not found rather
		// than forbidden, so the response does not confirm that the id exists.
		return nil, "", "", httpx.ErrNotFound
	}
	if err != nil {
		return nil, "", "", fmt.Errorf("kyc: load document: %w", err)
	}

	body, err := s.store.Open(ctx, doc.FileURL)
	if errors.Is(err, storage.ErrNotFound) {
		// The row exists but the object does not, which means storage was cleared
		// or the driver was switched. Reported as not found rather than a server
		// fault so the retailer is told to re-upload.
		return nil, "", "", httpx.ErrNotFound
	}
	if err != nil {
		return nil, "", "", err
	}
	return body, doc.MimeType, doc.Name, nil
}

// DeleteDocument removes one of a retailer's own documents.
func (s *KYCService) DeleteDocument(ctx context.Context, retailerID, docID uuid.UUID) error {
	var doc models.KYCDocument
	err := s.db.WithContext(ctx).
		Where("id = ? AND retailer_id = ?", docID, retailerID).First(&doc).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return httpx.ErrNotFound
	}
	if err != nil {
		return fmt.Errorf("kyc: load document: %w", err)
	}

	app, err := s.ensureApplication(ctx, retailerID)
	if err != nil {
		return err
	}
	if app.Status == models.KYCPending || app.Status == models.KYCVerified {
		return fmt.Errorf("%w: documents cannot be removed once KYC is submitted", httpx.ErrConflict)
	}

	if err := s.db.WithContext(ctx).Delete(&models.KYCDocument{}, "id = ?", docID).Error; err != nil {
		return fmt.Errorf("kyc: delete document: %w", err)
	}
	s.removeFile(ctx, doc.FileURL)
	return nil
}

// Submit moves the application into review.
func (s *KYCService) Submit(ctx context.Context, retailerID uuid.UUID) (*KYCApplicationView, error) {
	view, err := s.Application(ctx, retailerID)
	if err != nil {
		return nil, err
	}

	switch view.Status {
	case models.KYCPending:
		return nil, fmt.Errorf("%w: KYC has already been submitted and is under review", httpx.ErrConflict)
	case models.KYCVerified:
		return nil, fmt.Errorf("%w: KYC is already verified", httpx.ErrConflict)
	}

	if len(view.MissingDocTypes) > 0 {
		return nil, fmt.Errorf("%w: upload these documents first: %s",
			httpx.ErrValidation, strings.Join(view.MissingDocTypes, ", "))
	}
	if view.PAN == "" {
		return nil, fmt.Errorf("%w: enter your PAN before submitting", httpx.ErrValidation)
	}
	if view.AadhaarLast4 == "" {
		return nil, fmt.Errorf("%w: enter your Aadhaar number before submitting", httpx.ErrValidation)
	}

	now := time.Now().UTC()
	err = s.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		if err := tx.Model(&models.KYCApplication{}).
			Where("id = ?", view.ID).
			Updates(map[string]any{
				"status":        models.KYCPending,
				"submitted_at":  now,
				"current_step":  view.TotalSteps,
				"reject_reason": "",
			}).Error; err != nil {
			return fmt.Errorf("kyc: submit application: %w", err)
		}

		// The retailer's own KYC status tracks the application, so the rest of the
		// platform has one field to gate on.
		if err := tx.Model(&models.Retailer{}).
			Where("id = ?", retailerID).
			Update("kyc_status", models.KYCPending).Error; err != nil {
			return fmt.Errorf("kyc: update retailer status: %w", err)
		}
		return nil
	})
	if err != nil {
		return nil, err
	}

	return s.Application(ctx, retailerID)
}

// AdminDocuments lists a retailer's KYC documents for review.
func (s *KYCService) AdminDocuments(ctx context.Context, retailerID uuid.UUID) (*KYCApplicationView, error) {
	return s.Application(ctx, retailerID)
}

// ReviewDocument records a per-document verification decision.
func (s *KYCService) ReviewDocument(ctx context.Context, docID uuid.UUID, status models.KYCStatus, remarks string, reviewerID uuid.UUID) error {
	if status != models.KYCVerified && status != models.KYCRejected {
		return fmt.Errorf("%w: a document can only be verified or rejected", httpx.ErrValidation)
	}

	now := time.Now().UTC()
	res := s.db.WithContext(ctx).Model(&models.KYCDocument{}).
		Where("id = ?", docID).
		Updates(map[string]any{
			"status":      status,
			"remarks":     remarks,
			"verified_at": now,
			"verified_by": reviewerID,
		})
	if res.Error != nil {
		return fmt.Errorf("kyc: review document: %w", res.Error)
	}
	if res.RowsAffected == 0 {
		return httpx.ErrNotFound
	}
	return nil
}
