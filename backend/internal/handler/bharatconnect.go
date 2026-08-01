package handler

import (
	"errors"
	"log/slog"
	"net/http"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"github.com/shopspring/decimal"

	"github.com/utilipay/backend/internal/httpx"
	"github.com/utilipay/backend/internal/middleware"
	"github.com/utilipay/backend/internal/models"
	"github.com/utilipay/backend/internal/provider"
	"github.com/utilipay/backend/internal/provider/bharatconnect"
	"github.com/utilipay/backend/internal/service"
)

// BharatConnectHandler serves the recharge and bill-payment endpoints.
//
// The flow mirrors the provider's mandated call order:
// prepaid is Validation then Payment then Status; postpaid is View Bill then
// Payment then Status.
type BharatConnectHandler struct {
	client *bharatconnect.Client
	txns   *service.TransactionService
	biller *service.BillerService
	log    *slog.Logger
}

// NewBharatConnectHandler builds a BharatConnectHandler.
func NewBharatConnectHandler(client *bharatconnect.Client, txns *service.TransactionService, biller *service.BillerService, log *slog.Logger) *BharatConnectHandler {
	return &BharatConnectHandler{client: client, txns: txns, biller: biller, log: log}
}

// Categories lists live Bharat Connect categories.
//
// The UI compliance checklist requires the category screen to show all live
// categories, so this is driven by the biller master rather than hardcoded.
func (h *BharatConnectHandler) Categories(c *gin.Context) {
	categories, err := h.biller.Categories(c.Request.Context())
	if err != nil {
		h.log.Error("list categories failed", slog.Any("error", err))
		httpx.Internal(c)
		return
	}
	httpx.OK(c, categories)
}

// Billers lists billers, optionally filtered by category.
func (h *BharatConnectHandler) Billers(c *gin.Context) {
	billers, err := h.biller.List(c.Request.Context(), service.BillerFilter{
		Category: c.Query("category"),
		Search:   c.Query("search"),
	})
	if err != nil {
		h.log.Error("list billers failed", slog.Any("error", err))
		httpx.Internal(c)
		return
	}
	httpx.OK(c, billers)
}

// Plans proxies the provider's recharge plan catalogue.
func (h *BharatConnectHandler) Plans(c *gin.Context) {
	operatorID := c.Query("operatorId")
	circleID := c.Query("circleId")
	if operatorID == "" || circleID == "" {
		httpx.BadRequest(c, "operatorId and circleId are required")
		return
	}

	plans, err := h.client.Plans(c.Request.Context(), bharatconnect.PlansRequest{
		OperatorID: operatorID,
		CircleID:   circleID,
		PlanType:   c.Query("planType"),
	})
	if err != nil {
		h.respondUpstream(c, "plans", err)
		return
	}
	httpx.OK(c, plans)
}

// Circles lists the provider's circle reference data.
func (h *BharatConnectHandler) Circles(c *gin.Context) {
	httpx.OK(c, bharatconnect.Circles())
}

// --- Validation ---

type validateRequest struct {
	Amount     string            `json:"amount" binding:"required"`
	Connection string            `json:"connection" binding:"required"`
	OperatorID string            `json:"operatorId" binding:"required"`
	CircleID   string            `json:"circleId"`
	PlanCode   string            `json:"planCode"`
	AdParams   map[string]string `json:"adParams"`
}

// Validate runs pre-payment validation for a prepaid recharge.
//
// No wallet movement happens here: validation is an enquiry, and debiting before
// the customer has confirmed would strand float on an abandoned journey.
func (h *BharatConnectHandler) Validate(c *gin.Context) {
	retailerID, ok := middleware.RetailerID(c)
	if !ok {
		httpx.Forbidden(c, "No retailer profile linked to this account")
		return
	}

	var req validateRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		httpx.BadRequest(c, "amount, connection and operatorId are required")
		return
	}

	res, err := h.client.Validate(c.Request.Context(), bharatconnect.ValidationRequest{
		Amount:     req.Amount,
		Connection: req.Connection,
		OperatorID: req.OperatorID,
		CircleID:   req.CircleID,
		PlanCode:   req.PlanCode,
		AdParams:   req.AdParams,
		RetailerID: &retailerID,
	})
	if err != nil {
		h.respondUpstream(c, "validation", err)
		return
	}

	httpx.OK(c, gin.H{
		"status":      res.Status,
		"description": res.Description,
		"validated":   res.Outcome == provider.OutcomeSuccess,
	})
}

