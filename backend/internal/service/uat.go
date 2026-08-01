package service

import (
	"context"
	"fmt"
	"sort"
	"strings"
	"time"

	"gorm.io/gorm"

	"github.com/utilipay/backend/internal/config"
	"github.com/utilipay/backend/internal/models"
	"github.com/utilipay/backend/internal/provider/bharatconnect"
)

// UATService assembles the evidence bundle required by
// bharat_connect/UAT_checklist.md.
//
// The checklist asks for two different things: captured request/response logs for
// items 1-14, and written explanations for items 15-18. Both are produced here so
// the narrative answers are derived from the running configuration rather than
// written by hand, which keeps the stated retry intervals from drifting away from
// the intervals the worker actually uses.
type UATService struct {
	db     *gorm.DB
	recon  config.ReconciliationConfig
	bcCfg  config.BharatConnectConfig
	suiteA string
	suiteR string
	suiteI int
}

// NewUATService builds a UATService.
func NewUATService(db *gorm.DB, recon config.ReconciliationConfig, bcCfg config.BharatConnectConfig, aesMode, rsaPadding string, ivBytes int) *UATService {
	return &UATService{
		db:     db,
		recon:  recon,
		bcCfg:  bcCfg,
		suiteA: aesMode,
		suiteR: rsaPadding,
		suiteI: ivBytes,
	}
}

// UATSection is one numbered item of the checklist.
type UATSection struct {
	Item      int    `json:"item"`
	Title     string `json:"title"`
	Operation string `json:"operation,omitempty"`
	// Expectation states which outcome this section must evidence.
	Expectation string `json:"expectation,omitempty"`

	Evidence []UATEvidence `json:"evidence"`
	// Status is "complete" when at least one matching log exists, otherwise
	// "missing". This is what tells you whether the bundle is submittable.
	Status string `json:"status"`
	Note   string `json:"note,omitempty"`
}

// UATEvidence is a single captured call in the format the checklist demands.
type UATEvidence struct {
	CapturedAt time.Time `json:"capturedAt"`
	Curl       string    `json:"curlRequest"`
	RequestURL string    `json:"requestUrl"`

	// RequestBody carries both halves of the envelope, which the checklist
	// requires for every logged call.
	RequestBody UATRequestBody `json:"requestBody"`

	ResponseStatus int    `json:"responseHttpStatus"`
	Response       string `json:"response"`
	DurationMS     int64  `json:"durationMs"`
	Error          string `json:"error,omitempty"`
	Attempt        int    `json:"attempt"`
}

// UATRequestBody is the encrypted envelope alongside its plaintext.
type UATRequestBody struct {
	EncryptedSessionKey string `json:"encryptedSessionKey"`
	// DecryptedSessionKey is the base64 AES session key that was wrapped.
	DecryptedSessionKey string `json:"decryptedSessionKey"`
	EncryptedPayload    string `json:"encryptedPayload"`
	// DecryptedPayload is the plaintext JSON that was encrypted.
	DecryptedPayload string `json:"decryptedPayload"`
	KeyVersion       string `json:"keyVersion"`
	IV               string `json:"iv"`
}

// UATBundle is the complete submission.
type UATBundle struct {
	GeneratedAt time.Time `json:"generatedAt"`
	Provider    string    `json:"provider"`
	BaseURL     string    `json:"baseUrl"`

	Encryption UATEncryptionSummary `json:"encryption"`

	Sections []UATSection `json:"sections"`
	Answers  []UATAnswer  `json:"functionalAnswers"`

	// Readiness summarises how much of items 1-14 has been captured.
	Readiness UATReadiness `json:"readiness"`
}

// UATEncryptionSummary documents the cipher parameters actually in use.
type UATEncryptionSummary struct {
	SessionKeyAlgorithm string `json:"sessionKeyAlgorithm"`
	SessionKeySizeBits  int    `json:"sessionKeySizeBits"`
	IVSizeBytes         int    `json:"ivSizeBytes"`
	GCMTagSizeBits      int    `json:"gcmTagSizeBits"`
	RSAKeySizeBits      int    `json:"rsaKeySizeBits"`
	RSAPadding          string `json:"rsaPadding"`
	Encoding            string `json:"encoding"`
	KeyVersion          string `json:"keyVersion"`
	Note                string `json:"note,omitempty"`
}

