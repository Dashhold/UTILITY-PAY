package server

import (
	"fmt"
	"log/slog"
	"net/http"
	"strings"
	"sync"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"gorm.io/gorm/schema"

	"github.com/utilipay/backend/internal/httpx"
	"github.com/utilipay/backend/internal/middleware"
	"github.com/utilipay/backend/internal/models"
	"github.com/utilipay/backend/internal/service"
)

// registerAdminAPI mounts the admin surface.
func registerAdminAPI(g *gin.RouterGroup, deps Dependencies) {
	a := g.Group("/admin")
	a.Use(middleware.RequireRole(models.RoleAdmin))

	registerAdminDashboard(a, deps)
	registerAdminMasters(a, deps)
	registerAdminUsers(a, deps)
	registerAdminFunds(a, deps)
	registerAdminReports(a, deps)
}

func registerAdminDashboard(a *gin.RouterGroup, deps Dependencies) {
	a.GET("/dashboard", func(c *gin.Context) {
		ctx := c.Request.Context()

		stats, err := deps.TransactionService.Summary(ctx, nil)
		if err != nil {
			deps.Log.Error("admin dashboard stats failed", slog.Any("error", err))
			httpx.Internal(c)
			return
		}

		recentTxns, err := deps.TransactionService.List(ctx, service.TransactionFilter{Page: 1, PageSize: 10})
		if err != nil {
			deps.Log.Error("admin recent transactions failed", slog.Any("error", err))
			httpx.Internal(c)
			return
		}

		recentFunds, err := deps.FundService.List(ctx, service.FundRequestFilter{Page: 1, PageSize: 10})
		if err != nil {
			deps.Log.Error("admin recent fund requests failed", slog.Any("error", err))
			httpx.Internal(c)
			return
		}

		recentRetailers, err := deps.RetailerService.List(ctx, service.RetailerFilter{Page: 1, PageSize: 10})
		if err != nil {
			deps.Log.Error("admin recent retailers failed", slog.Any("error", err))
			httpx.Internal(c)
			return
		}

		pendingFunds, err := deps.FundService.PendingCount(ctx)
		if err != nil {
			deps.Log.Error("pending fund count failed", slog.Any("error", err))
			httpx.Internal(c)
			return
		}

		recon, err := deps.Reconciler.Summary(ctx)
		if err != nil {
			deps.Log.Error("reconciliation summary failed", slog.Any("error", err))
			httpx.Internal(c)
			return
		}

		serviceReport, err := deps.ReportService.ServiceReport(ctx, nil, nil, nil)
		if err != nil {
			deps.Log.Error("service report failed", slog.Any("error", err))
			httpx.Internal(c)
			return
		}

		announcements, err := deps.ContentService.Announcements(ctx, models.RoleAdmin)
		if err != nil {
			deps.Log.Error("announcements failed", slog.Any("error", err))
			httpx.Internal(c)
			return
		}

		httpx.OK(c, gin.H{
			"stats":               stats,
			"pendingFundRequests": pendingFunds,
			"reconciliation":      recon,
			"recentTransactions":  nonNilSlice(recentTxns.Items),
			"recentFundRequests":  nonNilSlice(recentFunds.Items),
			"recentRetailers":     nonNilSlice(recentRetailers.Items),
			"serviceAnalytics":    nonNilSlice(serviceReport),
			"announcements":       nonNilSlice(announcements),
			"systemStatus": gin.H{
				"aeps":          deps.AEPS.Capabilities(),
				"bharatConnect": deps.BharatConnect.Capabilities(),
			},
		})
	})
}