// --- View Bill ---

type viewBillRequest struct {
	Connection string            `json:"connection" binding:"required"`
	OperatorID string            `json:"operatorId" binding:"required"`
	CircleID   string            `json:"circleId"`
	AdParams   map[string]string `json:"adParams"`
}

// ViewBill fetches a bill and stores it server-side.
//
// The fetched amount is persisted and the client receives a reference. Payment
// then quotes that reference, so the amount cannot be altered between fetch and
// pay by a tampered client.
func (h *BharatConnectHandler) ViewBill(c *gin.Context) {
	retailerID, ok := middleware.RetailerID(c)
	if !ok {
		httpx.Forbidden(c, "No retailer profile linked to this account")
		return
	}

	var req viewBillRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		httpx.BadRequest(c, "connection and operatorId are required")
		return
	}

	res, err := h.client.ViewBill(c.Request.Context(), bharatconnect.ViewBillRequest{
		Connection: req.Connection,
		OperatorID: req.OperatorID,
		CircleID:   req.CircleID,
		AdParams:   req.AdParams,
		RetailerID: &retailerID,
	})
	if err != nil {
		h.respondUpstream(c, "view_bill", err)
		return
	}
	if len(res.Bills) == 0 {
		httpx.Fail(c, http.StatusNotFound, httpx.CodeNotFound, "No bill is currently due for this connection")
		return
	}

	fetch, err := h.biller.StoreFetch(c.Request.Context(), service.StoreFetchInput{
		RetailerID: retailerID,
		OperatorID: req.OperatorID,
		Connection: req.Connection,
		CircleID:   req.CircleID,
		Bill:       res.Bills[0],
		AdParams:   req.AdParams,
	})
	if err != nil {
		h.log.Error("store bill fetch failed", slog.Any("error", err))
		httpx.Internal(c)
		return
	}

	httpx.OK(c, gin.H{
		"requestRef":    fetch.RequestRef,
		"customerName":  fetch.CustomerName,
		"billNumber":    fetch.BillNumber,
		"billAmount":    fetch.BillAmount,
		"billDate":      fetch.BillDate,
		"dueDate":       fetch.DueDate,
		"acceptPayment": res.Bills[0].AcceptPayment,
		"acceptPartPay": res.Bills[0].AcceptPartPay,
		"expiresAt":     fetch.ExpiresAt,
	})
}

// --- Payment ---

type payRequest struct {
	// RequestRef ties the payment to a stored bill fetch. Required for postpaid.
	RequestRef string `json:"requestRef"`

	Connection string `json:"connection" binding:"required"`
	OperatorID string `json:"operatorId" binding:"required"`
	CircleID   string `json:"circleId"`
	Amount     string `json:"amount" binding:"required"`

	CustomerMobile     string `json:"customerMobile" binding:"required"`
	RemitterName       string `json:"remitterName" binding:"required"`
	PaymentMode        string `json:"paymentMode" binding:"required"`
	PaymentRefID       string `json:"paymentRefId"`
	PaymentAccountInfo string `json:"paymentAccountInfo"`

	Category   string `json:"category"`
	BillerName string `json:"billerName"`
}

