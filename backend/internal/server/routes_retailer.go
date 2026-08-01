package server

import (
	"log/slog"
	"net/http"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"

	"github.com/utilipay/backend/internal/httpx"
	"github.com/utilipay/backend/internal/middleware"
	"github.com/utilipay/backend/internal/models"
	"github.com/utilipay/backend/internal/provider/bharatconnect"
	"github.com/utilipay/backend/internal/service"
)

// registerRetailerAPI mounts the retailer surface.
func registerRetailerAPI(g *gin.RouterGroup, deps Dependencies) {
	r := g.Group("/retailer")
	r.Use(middleware.RequireRole(models.RoleRetailer), middleware.RetailerScope())

	registerRetailerCore(r, deps)
	registerRetailerKYC(r, deps)
	registerRetailerAEPS(r, deps)
	registerRetailerBharatConnect(r, deps)
	registerRetailerReports(r, deps)
}

// registerRetailerKYC mounts the KYC wizard surface.
func registerRetailerKYC(r *gin.RouterGroup, deps Dependencies) {
	k := r.Group("/kyc")

	k.GET("", func(c *gin.Context) {
		retailerID, _ := middleware.RetailerID(c)
		view, err := deps.KYCService.Application(c.Request.Context(), retailerID)
		if err != nil {
			deps.Log.Error("kyc application failed", slog.Any("error", err))
			httpx.FromError(c, err)
			return
		}
		httpx.OK(c, view)
	})

	k.PUT("", func(c *gin.Context) {
		retailerID, _ := middleware.RetailerID(c)

		var body service.SaveProgressInput
		if err := c.ShouldBindJSON(&body); err != nil {
			httpx.BadRequest(c, "Invalid payload")
			return
		}

		view, err := deps.KYCService.SaveProgress(c.Request.Context(), retailerID, body)
		if err != nil {
			httpx.FromError(c, err)
			return
		}
		httpx.OK(c, view)
	})

	k.POST("/documents", func(c *gin.Context) {
		retailerID, _ := middleware.RetailerID(c)

		// The multipart form is bounded before parsing so an oversized body is
		// rejected without being buffered to disk first.
		if err := c.Request.ParseMultipartForm(deps.Config.Storage.MaxUploadBytes + 1024); err != nil {
			httpx.BadRequest(c, "The upload could not be read. Check the file size and try again.")
			return
		}

		header, err := c.FormFile("file")
		if err != nil {
			httpx.BadRequest(c, "Attach a file under the field name 'file'")
			return
		}

		doc, err := deps.KYCService.UploadDocument(c.Request.Context(), service.UploadDocumentInput{
			RetailerID: retailerID,
			DocType:    c.PostForm("docType"),
			DocNumber:  c.PostForm("docNumber"),
			Header:     header,
		})
		if err != nil {
			httpx.FromError(c, err)
			return
		}
		httpx.Created(c, doc)
	})

	// Documents are streamed through an authenticated handler rather than served
	// statically: these are PAN and Aadhaar scans, and a guessable public URL
	// would expose them to anyone.
	k.GET("/documents/:id/file", func(c *gin.Context) {
		retailerID, _ := middleware.RetailerID(c)
		id, err := uuid.Parse(c.Param("id"))
		if err != nil {
			httpx.BadRequest(c, "Invalid id")
			return
		}

		body, mimeType, name, err := deps.KYCService.DocumentFile(c.Request.Context(), id, &retailerID)
		if err != nil {
			httpx.FromError(c, err)
			return
		}
		defer body.Close()

		streamDocument(c, body, mimeType, name)
	})

	k.DELETE("/documents/:id", func(c *gin.Context) {
		retailerID, _ := middleware.RetailerID(c)
		id, err := uuid.Parse(c.Param("id"))
		if err != nil {
			httpx.BadRequest(c, "Invalid id")
			return
		}
		if err := deps.KYCService.DeleteDocument(c.Request.Context(), retailerID, id); err != nil {
			httpx.FromError(c, err)
			return
		}
		c.Status(http.StatusNoContent)
	})

	k.POST("/submit", func(c *gin.Context) {
		retailerID, _ := middleware.RetailerID(c)
		view, err := deps.KYCService.Submit(c.Request.Context(), retailerID)
		if err != nil {
			httpx.FromError(c, err)
			return
		}
		httpx.OK(c, view)
	})
}