// registerAdminMasters mounts CRUD for every master-data resource.
//
// Each resource is registered through the same generic helper so validation,
// pagination and error mapping behave identically across all of them.
func registerAdminMasters(a *gin.RouterGroup, deps Dependencies) {
	db := deps.DB

	mountMaster(a, deps, masterSpec[models.ServiceCategory]{
		path:          "/service-categories",
		searchColumns: []string{"name", "description"},
		orderBy:       "sort_order ASC, name ASC",
	})
	mountMaster(a, deps, masterSpec[models.City]{
		path:          "/cities",
		searchColumns: []string{"name", "state"},
		orderBy:       "state ASC, name ASC",
	})
	mountMaster(a, deps, masterSpec[models.UserType]{
		path:          "/user-types",
		searchColumns: []string{"name", "description"},
		orderBy:       "name ASC",
	})
	mountMaster(a, deps, masterSpec[models.Service]{
		path:          "/services",
		searchColumns: []string{"name", "category", "api_provider"},
		orderBy:       "category ASC, name ASC",
	})
	mountMaster(a, deps, masterSpec[models.CommissionPlan]{
		path:          "/commission-plans",
		searchColumns: []string{"name", "user_type"},
		orderBy:       "name ASC",
	})
	mountMaster(a, deps, masterSpec[models.CommissionSlot]{
		path:          "/commission-slots",
		searchColumns: []string{"service", "user_type"},
		orderBy:       "service ASC, min_amount ASC",
	})
	mountMaster(a, deps, masterSpec[models.Announcement]{
		path:          "/announcements",
		searchColumns: []string{"title", "message"},
		orderBy:       "created_at DESC",
	})
	mountMaster(a, deps, masterSpec[models.TicketDepartment]{
		path:          "/ticket-departments",
		searchColumns: []string{"name", "description"},
		orderBy:       "name ASC",
	})
	mountMaster(a, deps, masterSpec[models.CompanyBank]{
		path:          "/company-banks",
		searchColumns: []string{"bank_name", "account_number", "ifsc"},
		orderBy:       "is_default DESC, bank_name ASC",
	})
	mountMaster(a, deps, masterSpec[models.PayoutBank]{
		path:          "/payout-banks",
		searchColumns: []string{"bank_name", "account_number", "ifsc"},
		orderBy:       "bank_name ASC",
	})
	mountMaster(a, deps, masterSpec[models.Product]{
		path:          "/products",
		searchColumns: []string{"name", "sku", "category"},
		orderBy:       "created_at DESC",
	})
	mountMaster(a, deps, masterSpec[models.Biller]{
		path:          "/billers",
		searchColumns: []string{"name", "biller_id", "category"},
		orderBy:       "category ASC, name ASC",
	})

	// Setting the default company bank is a two-row change, so it gets a
	// dedicated endpoint rather than being a generic field update.
	a.POST("/company-banks/:id/default", func(c *gin.Context) {
		id, err := uuid.Parse(c.Param("id"))
		if err != nil {
			httpx.BadRequest(c, "Invalid id")
			return
		}
		if err := deps.MasterService.SetDefaultCompanyBank(c.Request.Context(), id); err != nil {
			httpx.FromError(c, err)
			return
		}
		httpx.OK(c, gin.H{"message": "Default bank updated"})
	})

	// Orders are read and status-updated, never created by an admin.
	a.GET("/orders", func(c *gin.Context) {
		page, err := service.ListMaster[models.ProductOrder](c.Request.Context(), db, service.ListOptions{
			Search:        c.Query("search"),
			SearchColumns: []string{"order_id", "retailer", "product"},
			Status:        c.Query("status"),
			OrderBy:       "placed_at DESC",
			Page:          queryInt(c, "page", 1),
			PageSize:      queryInt(c, "pageSize", 25),
		})
		if err != nil {
			deps.Log.Error("list orders failed", slog.Any("error", err))
			httpx.Internal(c)
			return
		}
		httpx.Paginated(c, page.Items, page.Page, page.Size, page.Total)
	})

	a.GET("/orders/:id", func(c *gin.Context) {
		id, err := uuid.Parse(c.Param("id"))
		if err != nil {
			httpx.BadRequest(c, "Invalid id")
			return
		}

		var order models.ProductOrder
		if err := db.WithContext(c.Request.Context()).
			Preload("Items").Where("id = ?", id).First(&order).Error; err != nil {
			httpx.NotFound(c, "Order")
			return
		}
		httpx.OK(c, order)
	})

	a.PATCH("/orders/:id/status", func(c *gin.Context) {
		id, err := uuid.Parse(c.Param("id"))
		if err != nil {
			httpx.BadRequest(c, "Invalid id")
			return
		}

		var body struct {
			Status         models.OrderStatus `json:"status" binding:"required"`
			TrackingNumber string             `json:"trackingNumber"`
			Courier        string             `json:"courier"`
		}
		if err := c.ShouldBindJSON(&body); err != nil {
			httpx.BadRequest(c, "status is required")
			return
		}

		updates := map[string]any{"status": body.Status}
		if body.TrackingNumber != "" {
			updates["tracking_number"] = body.TrackingNumber
		}
		if body.Courier != "" {
			updates["courier"] = body.Courier
		}
		// Lifecycle timestamps are stamped by the server, not the client, so the
		// audit trail cannot be back-dated.
		now := time.Now().UTC()
		switch body.Status {
		case models.OrderShipped:
			updates["shipped_at"] = now
		case models.OrderDelivered:
			updates["delivered_at"] = now
		case models.OrderCancelled:
			updates["cancelled_at"] = now
		}

		order, err := deps.OrderService.SetStatus(c.Request.Context(), id, body.Status, updates)
		if err != nil {
			httpx.FromError(c, err)
			return
		}
		httpx.OK(c, order)
	})
}