// Pay submits a recharge or bill payment.
//
// The wallet is debited before the provider is called, and that debit is only
// reversed on a definitive rejection. An inconclusive result leaves the hold in
// place and hands the transaction to the reconciliation worker.
func (h *BharatConnectHandler) Pay(c *gin.Context) {
	retailerID, ok := middleware.RetailerID(c)
	if !ok {
		httpx.Forbidden(c, "No retailer profile linked to this account")
		return
	}

	var req payRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		httpx.BadRequest(c, "connection, operatorId, amount, customerMobile, remitterName and paymentMode are required")
		return
	}

	amount, err := decimal.NewFromString(strings.TrimSpace(req.Amount))
	if err != nil || amount.LessThanOrEqual(decimal.Zero) {
		httpx.BadRequest(c, "amount must be a positive number")
		return
	}

	// When a bill fetch reference is supplied, the server-side amount is
	// authoritative. This is what prevents a tampered client from paying less
	// than the biller demanded while showing the customer the full figure.
	if req.RequestRef != "" {
		fetch, ferr := h.biller.ConsumableFetch(c.Request.Context(), req.RequestRef, retailerID)
		if ferr != nil {
			httpx.FromError(c, ferr)
			return
		}
		if !fetch.BillAmount.Equal(amount) {
			httpx.Conflict(c, "Amount does not match the fetched bill. Re-fetch the bill and try again.")
			return
		}
	}

	category := models.ServiceCategoryName(req.Category)
	if category == "" {
		category = models.CategoryBBPS
	}
	serviceName := req.BillerName
	if serviceName == "" {
		serviceName = "Bharat Connect Bill Payment"
	}

	txn, err := h.txns.Begin(c.Request.Context(), service.BeginInput{
		RetailerID:     retailerID,
		Category:       category,
		Service:        serviceName,
		Mode:           req.PaymentMode,
		Amount:         amount,
		DebitWallet:    true,
		Provider:       models.ProviderBharatConnect,
		IdempotencyKey: c.GetHeader("Idempotency-Key"),
		Metadata: map[string]any{
			"connection":     req.Connection,
			"operatorId":     req.OperatorID,
			"circleId":       req.CircleID,
			"customerMobile": req.CustomerMobile,
			"remitterName":   req.RemitterName,
			"requestRef":     req.RequestRef,
		},
	})
	if err != nil {
		httpx.FromError(c, err)
		return
	}

	// A replayed idempotent request returns the original outcome untouched.
	if txn.Status.IsTerminal() {
		httpx.OK(c, receiptFor(txn))
		return
	}

	res, payErr := h.client.Pay(c.Request.Context(), bharatconnect.PaymentRequest{
		Connection:         req.Connection,
		OperatorID:         req.OperatorID,
		CircleID:           req.CircleID,
		Amount:             req.Amount,
		ReqID:              bharatconnect.NewReqID("UP"),
		CustomerMobile:     req.CustomerMobile,
		RemitterName:       req.RemitterName,
		PaymentRefID:       req.PaymentRefID,
		PaymentMode:        req.PaymentMode,
		PaymentAccountInfo: req.PaymentAccountInfo,
		TransactionID:      &txn.ID,
		RetailerID:         &retailerID,
	})

	settle := service.SettleInput{Outcome: provider.OutcomeTimeout}
	if res != nil {
		settle.Outcome = res.Outcome
		settle.ProviderTxnID = res.TxID
		settle.ProviderRef = res.MobikwikStamp
		settle.StatusCode = firstNonEmpty(res.Code, res.Status)
		settle.Message = res.Message
	}
	if payErr != nil {
		settle.Message = firstNonEmpty(settle.Message, payErr.Error())
		if settle.Outcome == provider.OutcomeTimeout {
			settle.TimedOut = true
		}
	}

	updated, err := h.txns.Settle(c.Request.Context(), txn.ID, settle)
	if err != nil {
		h.log.Error("settle payment failed",
			slog.String("txnId", txn.TxnID), slog.Any("error", err))
		httpx.Internal(c)
		return
	}

	if req.RequestRef != "" && updated.Status != models.TxStatusFailed {
		// Marking the fetch consumed stops a second payment against one bill.
		if err := h.biller.ConsumeFetch(c.Request.Context(), req.RequestRef, updated.ID); err != nil {
			h.log.Warn("mark bill fetch consumed failed", slog.Any("error", err))
		}
	}

	httpx.OK(c, receiptFor(updated))
}

// --- Status ---

