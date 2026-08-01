package handler

import (
	"errors"
	"log/slog"
	"net/http"
	"strings"

	"github.com/gin-gonic/gin"
	"github.com/shopspring/decimal"

	"github.com/utilipay/backend/internal/httpx"
	"github.com/utilipay/backend/internal/middleware"
	"github.com/utilipay/backend/internal/models"
	"github.com/utilipay/backend/internal/provider"
	"github.com/utilipay/backend/internal/provider/aeps"
	"github.com/utilipay/backend/internal/service"
)

// AEPSHandler serves the Aadhaar Enabled Payment System endpoints.
type AEPSHandler struct {
	client   *aeps.Client
	txns     *service.TransactionService
	retailer *service.RetailerService
	log      *slog.Logger
}

// NewAEPSHandler builds an AEPSHandler.
func NewAEPSHandler(client *aeps.Client, txns *service.TransactionService, retailer *service.RetailerService, log *slog.Logger) *AEPSHandler {
	return &AEPSHandler{client: client, txns: txns, retailer: retailer, log: log}
}

// Capabilities reports which AEPS operations are live.
//
// The frontend reads this to disable controls rather than letting a retailer
// start a flow that cannot complete.
func (h *AEPSHandler) Capabilities(c *gin.Context) {
	httpx.OK(c, h.client.Capabilities())
}

// Onboard starts provider-hosted AEPS merchant KYC and returns the redirect URL.
//
// This is the one AEPS operation the provider documentation fully specifies.
func (h *AEPSHandler) Onboard(c *gin.Context) {
	retailerID, ok := middleware.RetailerID(c)
	if !ok {
		httpx.Forbidden(c, "No retailer profile linked to this account")
		return
	}

	profile, err := h.retailer.Profile(c.Request.Context(), retailerID)
	if err != nil {
		httpx.FromError(c, err)
		return
	}

	// The provider requires these fields; failing here gives a far clearer
	// message than the provider's generic rejection.
	var missing []string
	if strings.TrimSpace(profile.Phone) == "" {
		missing = append(missing, "mobile number")
	}
	if strings.TrimSpace(profile.Email) == "" {
		missing = append(missing, "email address")
	}
	if strings.TrimSpace(profile.ShopName) == "" {
		missing = append(missing, "shop or firm name")
	}
	if len(missing) > 0 {
		httpx.BadRequest(c, "Complete your profile first. Missing: "+strings.Join(missing, ", "))
		return
	}

	res, err := h.client.Onboard(c.Request.Context(), aeps.OnboardRequest{
		Mobile:       profile.Phone,
		MerchantCode: profile.MerchantCode,
		FirmName:     profile.ShopName,
		Email:        profile.Email,
		// A retailer who has never completed onboarding is a new registration;
		// otherwise the provider resumes the existing journey.
		IsNew:      profile.AEPSOnboardStatus == models.OnboardNotStarted,
		RetailerID: &retailerID,
	})
	if err != nil {
		h.respondUpstream(c, "onboard", err)
		return
	}

	if err := h.retailer.MarkAEPSOnboarding(c.Request.Context(), retailerID, res.OnboardPending); err != nil {
		h.log.Warn("record aeps onboarding state failed", slog.Any("error", err))
	}

	httpx.OK(c, gin.H{
		"redirectUrl":    res.RedirectURL,
		"onboardPending": res.OnboardPending,
		"message":        res.Message,
	})
}

// OnboardCallback receives the provider's post-KYC redirect.
//
// It is deliberately unauthenticated: the provider redirects the retailer's
// browser here and carries no session. Because of that it is treated as
// untrusted input and only ever records a pending state; the authoritative
// status comes from the provider on the next onboarding call.
func (h *AEPSHandler) OnboardCallback(c *gin.Context) {
	merchantCode := firstNonEmpty(c.Query("merchantcode"), c.Query("merchantCode"))
	if merchantCode == "" {
		httpx.BadRequest(c, "merchantcode is required")
		return
	}

	if err := h.retailer.RecordAEPSCallback(c.Request.Context(), merchantCode, c.Query("status")); err != nil {
		h.log.Warn("aeps callback processing failed",
			slog.String("merchantCode", merchantCode), slog.Any("error", err))
	}

	httpx.OK(c, gin.H{"message": "Onboarding status received"})
}