func registerAdminUsers(a *gin.RouterGroup, deps Dependencies) {
	a.GET("/retailers", func(c *gin.Context) {
		page, err := deps.RetailerService.List(c.Request.Context(), service.RetailerFilter{
			Search:    c.Query("search"),
			Status:    c.Query("status"),
			KYCStatus: c.Query("kycStatus"),
			City:      c.Query("city"),
			Page:      queryInt(c, "page", 1),
			PageSize:  queryInt(c, "pageSize", 25),
		})
		if err != nil {
			deps.Log.Error("list retailers failed", slog.Any("error", err))
			httpx.Internal(c)
			return
		}
		httpx.Paginated(c, page.Items, page.Page, page.Size, page.Total)
	})

	a.GET("/retailers/:id", func(c *gin.Context) {
		id, err := uuid.Parse(c.Param("id"))
		if err != nil {
			httpx.BadRequest(c, "Invalid id")
			return
		}
		profile, err := deps.RetailerService.Profile(c.Request.Context(), id)
		if err != nil {
			httpx.FromError(c, err)
			return
		}
		httpx.OK(c, profile)
	})

	a.GET("/retailers/:id/transactions", func(c *gin.Context) {
		id, err := uuid.Parse(c.Param("id"))
		if err != nil {
			httpx.BadRequest(c, "Invalid id")
			return
		}
		page, err := deps.TransactionService.List(c.Request.Context(), service.TransactionFilter{
			RetailerID: &id,
			Page:       queryInt(c, "page", 1),
			PageSize:   queryInt(c, "pageSize", 25),
		})
		if err != nil {
			deps.Log.Error("retailer transactions failed", slog.Any("error", err))
			httpx.Internal(c)
			return
		}
		httpx.Paginated(c, page.Items, page.Page, page.Size, page.Total)
	})

	// Sign-in history for support: the most common question when a retailer says
	// they cannot log in is whether their attempts are reaching us at all.
	a.GET("/retailers/:id/login-history", func(c *gin.Context) {
		id, err := uuid.Parse(c.Param("id"))
		if err != nil {
			httpx.BadRequest(c, "Invalid id")
			return
		}

		profile, err := deps.RetailerService.Profile(c.Request.Context(), id)
		if err != nil {
			httpx.FromError(c, err)
			return
		}

		history, err := deps.RetailerService.LoginHistory(
			c.Request.Context(), profile.UserID, queryInt(c, "limit", 50),
		)
		if err != nil {
			deps.Log.Error("admin login history failed", slog.Any("error", err))
			httpx.Internal(c)
			return
		}
		httpx.OK(c, history)
	})

	a.GET("/retailers/:id/ledger", func(c *gin.Context) {
		id, err := uuid.Parse(c.Param("id"))
		if err != nil {
			httpx.BadRequest(c, "Invalid id")
			return
		}
		page := queryInt(c, "page", 1)
		size := queryInt(c, "pageSize", 25)

		result, err := deps.WalletService.Ledger(c.Request.Context(), service.LedgerFilter{
			RetailerID: id, Page: page, PageSize: size,
		})
		if err != nil {
			httpx.FromError(c, err)
			return
		}
		httpx.Paginated(c, result.Entries, page, size, result.Total)
	})

	a.PATCH("/retailers/:id/status", func(c *gin.Context) {
		id, err := uuid.Parse(c.Param("id"))
		if err != nil {
			httpx.BadRequest(c, "Invalid id")
			return
		}

		var body struct {
			Status models.AccountStatus `json:"status" binding:"required"`
		}
		if err := c.ShouldBindJSON(&body); err != nil {
			httpx.BadRequest(c, "status is required")
			return
		}
		if err := deps.RetailerService.SetStatus(c.Request.Context(), id, body.Status); err != nil {
			httpx.FromError(c, err)
			return
		}
		httpx.OK(c, gin.H{"message": "Retailer status updated"})
	})

	a.PATCH("/retailers/:id/kyc", func(c *gin.Context) {
		id, err := uuid.Parse(c.Param("id"))
		if err != nil {
			httpx.BadRequest(c, "Invalid id")
			return
		}

		var body struct {
			Status models.KYCStatus `json:"status" binding:"required"`
			Reason string           `json:"reason"`
		}
		if err := c.ShouldBindJSON(&body); err != nil {
			httpx.BadRequest(c, "status is required")
			return
		}
		// A rejection without a reason leaves the retailer nothing to act on.
		if body.Status == models.KYCRejected && body.Reason == "" {
			httpx.BadRequest(c, "A reason is required when rejecting KYC")
			return
		}
		if err := deps.RetailerService.SetKYCStatus(c.Request.Context(), id, body.Status, body.Reason); err != nil {
			httpx.FromError(c, err)
			return
		}
		httpx.OK(c, gin.H{"message": "KYC status updated"})
	})

	// The reviewer needs the submitted documents, not just the status flag, to
	// make a decision on the retailer profile screen.
	a.GET("/retailers/:id/kyc", func(c *gin.Context) {
		id, err := uuid.Parse(c.Param("id"))
		if err != nil {
			httpx.BadRequest(c, "Invalid id")
			return
		}
		view, err := deps.KYCService.AdminDocuments(c.Request.Context(), id)
		if err != nil {
			httpx.FromError(c, err)
			return
		}
		httpx.OK(c, view)
	})

	a.GET("/kyc/documents/:docId/file", func(c *gin.Context) {
		docID, err := uuid.Parse(c.Param("docId"))
		if err != nil {
			httpx.BadRequest(c, "Invalid id")
			return
		}
		// nil retailer scope: an admin may read any document, but still only
		// through this authenticated handler.
		body, mimeType, name, err := deps.KYCService.DocumentFile(c.Request.Context(), docID, nil)
		if err != nil {
			httpx.FromError(c, err)
			return
		}
		defer body.Close()

		streamDocument(c, body, mimeType, name)
	})

	a.PATCH("/kyc/documents/:docId", func(c *gin.Context) {
		docID, err := uuid.Parse(c.Param("docId"))
		if err != nil {
			httpx.BadRequest(c, "Invalid id")
			return
		}
		reviewerID, ok := middleware.UserID(c)
		if !ok {
			httpx.Unauthorized(c, "")
			return
		}

		var body struct {
			Status  models.KYCStatus `json:"status" binding:"required"`
			Remarks string           `json:"remarks"`
		}
		if err := c.ShouldBindJSON(&body); err != nil {
			httpx.BadRequest(c, "status is required")
			return
		}
		if body.Status == models.KYCRejected && body.Remarks == "" {
			httpx.BadRequest(c, "Remarks are required when rejecting a document")
			return
		}

		if err := deps.KYCService.ReviewDocument(
			c.Request.Context(), docID, body.Status, body.Remarks, reviewerID,
		); err != nil {
			httpx.FromError(c, err)
			return
		}
		httpx.OK(c, gin.H{"message": "Document review saved"})
	})

	a.POST("/retailers/:id/aeps-complete", func(c *gin.Context) {
		id, err := uuid.Parse(c.Param("id"))
		if err != nil {
			httpx.BadRequest(c, "Invalid id")
			return
		}
		if err := deps.RetailerService.SetAEPSOnboardComplete(c.Request.Context(), id); err != nil {
			httpx.FromError(c, err)
			return
		}
		httpx.OK(c, gin.H{"message": "AEPS onboarding marked complete"})
	})
}