// Status polls and refreshes a transaction's state.
func (h *BharatConnectHandler) Status(c *gin.Context) {
	retailerID, ok := middleware.RetailerID(c)
	if !ok {
		httpx.Forbidden(c, "No retailer profile linked to this account")
		return
	}

	txn, err := h.txns.GetByTxnID(c.Request.Context(), c.Param("txnId"), &retailerID)
	if err != nil {
		httpx.FromError(c, err)
		return
	}

	// A terminal transaction needs no upstream call.
	if txn.Status.IsTerminal() {
		httpx.OK(c, receiptFor(txn))
		return
	}

	reference := firstNonEmpty(txn.ProviderTxnID, txn.ProviderRef, txn.TxnID)
	res, statusErr := h.client.Status(c.Request.Context(), bharatconnect.StatusRequest{
		TxID:          reference,
		TransactionID: &txn.ID,
		RetailerID:    &retailerID,
	})

	settle := service.SettleInput{Outcome: provider.OutcomePending}
	if res != nil {
		settle.Outcome = res.Outcome
		settle.ProviderTxnID = res.TxID
		settle.ProviderRef = res.MobikwikStamp
		settle.StatusCode = firstNonEmpty(res.Code, res.Status)
		settle.Message = firstNonEmpty(res.Description, res.Message)
	}
	if statusErr != nil {
		settle.Message = firstNonEmpty(settle.Message, statusErr.Error())
	}

	updated, err := h.txns.Settle(c.Request.Context(), txn.ID, settle)
	if err != nil {
		h.log.Error("settle status failed", slog.Any("error", err))
		httpx.Internal(c)
		return
	}
	httpx.OK(c, receiptFor(updated))
}

// Receipt returns the compliance-complete receipt for a transaction.
//
// The UI compliance checklist requires the receipt to carry the Bharat Connect
// transaction ID and the CCF, so both are always present in the payload even
// when empty.
func (h *BharatConnectHandler) Receipt(c *gin.Context) {
	var retailerScope *uuid.UUID
	if middleware.CurrentRole(c) == models.RoleRetailer {
		id, ok := middleware.RetailerID(c)
		if !ok {
			httpx.Forbidden(c, "No retailer profile linked to this account")
			return
		}
		retailerScope = &id
	}

	txn, err := h.txns.GetByTxnID(c.Request.Context(), c.Param("txnId"), retailerScope)
	if err != nil {
		httpx.FromError(c, err)
		return
	}
	httpx.OK(c, receiptFor(txn))
}

// receiptFor shapes a transaction into the receipt contract the UI renders.
func receiptFor(txn *models.Transaction) gin.H {
	return gin.H{
		"txnId":              txn.TxnID,
		"status":             txn.Status,
		"category":           txn.Category,
		"service":            txn.Service,
		"amount":             txn.Amount,
		"commission":         txn.Commission,
		"mode":               txn.Mode,
		"providerTxnId":      txn.ProviderTxnID,
		"providerRef":        txn.ProviderRef,
		"bharatConnectTxnId": txn.BharatConnectTxnID,
		"ccf":                txn.CCF,
		"statusCode":         txn.ProviderStatusCode,
		"message":            txn.ProviderMessage,
		"needsStatusCheck":   !txn.Status.IsTerminal(),
		"needsManualReview":  txn.NeedsManualReview,
		"createdAt":          txn.CreatedAt,
		"completedAt":        txn.CompletedAt,
		"metadata":           txn.Metadata,
	}
}