// registerRetailerCore mounts dashboard, profile and wallet endpoints.
func registerRetailerCore(r *gin.RouterGroup, deps Dependencies) {
	r.GET("/dashboard", func(c *gin.Context) {
		retailerID, ok := middleware.RetailerID(c)
		if !ok {
			httpx.Forbidden(c, "No retailer profile linked to this account")
			return
		}

		stats, err := deps.TransactionService.Summary(c.Request.Context(), &retailerID)
		if err != nil {
			deps.Log.Error("retailer dashboard failed", slog.Any("error", err))
			httpx.Internal(c)
			return
		}

		profile, err := deps.RetailerService.Profile(c.Request.Context(), retailerID)
		if err != nil {
			httpx.FromError(c, err)
			return
		}

		recent, err := deps.TransactionService.List(c.Request.Context(), service.TransactionFilter{
			RetailerID: &retailerID, Page: 1, PageSize: 10,
		})
		if err != nil {
			deps.Log.Error("recent transactions failed", slog.Any("error", err))
			httpx.Internal(c)
			return
		}

		announcements, err := deps.ContentService.Announcements(c.Request.Context(), models.RoleRetailer)
		if err != nil {
			deps.Log.Error("announcements failed", slog.Any("error", err))
			httpx.Internal(c)
			return
		}

		httpx.OK(c, gin.H{
			"stats":              stats,
			"profile":            profile,
			"recentTransactions": nonNilSlice(recent.Items),
			"announcements":      nonNilSlice(announcements),
			"capabilities": gin.H{
				"aeps":          deps.AEPS.Capabilities(),
				"bharatConnect": deps.BharatConnect.Capabilities(),
			},
		})
	})

	r.GET("/profile", func(c *gin.Context) {
		retailerID, _ := middleware.RetailerID(c)
		profile, err := deps.RetailerService.Profile(c.Request.Context(), retailerID)
		if err != nil {
			httpx.FromError(c, err)
			return
		}
		httpx.OK(c, profile)
	})

	r.PUT("/profile", func(c *gin.Context) {
		retailerID, _ := middleware.RetailerID(c)

		var in service.UpdateProfileInput
		if err := c.ShouldBindJSON(&in); err != nil {
			httpx.BadRequest(c, "Invalid profile payload")
			return
		}

		profile, err := deps.RetailerService.UpdateProfile(c.Request.Context(), retailerID, in)
		if err != nil {
			httpx.FromError(c, err)
			return
		}
		httpx.OK(c, profile)
	})

	r.GET("/wallet/balance", func(c *gin.Context) {
		retailerID, _ := middleware.RetailerID(c)
		balance, err := deps.WalletService.Balance(c.Request.Context(), retailerID)
		if err != nil {
			httpx.FromError(c, err)
			return
		}
		httpx.OK(c, gin.H{"balance": balance})
	})

	r.GET("/wallet/ledger", func(c *gin.Context) {
		retailerID, _ := middleware.RetailerID(c)
		page := queryInt(c, "page", 1)
		size := queryInt(c, "pageSize", 25)

		result, err := deps.WalletService.Ledger(c.Request.Context(), service.LedgerFilter{
			RetailerID: retailerID,
			Reason:     models.LedgerReason(c.Query("reason")),
			Direction:  models.LedgerDirection(c.Query("direction")),
			From:       queryDateString(c, "from", false),
			To:         queryDateString(c, "to", true),
			Page:       page,
			PageSize:   size,
		})
		if err != nil {
			httpx.FromError(c, err)
			return
		}
		httpx.Paginated(c, result.Entries, page, size, result.Total)
	})

	r.GET("/login-history", func(c *gin.Context) {
		userID, ok := middleware.UserID(c)
		if !ok {
			httpx.Unauthorized(c, "")
			return
		}
		history, err := deps.RetailerService.LoginHistory(c.Request.Context(), userID, queryInt(c, "limit", 50))
		if err != nil {
			deps.Log.Error("login history failed", slog.Any("error", err))
			httpx.Internal(c)
			return
		}
		httpx.OK(c, history)
	})

	r.GET("/services/availability", func(c *gin.Context) {
		httpx.OK(c, gin.H{
			"aeps":          deps.AEPS.Capabilities(),
			"bharatConnect": deps.BharatConnect.Capabilities(),
		})
	})

	// Fund requests
	r.GET("/fund-requests", func(c *gin.Context) {
		retailerID, _ := middleware.RetailerID(c)
		page := queryInt(c, "page", 1)
		size := queryInt(c, "pageSize", 25)

		result, err := deps.FundService.List(c.Request.Context(), service.FundRequestFilter{
			RetailerID: &retailerID,
			Status:     c.Query("status"),
			Page:       page,
			PageSize:   size,
		})
		if err != nil {
			deps.Log.Error("list fund requests failed", slog.Any("error", err))
			httpx.Internal(c)
			return
		}
		httpx.Paginated(c, result.Items, result.Page, result.Size, result.Total)
	})

	r.POST("/fund-requests", func(c *gin.Context) {
		retailerID, _ := middleware.RetailerID(c)

		var in service.CreateFundRequestInput
		if err := c.ShouldBindJSON(&in); err != nil {
			httpx.BadRequest(c, "amount, mode and bank are required")
			return
		}
		in.RetailerID = retailerID

		created, err := deps.FundService.Create(c.Request.Context(), in)
		if err != nil {
			httpx.FromError(c, err)
			return
		}
		httpx.Created(c, created)
	})

	r.GET("/company-banks", func(c *gin.Context) {
		banks, err := deps.ContentService.CompanyBanks(c.Request.Context())
		if err != nil {
			deps.Log.Error("list company banks failed", slog.Any("error", err))
			httpx.Internal(c)
			return
		}
		httpx.OK(c, banks)
	})
}