func registerAdminFunds(a *gin.RouterGroup, deps Dependencies) {
	a.GET("/fund-requests", func(c *gin.Context) {
		page, err := deps.FundService.List(c.Request.Context(), service.FundRequestFilter{
			Status:   c.Query("status"),
			Search:   c.Query("search"),
			Page:     queryInt(c, "page", 1),
			PageSize: queryInt(c, "pageSize", 25),
		})
		if err != nil {
			deps.Log.Error("list fund requests failed", slog.Any("error", err))
			httpx.Internal(c)
			return
		}
		httpx.Paginated(c, page.Items, page.Page, page.Size, page.Total)
	})

	a.POST("/fund-requests/:id/approve", func(c *gin.Context) {
		id, err := uuid.Parse(c.Param("id"))
		if err != nil {
			httpx.BadRequest(c, "Invalid id")
			return
		}
		adminID, ok := middleware.UserID(c)
		if !ok {
			httpx.Unauthorized(c, "")
			return
		}

		var body struct {
			Note string `json:"note"`
		}
		_ = c.ShouldBindJSON(&body)

		req, err := deps.FundService.Approve(c.Request.Context(), id, adminID, body.Note)
		if err != nil {
			httpx.FromError(c, err)
			return
		}
		httpx.OK(c, req)
	})

	a.POST("/fund-requests/:id/reject", func(c *gin.Context) {
		id, err := uuid.Parse(c.Param("id"))
		if err != nil {
			httpx.BadRequest(c, "Invalid id")
			return
		}
		adminID, ok := middleware.UserID(c)
		if !ok {
			httpx.Unauthorized(c, "")
			return
		}

		var body struct {
			Reason string `json:"reason" binding:"required"`
		}
		if err := c.ShouldBindJSON(&body); err != nil {
			httpx.BadRequest(c, "A rejection reason is required")
			return
		}

		req, err := deps.FundService.Reject(c.Request.Context(), id, adminID, body.Reason)
		if err != nil {
			httpx.FromError(c, err)
			return
		}
		httpx.OK(c, req)
	})

	// Manual wallet adjustment. This is the only way to move money into a wallet
	// outside the fund-request flow, so it records the acting admin and demands a
	// narration: an unexplained balance change is unauditable.
	a.POST("/retailers/:id/wallet-adjust", func(c *gin.Context) {
		retailerID, err := uuid.Parse(c.Param("id"))
		if err != nil {
			httpx.BadRequest(c, "Invalid id")
			return
		}
		adminID, ok := middleware.UserID(c)
		if !ok {
			httpx.Unauthorized(c, "")
			return
		}

		var body struct {
			Direction models.LedgerDirection `json:"direction" binding:"required"`
			Amount    Money                  `json:"amount" binding:"required"`
			Narration string                 `json:"narration" binding:"required"`
		}
		if err := c.ShouldBindJSON(&body); err != nil {
			httpx.BadRequest(c, "direction, amount and narration are required")
			return
		}
		if body.Direction != models.LedgerCredit && body.Direction != models.LedgerDebit {
			httpx.BadRequest(c, "direction must be credit or debit")
			return
		}
		if !body.Amount.IsPositive() {
			httpx.BadRequest(c, "Amount must be greater than zero")
			return
		}

		entry := service.LedgerEntry{
			RetailerID: retailerID,
			Amount:     body.Amount,
			Reason:     models.ReasonAdminAdjustment,
			Narration:  body.Narration,
			ActorID:    &adminID,
		}

		var row *models.WalletLedger
		if body.Direction == models.LedgerCredit {
			row, err = deps.WalletService.Credit(c.Request.Context(), entry)
		} else {
			row, err = deps.WalletService.Debit(c.Request.Context(), entry)
		}
		if err != nil {
			httpx.FromError(c, err)
			return
		}

		deps.Log.Info("admin wallet adjustment",
			slog.String("retailerId", retailerID.String()),
			slog.String("adminId", adminID.String()),
			slog.String("direction", string(body.Direction)),
			slog.String("amount", body.Amount.String()),
		)
		httpx.OK(c, row)
	})

	// Direct wallet transfer between retailers. Admin-only and audited.
	a.POST("/fund-transfer", func(c *gin.Context) {
		adminID, ok := middleware.UserID(c)
		if !ok {
			httpx.Unauthorized(c, "")
			return
		}

		var body struct {
			FromRetailerID uuid.UUID `json:"fromRetailerId" binding:"required"`
			ToRetailerID   uuid.UUID `json:"toRetailerId" binding:"required"`
			Amount         Money     `json:"amount" binding:"required"`
			Narration      string    `json:"narration"`
		}
		if err := c.ShouldBindJSON(&body); err != nil {
			httpx.BadRequest(c, "fromRetailerId, toRetailerId and amount are required")
			return
		}

		err := deps.WalletService.Transfer(
			c.Request.Context(),
			body.FromRetailerID, body.ToRetailerID,
			body.Amount, body.Narration, &adminID,
		)
		if err != nil {
			httpx.FromError(c, err)
			return
		}
		httpx.OK(c, gin.H{"message": "Transfer complete"})
	})
}