// UATAnswer is a written response to checklist items 15-18.
type UATAnswer struct {
	Item     int      `json:"item"`
	Question string   `json:"question"`
	Answer   []string `json:"answer"`
}

// UATReadiness reports coverage of the log-capture sections.
type UATReadiness struct {
	TotalSections    int      `json:"totalSections"`
	Complete         int      `json:"complete"`
	Missing          int      `json:"missing"`
	MissingItemTitle []string `json:"missingItems,omitempty"`
}

// sectionSpec maps a checklist item onto the log query that satisfies it.
type sectionSpec struct {
	item        int
	title       string
	operation   string
	expectation string
	// match narrows the logs to those evidencing this specific outcome.
	match func(models.ProviderCallLog) bool
}

// checklistSections is the ordered list of items 1-14.
//
// Operation labels match what the Bharat Connect client records, so the query
// and the client cannot drift apart silently.
func checklistSections() []sectionSpec {
	succeeded := func(l models.ProviderCallLog) bool {
		return l.ResponseStatus == 200 && l.Error == "" && bodyIndicatesSuccess(l.ResponseRaw)
	}
	failed := func(l models.ProviderCallLog) bool {
		return l.Error != "" || l.ResponseStatus >= 400 || bodyIndicatesFailure(l.ResponseRaw)
	}
	pending := func(l models.ProviderCallLog) bool {
		return bodyIndicatesPending(l.ResponseRaw)
	}

	return []sectionSpec{
		{1, "Token Generation API - Success", bharatconnect.OpToken, "success", succeeded},
		{2, "Token Generation API - Failed", bharatconnect.OpToken, "failure", failed},
		{3, "Balance Check API - Success", bharatconnect.OpBalance, "success", succeeded},
		{4, "Balance Check API - Failed", bharatconnect.OpBalance, "failure", failed},
		{5, "Validation API - Success", bharatconnect.OpValidation, "success", succeeded},
		{6, "Validation API - Failed", bharatconnect.OpValidation, "failure", failed},
		{7, "View Bill API - Success", bharatconnect.OpViewBill, "success", succeeded},
		{8, "View Bill API - Failed", bharatconnect.OpViewBill, "failure", failed},
		{9, "Recharge API - Success", bharatconnect.OpPayment, "success", succeeded},
		{10, "Recharge API - Failed", bharatconnect.OpPayment, "failure", failed},
		{11, "Recharge API - Pending", bharatconnect.OpPayment, "pending", pending},
		{12, "Transaction Status Check API - Success", bharatconnect.OpStatus, "success", succeeded},
		{13, "Transaction Status Check API - Failed", bharatconnect.OpStatus, "failure", failed},
		{14, "Transaction Status Check API - Pending", bharatconnect.OpStatus, "pending", pending},
	}
}