// registerRetailerAEPS mounts the AEPS surface.
func registerRetailerAEPS(r *gin.RouterGroup, deps Dependencies) {
	a := r.Group("/aeps")

	a.GET("/capabilities", deps.AEPSHandler.Capabilities)
	a.POST("/onboard", deps.AEPSHandler.Onboard)
	a.POST("/transact", deps.AEPSHandler.Transact)
	a.GET("/transactions", deps.AEPSHandler.Transactions)
	a.GET("/settlements", deps.AEPSHandler.Settlements)
}

// registerRetailerBharatConnect mounts the recharge and bill-payment surface.
//
// Route order follows the provider's mandated call sequence, which is also the
// order the UI compliance checklist lists its screens in.
func registerRetailerBharatConnect(r *gin.RouterGroup, deps Dependencies) {
	b := r.Group("/bharat-connect")

	// Category and biller selection screens.
	b.GET("/categories", deps.BharatConnectHandler.Categories)
	b.GET("/billers", deps.BharatConnectHandler.Billers)
	b.GET("/circles", deps.BharatConnectHandler.Circles)
	b.GET("/plans", deps.BharatConnectHandler.Plans)

	// Reference data the payment form needs.
	b.GET("/payment-modes", func(c *gin.Context) {
		modes := bharatconnect.PaymentModes()
		out := make([]gin.H, 0, len(modes))
		for _, m := range modes {
			out = append(out, gin.H{
				"mode": m,
				// The hint tells the UI what paymentAccountInfo must contain,
				// which differs per mode and is a common integration mistake.
				"accountInfoHint": bharatconnect.PaymentAccountInfoHint(m),
			})
		}
		httpx.OK(c, out)
	})

	// Transaction flow.
	b.POST("/validate", deps.BharatConnectHandler.Validate)
	b.POST("/view-bill", deps.BharatConnectHandler.ViewBill)
	b.POST("/pay", deps.BharatConnectHandler.Pay)
	b.GET("/status/:txnId", deps.BharatConnectHandler.Status)
	b.GET("/receipt/:txnId", deps.BharatConnectHandler.Receipt)

	// Compliance screens.
	b.GET("/transactions", deps.BharatConnectHandler.TransactionHistory)
	b.GET("/complaint-targets", deps.BharatConnectHandler.ComplaintTargets)
}