func registerAdminReports(a *gin.RouterGroup, deps Dependencies) {
	a.GET("/transactions", func(c *gin.Context) {
		page, err := deps.TransactionService.List(c.Request.Context(), service.TransactionFilter{
			Category:  c.Query("category"),
			Status:    c.Query("status"),
			Reference: c.Query("reference"),
			Mobile:    c.Query("mobile"),
			Search:    c.Query("search"),
			From:      queryTime(c, "from"),
			To:        queryTimeUpper(c, "to"),
			Page:      queryInt(c, "page", 1),
			PageSize:  queryInt(c, "pageSize", 25),
		})
		if err != nil {
			deps.Log.Error("admin transactions failed", slog.Any("error", err))
			httpx.Internal(c)
			return
		}
		httpx.Paginated(c, page.Items, page.Page, page.Size, page.Total)
	})

	a.GET("/reports/service", func(c *gin.Context) {
		report, err := deps.ReportService.ServiceReport(c.Request.Context(), nil, queryTime(c, "from"), queryTimeUpper(c, "to"))
		if err != nil {
			deps.Log.Error("service report failed", slog.Any("error", err))
			httpx.Internal(c)
			return
		}
		httpx.OK(c, report)
	})

	// The platform-wide wallet ledger. Period totals come from the whole filtered
	// set rather than the page, so an admin can reconcile them against a statement.
	a.GET("/wallet/ledger", func(c *gin.Context) {
		page := queryInt(c, "page", 1)
		size := queryInt(c, "pageSize", 25)

		result, err := deps.WalletService.AllLedger(c.Request.Context(), service.LedgerFilter{
			Reason:    models.LedgerReason(c.Query("reason")),
			Direction: models.LedgerDirection(c.Query("direction")),
			From:      queryDateString(c, "from", false),
			To:        queryDateString(c, "to", true),
			Page:      page,
			PageSize:  size,
		}, c.Query("search"))
		if err != nil {
			deps.Log.Error("admin wallet ledger failed", slog.Any("error", err))
			httpx.Internal(c)
			return
		}

		httpx.PaginatedWithExtra(c, result.Entries, page, size, result.Total, gin.H{
			"credits": result.Credits,
			"debits":  result.Debits,
		})
	})

	a.GET("/transactions/:txnId/receipt", deps.BharatConnectHandler.Receipt)
}