// Bundle assembles the full UAT submission.
func (s *UATService) Bundle(ctx context.Context, perSection int) (*UATBundle, error) {
	if perSection <= 0 || perSection > 10 {
		perSection = 3
	}

	specs := checklistSections()

	// All candidate logs are loaded once and filtered in memory. The alternative
	// is 14 queries whose predicates would have to be expressed in SQL against
	// JSON response bodies, which is both slower and harder to keep correct.
	var logs []models.ProviderCallLog
	err := s.db.WithContext(ctx).
		Where("provider = ?", models.ProviderBharatConnect).
		Order("created_at DESC").
		Limit(2000).
		Find(&logs).Error
	if err != nil {
		return nil, fmt.Errorf("uat: load provider logs: %w", err)
	}

	byOperation := map[string][]models.ProviderCallLog{}
	for _, l := range logs {
		byOperation[l.Operation] = append(byOperation[l.Operation], l)
	}

	sections := make([]UATSection, 0, len(specs))
	readiness := UATReadiness{TotalSections: len(specs)}

	for _, spec := range specs {
		section := UATSection{
			Item:        spec.item,
			Title:       spec.title,
			Operation:   spec.operation,
			Expectation: spec.expectation,
			Status:      "missing",
		}

		for _, l := range byOperation[spec.operation] {
			if !spec.match(l) {
				continue
			}
			section.Evidence = append(section.Evidence, toEvidence(l))
			if len(section.Evidence) >= perSection {
				break
			}
		}

		if len(section.Evidence) > 0 {
			section.Status = "complete"
			readiness.Complete++
		} else {
			readiness.Missing++
			readiness.MissingItemTitle = append(readiness.MissingItemTitle, spec.title)
			section.Note = "No captured call matches this case yet. Exercise the scenario against " +
				"the UAT environment; every call is recorded automatically."
		}

		sections = append(sections, section)
	}

	return &UATBundle{
		GeneratedAt: time.Now().UTC(),
		Provider:    string(models.ProviderBharatConnect),
		BaseURL:     s.bcCfg.BaseURL,
		Encryption:  s.encryptionSummary(),
		Sections:    sections,
		Answers:     s.functionalAnswers(),
		Readiness:   readiness,
	}, nil
}

func (s *UATService) encryptionSummary() UATEncryptionSummary {
	out := UATEncryptionSummary{
		SessionKeyAlgorithm: "AES-256-" + strings.ToUpper(s.suiteA),
		SessionKeySizeBits:  256,
		IVSizeBytes:         s.suiteI,
		GCMTagSizeBits:      128,
		RSAKeySizeBits:      2048,
		RSAPadding:          "RSA/ECB/PKCS1Padding",
		Encoding:            "Base64",
		KeyVersion:          s.bcCfg.KeyVersion,
	}

	// The specification is self-inconsistent on IV length, so the bundle states
	// which value we send rather than leaving the reviewer to infer it.
	if s.suiteI != 16 {
		out.Note = fmt.Sprintf(
			"IV length is %d bytes. The specification prose and Java sample state 16 bytes, "+
				"while every sample request in the same document carries a 12-byte IV. "+
				"Confirm the expected length; it is a single configuration change.",
			s.suiteI,
		)
	}

	return out
}