// transactRequest is an AEPS operation request.
type transactRequest struct {
	Operation string `json:"operation" binding:"required"`
	// AadhaarOrMobile is the customer identifier. It is masked before it reaches
	// storage or any log.
	AadhaarOrMobile string `json:"aadhaarOrMobile" binding:"required"`
	BankIIN         string `json:"bankIin"`
	BankName        string `json:"bankName"`
	Amount          string `json:"amount"`
	// PIDData is the base64 biometric capture block from an RD-service device.
	PIDData string `json:"pidData"`
}

// Transact performs an AEPS operation.
//
// Cash withdrawal and Aadhaar Pay move money and are debited before dispatch;
// balance enquiry and mini statement are enquiries and move none.
func (h *AEPSHandler) Transact(c *gin.Context) {
	retailerID, ok := middleware.RetailerID(c)
	if !ok {
		httpx.Forbidden(c, "No retailer profile linked to this account")
		return
	}

	var req transactRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		httpx.BadRequest(c, "operation and aadhaarOrMobile are required")
		return
	}

	op := models.AEPSOperation(req.Operation)
	if !op.Valid() {
		httpx.BadRequest(c, "Unknown AEPS operation")
		return
	}

	// Availability is checked before any wallet movement, so an unsupported
	// operation never leaves a hold behind.
	if !h.operationAvailable(op) {
		httpx.Unavailable(c, "This AEPS operation is not enabled yet. "+
			"The provider specification for it is still pending.")
		return
	}

	amount := decimal.Zero
	if op.RequiresAmount() {
		parsed, err := decimal.NewFromString(strings.TrimSpace(req.Amount))
		if err != nil || parsed.LessThanOrEqual(decimal.Zero) {
			httpx.BadRequest(c, "A positive amount is required for this operation")
			return
		}
		amount = parsed
	}

	profile, err := h.retailer.Profile(c.Request.Context(), retailerID)
	if err != nil {
		httpx.FromError(c, err)
		return
	}
	// AEPS is only permitted once the provider has completed merchant KYC.
	if profile.AEPSOnboardStatus != models.OnboardCompleted {
		httpx.Fail(c, http.StatusPreconditionRequired, httpx.CodeForbidden,
			"Complete AEPS onboarding before using AEPS services")
		return
	}

	txn, err := h.txns.Begin(c.Request.Context(), service.BeginInput{
		RetailerID:     retailerID,
		Category:       models.CategoryAEPS,
		Service:        aepsServiceName(op),
		Mode:           "Biometric",
		Amount:         amount,
		DebitWallet:    op.RequiresAmount(),
		Provider:       models.ProviderAEPSExcisoft,
		IdempotencyKey: c.GetHeader("Idempotency-Key"),
		Metadata: map[string]any{
			"operation": string(op),
			// Only the masked identifier is persisted: storing a full Aadhaar
			// number is a compliance problem.
			"customerRef": aeps.MaskIdentifier(req.AadhaarOrMobile),
			"bankName":    req.BankName,
			"bankIin":     req.BankIIN,
		},
	})
	if err != nil {
		httpx.FromError(c, err)
		return
	}
	if txn.Status.IsTerminal() {
		httpx.OK(c, receiptFor(txn))
		return
	}

	res, txErr := h.client.Transact(c.Request.Context(), aeps.TxnRequest{
		Operation:       string(op),
		AadhaarOrMobile: req.AadhaarOrMobile,
		BankIIN:         req.BankIIN,
		BankName:        req.BankName,
		Amount:          req.Amount,
		PIDData:         req.PIDData,
		ReferenceID:     txn.TxnID,
		MerchantCode:    profile.MerchantCode,
		RetailerID:      &retailerID,
	})

	settle := service.SettleInput{Outcome: provider.OutcomeTimeout}
	if res != nil {
		settle.Outcome = res.Outcome
		settle.ProviderRef = res.ProviderRef
		settle.StatusCode = res.StatusCode
		settle.Message = res.Message
		if res.Balance != "" {
			settle.ExtraMetadata = map[string]any{"customerBalance": res.Balance}
		}
		if len(res.MiniStatement) > 0 {
			if settle.ExtraMetadata == nil {
				settle.ExtraMetadata = map[string]any{}
			}
			settle.ExtraMetadata["miniStatement"] = res.MiniStatement
		}
	}
	if txErr != nil {
		settle.Message = firstNonEmpty(settle.Message, txErr.Error())
		if errors.Is(txErr, aeps.ErrNotImplemented) {
			// Nothing reached the provider, so this is safely terminal and the
			// hold is released immediately.
			settle.Outcome = provider.OutcomeFailed
		} else if settle.Outcome == provider.OutcomeTimeout {
			settle.TimedOut = true
		}
	}

	updated, err := h.txns.Settle(c.Request.Context(), txn.ID, settle)
	if err != nil {
		h.log.Error("settle aeps transaction failed",
			slog.String("txnId", txn.TxnID), slog.Any("error", err))
		httpx.Internal(c)
		return
	}

	if errors.Is(txErr, aeps.ErrNotImplemented) {
		httpx.Unavailable(c, "This AEPS operation is not enabled yet. "+
			"The provider specification for it is still pending.")
		return
	}

	httpx.OK(c, receiptFor(updated))
}