// masterSpec describes how one master-data resource is exposed.
type masterSpec[T any] struct {
	path          string
	searchColumns []string
	orderBy       string
}

// protectedMasterFields are never client-writable: allowing them would let a
// caller reassign a record's identity or forge its audit history.
var protectedMasterFields = map[string]bool{
	"id": true, "created_at": true, "updated_at": true, "deleted_at": true,
}

// masterColumns maps the JSON field names a client sends to the database column
// names GORM uses for the same fields.
//
// The update path takes a field map so the admin panel can edit any column
// without a DTO per resource, but GORM treats unrecognised map keys as literal
// column names. Without this translation a camelCase key such as "pincodeFrom"
// would be emitted verbatim and Postgres would reject the statement, so every
// multi-word field would silently be un-editable. Deriving the mapping from the
// parsed schema keeps it correct for whatever naming GORM itself settled on.
func masterColumns[T any](namer schema.Namer) map[string]string {
	var model T
	sch, err := schema.Parse(&model, &sync.Map{}, namer)
	if err != nil {
		// Parsing cannot fail for a model GORM already migrated, so this only
		// trips on a programming error and should surface loudly at startup.
		panic(fmt.Sprintf("master: parse schema %T: %v", model, err))
	}

	out := make(map[string]string, len(sch.Fields))
	for _, f := range sch.Fields {
		// Relations carry no column of their own; writing to them is meaningless.
		if f.DBName == "" || protectedMasterFields[f.DBName] {
			continue
		}

		name := strings.Split(f.StructField.Tag.Get("json"), ",")[0]
		switch name {
		case "", "-":
			// Not exposed over JSON, so not addressable by a client either.
			continue
		}
		out[name] = f.DBName
	}
	return out
}