// functionalAnswers produces items 15-18.
//
// The retry figures are read from the live ReconciliationConfig so the submitted
// answer always matches the behaviour in the deployed worker.
func (s *UATService) functionalAnswers() []UATAnswer {
	ladder := make([]string, 0, len(s.recon.BackoffSchedule))
	for _, d := range s.recon.BackoffSchedule {
		ladder = append(ladder, d.String())
	}
	ladderText := strings.Join(ladder, ", ")

	total := time.Duration(0)
	if len(s.recon.BackoffSchedule) > 0 {
		total = s.recon.BackoffSchedule[len(s.recon.BackoffSchedule)-1]
	}

	return []UATAnswer{
		{
			Item:     15,
			Question: "Handling of Pending Cases",
			Answer: []string{
				"A transaction is identified as pending when the Payment API returns data.status " +
					"of SUCCESSPENDING, when the Status API returns RECHARGESUCCESSPENDING, or when " +
					"the response is one of the documented inconclusive results: HTTP 5xx, a gateway " +
					"timeout, or success=false with the text \"Sorry! The transaction couldn't succeed\" " +
					"or \"Something went wrong. Please try again later.\"",
				"On identifying a pending outcome the transaction row is written with status " +
					"'pending', the retailer wallet debit is retained as a hold and is never reversed, " +
					"and next_status_check_at is scheduled. The provider reqid is stored as the " +
					"idempotency key so the Status API can later be queried by the same identifier.",
				"The transaction stays pending until a Status API call returns a terminal verdict. " +
					fmt.Sprintf("The automated window is %s from creation across %d attempts; ", total, s.recon.MaxAttempts) +
					"beyond that the transaction is flagged needs_manual_review and excluded from " +
					"further automatic polling.",
				fmt.Sprintf("Status checks are triggered by a background worker that sweeps every %s "+
					"for rows whose next_status_check_at has elapsed. Rows are claimed with "+
					"SELECT ... FOR UPDATE SKIP LOCKED so multiple instances never poll the same "+
					"transaction concurrently.", s.recon.Interval),
				"On RECHARGESUCCESS the transaction is marked success and the provider references " +
					"(txId, mobikwikStamp, operatorRefNo) are persisted for the receipt. On " +
					"RECHARGEFAILURE it is marked failed and the wallet hold is reversed by a " +
					"compensating ledger credit, guarded so a reversal can only ever be written once. " +
					"Both updates and the ledger write happen in one database transaction.",
			},
		},
		{
			Item:     16,
			Question: "Handling of Timeout Cases",
			Answer: []string{
				fmt.Sprintf("A timeout is detected at the transport layer. The HTTP client runs with a "+
					"%s ceiling and classifies context deadline exceedance, net.Error timeouts, "+
					"HTTP 408, 504 and 429 as inconclusive rather than failed.", s.bcCfg.Timeout),
				"On timeout the transaction is persisted with timed_out set true and status pending, " +
					"the wallet hold is retained, and a status check is scheduled. No reversal is " +
					"performed, because a timeout means we never learned the provider's verdict and " +
					"the payment may well have completed at the operator.",
				"Status checks are initiated automatically on the same ladder as pending cases. The " +
					"original request is never blindly replayed; resolution is always via the Status " +
					"API keyed on our reqid, so a retry cannot double-charge.",
				"The three states are distinguished explicitly. A timeout is no verdict received and " +
					"is recorded in the timed_out column. Pending is a verdict of 'accepted but not " +
					"settled'. Failed is a definitive rejection: a 4xx other than 401, or a documented " +
					"terminal failure status. Only the failed case reverses the hold. An unrecognised " +
					"provider status code is deliberately treated as pending, never failed, so an " +
					"unknown code can never trigger an incorrect automatic refund.",
				"Final reconciliation is by the Status API verdict. Anything still unresolved after " +
					"the ladder is exhausted is escalated to manual review with the hold intact and " +
					"surfaced on an operations endpoint that reports pending, processing, timed-out " +
					"and awaiting-review counts.",
			},
		},
		{
			Item:     17,
			Question: "Interval for Status Check on Pending/Timeout Cases",
			Answer: []string{
				fmt.Sprintf("The retry ladder, measured from transaction creation, is: %s.", ladderText),
				fmt.Sprintf("Maximum attempts: %d.", s.recon.MaxAttempts),
				fmt.Sprintf("Total automated retry window: %s from creation, after which the "+
					"transaction is escalated for manual review rather than polled indefinitely.", total),
				"The ladder is short at first and lengthens progressively. Early checks resolve the " +
					"common case where the operator settles within seconds, without a perceptible wait " +
					"for the retailer. Later checks stretch toward the operator's own settlement window " +
					"while keeping call volume on the provider low. Each due time is anchored to the " +
					"transaction's creation timestamp rather than to the previous attempt, so a worker " +
					"outage does not silently push the whole schedule later: on recovery every overdue " +
					"check fires immediately. A floor prevents scheduling in the past, which would " +
					"otherwise busy-loop the worker on an old row.",
			},
		},
		{
			Item:     18,
			Question: "Handling of Token Expiry Cases",
			Answer: []string{
				"Expiry is detected three ways. Proactively, the cached token's expiryTime is " +
					fmt.Sprintf("compared against now plus a %s safety window, so a token is never "+
						"presented if it could expire mid-flight. Reactively, an HTTP 401 is treated as "+
						"an auth rejection, and so is an HTTP 200 body carrying "+
						"message.code \"401\", which is the form this provider actually returns.",
						s.bcCfg.TokenSafetyWindow),
				"On detection the cached token is invalidated and a new one is minted via " +
					"POST /recharge/v1/verify/retailer using clientId and clientSecret. The token is " +
					"persisted in the database rather than held in memory, so a restart or redeploy " +
					"does not mint a fresh token and walk into the 100-per-day cap.",
				"The failed request is retried exactly once with the refreshed token. A second " +
					"consecutive rejection is surfaced as an error rather than retried, because it " +
					"indicates a credential fault rather than an expiry, and further retries would " +
					"consume the daily token quota against a permanent failure.",
				fmt.Sprintf("Fail-safes: token acquisition is serialised behind a mutex so a burst of "+
					"concurrent requests on a cold cache mints one token rather than many, which also "+
					"avoids the provider's 5-minute rotation invalidating tokens that in-flight "+
					"requests are still using. Issuance is counted per UTC day and refused locally at "+
					"%d tokens with an explicit quota-exhausted error instead of being throttled "+
					"upstream. The counter survives invalidation, so repeated invalidation cannot be "+
					"used to bypass the cap. Token values are masked in all audit records and logs.",
					bharatconnect.DailyTokenQuota),
			},
		},
	}
}