// operationAvailable reports whether the client can perform the operation.
func (h *AEPSHandler) operationAvailable(op models.AEPSOperation) bool {
	caps := h.client.Capabilities()
	switch op {
	case models.AEPSCashWithdrawal:
		return caps.CashWithdrawal
	case models.AEPSBalanceEnquiry:
		return caps.BalanceEnquiry
	case models.AEPSMiniStatement:
		return caps.MiniStatement
	case models.AEPSAadhaarPay:
		return caps.AadhaarPay
	default:
		return false
	}
}

// aepsServiceName maps an operation to the service name used for commission
// lookup, matching the seeded service catalogue.
func aepsServiceName(op models.AEPSOperation) string {
	switch op {
	case models.AEPSCashWithdrawal:
		return "AEPS Cash Withdrawal"
	case models.AEPSBalanceEnquiry:
		return "AEPS Balance Enquiry"
	case models.AEPSMiniStatement:
		return "AEPS Mini Statement"
	case models.AEPSAadhaarPay:
		return "Aadhaar Pay"
	default:
		return "AEPS"
	}
}

// Transactions lists the retailer's AEPS transaction history.
func (h *AEPSHandler) Transactions(c *gin.Context) {
	retailerID, ok := middleware.RetailerID(c)
	if !ok {
		httpx.Forbidden(c, "No retailer profile linked to this account")
		return
	}

	page, err := h.txns.List(c.Request.Context(), service.TransactionFilter{
		RetailerID: &retailerID,
		Category:   string(models.CategoryAEPS),
		Status:     c.Query("status"),
		Reference:  c.Query("reference"),
		Search:     c.Query("search"),
		Page:       queryIntDefault(c, "page", 1),
		PageSize:   queryIntDefault(c, "pageSize", 25),
	})
	if err != nil {
		h.log.Error("list aeps transactions failed", slog.Any("error", err))
		httpx.Internal(c)
		return
	}
	httpx.Paginated(c, page.Items, page.Page, page.Size, page.Total)
}

// Settlements lists AEPS settlement records for the retailer.
func (h *AEPSHandler) Settlements(c *gin.Context) {
	retailerID, ok := middleware.RetailerID(c)
	if !ok {
		httpx.Forbidden(c, "No retailer profile linked to this account")
		return
	}

	settlements, err := h.retailer.Settlements(c.Request.Context(), retailerID)
	if err != nil {
		h.log.Error("list settlements failed", slog.Any("error", err))
		httpx.Internal(c)
		return
	}
	httpx.OK(c, settlements)
}

// respondUpstream maps a provider error onto an HTTP response.
func (h *AEPSHandler) respondUpstream(c *gin.Context, op string, err error) {
	switch {
	case errors.Is(err, provider.ErrIntegrationDisabled):
		httpx.Unavailable(c, "AEPS is not enabled")
	case errors.Is(err, aeps.ErrNotImplemented):
		httpx.Unavailable(c, "This AEPS operation is not enabled yet")
	default:
		var apiErr *provider.APIError
		if errors.As(err, &apiErr) {
			httpx.Fail(c, http.StatusBadGateway, httpx.CodeUpstream, apiErr.Message)
			return
		}
		h.log.Error("aeps upstream call failed", slog.String("op", op), slog.Any("error", err))
		httpx.Fail(c, http.StatusBadGateway, httpx.CodeUpstream, "The AEPS service could not complete this request")
	}
}