// mountMaster registers list, get, create, update and delete for a resource.
//
// Create and update accept a raw field map, which keeps the admin panel able to
// edit any column without a bespoke DTO per resource. The generic helpers
// centralise conflict and not-found mapping.
func mountMaster[T any](a *gin.RouterGroup, deps Dependencies, spec masterSpec[T]) {
	db := deps.DB

	// Resolved once at startup rather than per request.
	columns := masterColumns[T](db.NamingStrategy)

	a.GET(spec.path, func(c *gin.Context) {
		page, err := service.ListMaster[T](c.Request.Context(), db, service.ListOptions{
			Search:        c.Query("search"),
			SearchColumns: spec.searchColumns,
			Status:        c.Query("status"),
			OrderBy:       spec.orderBy,
			Page:          queryInt(c, "page", 1),
			PageSize:      queryInt(c, "pageSize", 25),
		})
		if err != nil {
			deps.Log.Error("master list failed",
				slog.String("path", spec.path), slog.Any("error", err))
			httpx.Internal(c)
			return
		}
		httpx.Paginated(c, page.Items, page.Page, page.Size, page.Total)
	})

	a.GET(spec.path+"/:id", func(c *gin.Context) {
		id, err := uuid.Parse(c.Param("id"))
		if err != nil {
			httpx.BadRequest(c, "Invalid id")
			return
		}
		record, err := service.GetMaster[T](c.Request.Context(), db, id)
		if err != nil {
			httpx.FromError(c, err)
			return
		}
		httpx.OK(c, record)
	})

	a.POST(spec.path, func(c *gin.Context) {
		var record T
		if err := c.ShouldBindJSON(&record); err != nil {
			httpx.BadRequest(c, "Invalid payload")
			return
		}
		if err := service.CreateMaster(c.Request.Context(), db, &record); err != nil {
			httpx.FromError(c, err)
			return
		}
		httpx.Created(c, record)
	})

	a.PUT(spec.path+"/:id", func(c *gin.Context) {
		id, err := uuid.Parse(c.Param("id"))
		if err != nil {
			httpx.BadRequest(c, "Invalid id")
			return
		}

		var body map[string]any
		if err := c.ShouldBindJSON(&body); err != nil {
			httpx.BadRequest(c, "Invalid payload")
			return
		}

		// Translate to column names, rejecting anything unrecognised. Silently
		// dropping unknown keys would let a typo look like a successful save.
		updates := make(map[string]any, len(body))
		for key, value := range body {
			column, ok := columns[key]
			if !ok {
				if protectedMasterFields[key] {
					continue
				}
				httpx.BadRequest(c, "Unknown field: "+key)
				return
			}
			updates[column] = value
		}

		record, err := service.UpdateMaster[T](c.Request.Context(), db, id, updates)
		if err != nil {
			httpx.FromError(c, err)
			return
		}
		httpx.OK(c, record)
	})

	a.DELETE(spec.path+"/:id", func(c *gin.Context) {
		id, err := uuid.Parse(c.Param("id"))
		if err != nil {
			httpx.BadRequest(c, "Invalid id")
			return
		}
		if err := service.DeleteMaster[T](c.Request.Context(), db, id); err != nil {
			httpx.FromError(c, err)
			return
		}
		c.Status(http.StatusNoContent)
	})
}