// respondUpstream maps a provider error onto an HTTP response.
//
// A pending or timed-out enquiry is reported as 503 rather than 500: the request
// was well-formed and retrying is the correct client behaviour.
func (h *BharatConnectHandler) respondUpstream(c *gin.Context, op string, err error) {
	// A locally rejected request is the caller's to fix, so it must not be
	// reported as an upstream fault. This is checked first because the generic
	// outcome classifier deliberately defaults unknown errors to "inconclusive",
	// which would otherwise mask a missing field as a service outage.
	if errors.Is(err, bharatconnect.ErrInvalidRequest) {
		// The wrapped error accumulates package and operation prefixes on its way
		// up. Only the final clause is meaningful to a user, so the rest is
		// trimmed rather than shown verbatim.
		msg := err.Error()
		if idx := strings.LastIndex(msg, "invalid request: "); idx >= 0 {
			msg = msg[idx+len("invalid request: "):]
		}
		httpx.BadRequest(c, "Request is incomplete: "+msg)
		return
	}
	if errors.Is(err, provider.ErrIntegrationDisabled) {
		httpx.Unavailable(c, "This service is not enabled")
		return
	}

	var apiErr *provider.APIError
	if errors.As(err, &apiErr) {
		// A provider rejection is the customer's or biller's problem to see, so
		// the upstream message is surfaced rather than masked.
		httpx.Fail(c, http.StatusBadGateway, httpx.CodeUpstream, apiErr.Message)
		return
	}

	switch provider.OutcomeOf(err) {
	case provider.OutcomePending, provider.OutcomeTimeout:
		// An upstream timeout is the most operationally important failure mode
		// there is, so it is logged rather than silently converted into a 503.
		// Without this the cause of a user-visible outage is invisible.
		h.log.Error("upstream call was inconclusive",
			slog.String("op", op), slog.Any("error", err))
		httpx.Unavailable(c, "The service is not responding right now. Please try again shortly.")
	default:
		h.log.Error("upstream call failed", slog.String("op", op), slog.Any("error", err))
		httpx.Fail(c, http.StatusBadGateway, httpx.CodeUpstream, "The service could not complete this request")
	}
}

// ComplaintTargets returns the complaint-registration endpoints.
//
// The UI compliance checklist mandates linking MobiKwik's Bharat Connect
// complaint system and offering both lookup modes, so the URLs live here rather
// than being hardcoded in the frontend.
func (h *BharatConnectHandler) ComplaintTargets(c *gin.Context) {
	httpx.OK(c, gin.H{
		"desktopUrl": "https://www.mobikwik.com/help/bbpscomplaint",
		"mobileUrl":  "https://m.mobikwik.com/help/createticket/bbpscomplaint",
		"lookupModes": []gin.H{
			{"id": "mobile_date", "label": "Mobile number and date"},
			{"id": "reference", "label": "Transaction reference ID"},
		},
	})
}

// TransactionHistory serves the compliance-mandated history search.
//
// Both required lookup modes are supported: mobile number plus date range, and
// transaction reference.
func (h *BharatConnectHandler) TransactionHistory(c *gin.Context) {
	retailerID, ok := middleware.RetailerID(c)
	if !ok {
		httpx.Forbidden(c, "No retailer profile linked to this account")
		return
	}

	filter := service.TransactionFilter{
		RetailerID: &retailerID,
		Category:   c.Query("category"),
		Status:     c.Query("status"),
		Reference:  c.Query("reference"),
		Mobile:     c.Query("mobile"),
		Search:     c.Query("search"),
		Page:       queryIntDefault(c, "page", 1),
		PageSize:   queryIntDefault(c, "pageSize", 25),
	}
	if from, err := parseDateQuery(c.Query("from")); err == nil && from != nil {
		filter.From = from
	}
	if to, err := parseDateQuery(c.Query("to")); err == nil && to != nil {
		filter.To = to
	}

	page, err := h.txns.List(c.Request.Context(), filter)
	if err != nil {
		h.log.Error("transaction history failed", slog.Any("error", err))
		httpx.Internal(c)
		return
	}
	httpx.Paginated(c, page.Items, page.Page, page.Size, page.Total)
}

// parseDateQuery accepts a date or a full RFC3339 timestamp.
func parseDateQuery(raw string) (*time.Time, error) {
	raw = strings.TrimSpace(raw)
	if raw == "" {
		return nil, nil
	}
	for _, layout := range []string{time.RFC3339, "2006-01-02"} {
		if t, err := time.Parse(layout, raw); err == nil {
			return &t, nil
		}
	}
	return nil, errors.New("unrecognised date format")
}

func firstNonEmpty(vals ...string) string {
	for _, v := range vals {
		if strings.TrimSpace(v) != "" {
			return v
		}
	}
	return ""
}