// registerRetailerReports mounts the report surface.
func registerRetailerReports(r *gin.RouterGroup, deps Dependencies) {
	rep := r.Group("/reports")

	rep.GET("/transactions", func(c *gin.Context) {
		retailerID, _ := middleware.RetailerID(c)
		page := queryInt(c, "page", 1)
		size := queryInt(c, "pageSize", 25)

		result, err := deps.TransactionService.List(c.Request.Context(), service.TransactionFilter{
			RetailerID: &retailerID,
			Category:   c.Query("category"),
			Status:     c.Query("status"),
			Reference:  c.Query("reference"),
			Mobile:     c.Query("mobile"),
			Search:     c.Query("search"),
			From:       queryTime(c, "from"),
			To:         queryTimeUpper(c, "to"),
			Page:       page,
			PageSize:   size,
		})
		if err != nil {
			deps.Log.Error("transaction report failed", slog.Any("error", err))
			httpx.Internal(c)
			return
		}
		httpx.Paginated(c, result.Items, result.Page, result.Size, result.Total)
	})

	// The per-service summary a retailer sees is the same aggregate the admin
	// gets, scoped to the caller. Scoping happens here from the authenticated
	// session rather than a query parameter, so one retailer cannot read another's
	// figures by passing an id.
	rep.GET("/service", func(c *gin.Context) {
		retailerID, _ := middleware.RetailerID(c)
		report, err := deps.ReportService.ServiceReport(
			c.Request.Context(), &retailerID, queryTime(c, "from"), queryTimeUpper(c, "to"),
		)
		if err != nil {
			deps.Log.Error("retailer service report failed", slog.Any("error", err))
			httpx.Internal(c)
			return
		}
		httpx.OK(c, report)
	})

	rep.GET("/commission-slab", func(c *gin.Context) {
		retailerID, _ := middleware.RetailerID(c)
		slabs, err := deps.CommissionService.SlabsForRetailer(c.Request.Context(), retailerID)
		if err != nil {
			deps.Log.Error("commission slab report failed", slog.Any("error", err))
			httpx.Internal(c)
			return
		}
		httpx.OK(c, slabs)
	})

	rep.GET("/commission", func(c *gin.Context) {
		retailerID, _ := middleware.RetailerID(c)
		report, err := deps.ReportService.Commission(c.Request.Context(), retailerID, queryTime(c, "from"), queryTimeUpper(c, "to"))
		if err != nil {
			deps.Log.Error("commission report failed", slog.Any("error", err))
			httpx.Internal(c)
			return
		}
		httpx.OK(c, report)
	})

	rep.GET("/gst", func(c *gin.Context) {
		retailerID, _ := middleware.RetailerID(c)
		report, err := deps.ReportService.GST(c.Request.Context(), retailerID, queryTime(c, "from"), queryTimeUpper(c, "to"))
		if err != nil {
			deps.Log.Error("gst report failed", slog.Any("error", err))
			httpx.Internal(c)
			return
		}
		httpx.OK(c, report)
	})

	rep.GET("/tds", func(c *gin.Context) {
		retailerID, _ := middleware.RetailerID(c)
		report, err := deps.ReportService.TDS(c.Request.Context(), retailerID, queryTime(c, "from"), queryTimeUpper(c, "to"))
		if err != nil {
			deps.Log.Error("tds report failed", slog.Any("error", err))
			httpx.Internal(c)
			return
		}
		httpx.OK(c, report)
	})

	rep.GET("/account-history", func(c *gin.Context) {
		retailerID, _ := middleware.RetailerID(c)
		page := queryInt(c, "page", 1)
		size := queryInt(c, "pageSize", 50)

		result, err := deps.WalletService.Ledger(c.Request.Context(), service.LedgerFilter{
			RetailerID: retailerID,
			Page:       page,
			PageSize:   size,
		})
		if err != nil {
			httpx.FromError(c, err)
			return
		}
		httpx.Paginated(c, result.Entries, page, size, result.Total)
	})
}