func toEvidence(l models.ProviderCallLog) UATEvidence {
	return UATEvidence{
		CapturedAt: l.CreatedAt,
		Curl:       l.CurlEquivalent,
		RequestURL: l.URL,
		RequestBody: UATRequestBody{
			EncryptedSessionKey: l.RequestEncryptedSessionKey,
			DecryptedSessionKey: l.RequestSessionKeyB64,
			EncryptedPayload:    l.RequestEncryptedPayload,
			DecryptedPayload:    l.RequestPlaintext,
			KeyVersion:          l.RequestKeyVersion,
			IV:                  l.RequestIV,
		},
		ResponseStatus: l.ResponseStatus,
		Response:       firstNonEmptyStr(l.ResponsePlaintext, l.ResponseRaw),
		DurationMS:     l.DurationMS,
		Error:          l.Error,
		Attempt:        l.Attempt,
	}
}

// bodyIndicatesSuccess reports whether a captured response body reads as a
// provider success.
func bodyIndicatesSuccess(body string) bool {
	b := strings.ToLower(body)
	if !strings.Contains(b, `"success":true`) && !strings.Contains(b, `"success": true`) {
		return false
	}
	// A success envelope can still wrap a pending transaction, which belongs to a
	// different checklist item.
	return !bodyIndicatesPending(body)
}

func bodyIndicatesFailure(body string) bool {
	b := strings.ToLower(body)
	return strings.Contains(b, `"success":false`) || strings.Contains(b, `"success": false`)
}

// bodyIndicatesPending detects the documented pending statuses.
func bodyIndicatesPending(body string) bool {
	b := strings.ToLower(body)
	for _, needle := range []string{
		"successpending",
		"rechargesuccesspending",
		"couldn't succeed",
		"couldn’t succeed",
		"something went wrong",
	} {
		if strings.Contains(b, needle) {
			return true
		}
	}
	return false
}

func firstNonEmptyStr(vals ...string) string {
	for _, v := range vals {
		if strings.TrimSpace(v) != "" {
			return v
		}
	}
	return ""
}

// OperationCoverage reports how many calls were captured per operation, which is
// a quick way to see what still needs exercising.
func (s *UATService) OperationCoverage(ctx context.Context) (map[string]int64, error) {
	var rows []struct {
		Operation string
		Count     int64
	}
	err := s.db.WithContext(ctx).
		Model(&models.ProviderCallLog{}).
		Select("operation, count(*) as count").
		Where("provider = ?", models.ProviderBharatConnect).
		Group("operation").
		Scan(&rows).Error
	if err != nil {
		return nil, fmt.Errorf("uat: operation coverage: %w", err)
	}

	out := make(map[string]int64, len(rows))
	for _, r := range rows {
		out[r.Operation] = r.Count
	}

	// Operations with no calls are reported as zero rather than omitted, so a gap
	// is visible instead of invisible.
	for _, op := range bharatconnect.AllOperations() {
		if _, ok := out[op]; !ok {
			out[op] = 0
		}
	}

	keys := make([]string, 0, len(out))
	for k := range out {
		keys = append(keys, k)
	}
	sort.Strings(keys)

	return out, nil
}