// Money is re-exported so route bodies can bind monetary fields without
// importing the models package.
type Money = models.Money

// queryTime parses a date or RFC3339 timestamp query parameter.
//
// Used for the lower bound of a window, where a bare date correctly means the
// start of that day.
func queryTime(c *gin.Context, key string) *time.Time {
	raw := c.Query(key)
	if raw == "" {
		return nil
	}
	for _, layout := range []string{time.RFC3339, "2006-01-02"} {
		if t, err := time.Parse(layout, raw); err == nil {
			return &t
		}
	}
	return nil
}

// queryDateString parses a date bound into a timestamp string, for the filters
// that carry bounds as strings rather than time.Time.
//
// Returns nil when absent or unparseable so a malformed value is treated as no
// filter instead of silently matching nothing.
func queryDateString(c *gin.Context, key string, upper bool) *string {
	var t *time.Time
	if upper {
		t = queryTimeUpper(c, key)
	} else {
		t = queryTime(c, key)
	}
	if t == nil {
		return nil
	}
	formatted := t.Format(time.RFC3339Nano)
	return &formatted
}

// queryTimeUpper parses the upper bound of a window.
//
// A bare date has to be read as the *end* of that day. Parsing "2026-08-01" as
// midnight and filtering `created_at <= midnight` excludes everything that
// happened on the day the user asked for, so a same-day report comes back empty
// and a range report silently loses its last day.
func queryTimeUpper(c *gin.Context, key string) *time.Time {
	raw := c.Query(key)
	if raw == "" {
		return nil
	}
	if t, err := time.Parse(time.RFC3339, raw); err == nil {
		return &t
	}
	if t, err := time.Parse("2006-01-02", raw); err == nil {
		end := t.Add(24*time.Hour - time.Nanosecond)
		return &end
	}
	return nil
}
