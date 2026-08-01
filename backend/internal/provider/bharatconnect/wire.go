package bharatconnect

// ============================================================================
// WIRE CONTRACT
// ============================================================================
//
// Source of truth: "Recharge & Bill Payment API Documentation (Standard Format)",
// Version 1.0, MobiKwik — bharat_connect/RT-Recharge & Bill Payment API
// Documentation ...pdf
//
// Everything in this file is transcribed from that document. Endpoint paths,
// field names, status strings and error codes are quoted, not inferred.
//
// Base URL (UAT): https://alpha3.mobikwik.com
//
// Documented quirks that differ from common convention and are easy to get
// wrong:
//
//  1. The token endpoint is /recharge/v1/verify/retailer. Despite the path
//     reading like a retailer lookup, it is the credential-exchange call.
//  2. The token request and all responses are PLAINTEXT JSON. Only the request
//     bodies of the five /v3/retailer* endpoints are encrypted.
//  3. The Authorization header carries the bare token with no "Bearer " prefix:
//     "Authorization: <token>".
//  4. Amounts are sent as strings and returned as numbers.
//  5. A payment failure with code 500 and text "Sorry! The transaction couldn't
//     succeed" is NOT terminal: the document explicitly requires a status check.

// endpointPaths holds the URL path for each operation, all quoted from the spec.
type endpointPaths struct {
	// token is the credential exchange. Spec: "Authentication & Token Generation
	// API", POST https://<host-name>/recharge/v1/verify/retailer
	token string

	// plans is the recharge plan catalogue. Spec: "Plan Fetching API",
	// GET /recharge/v1/rechargePlansAPI/<opId>/<cirId>[/<planType>]
	plans string

	// The five encrypted endpoints, listed verbatim in the encryption section.
	balance    string
	validation string
	viewBill   string
	payment    string
	status     string

	// creditCardBill is the credit-card bill fetch. Spec: "Credit card bill
	// fetch API", POST /recharge/v3/retailerCCBill
	creditCardBill string
}

func defaultPaths() endpointPaths {
	return endpointPaths{
		token:          "/recharge/v1/verify/retailer",
		plans:          "/recharge/v1/rechargePlansAPI",
		balance:        "/recharge/v3/retailerBalance",
		validation:     "/recharge/v3/retailerValidation",
		viewBill:       "/recharge/v3/retailerViewbill",
		payment:        "/recharge/v3/retailerPayment",
		status:         "/recharge/v3/retailerStatus",
		creditCardBill: "/recharge/v3/retailerCCBill",
	}
}

// encryptedPaths is the exact set of endpoints whose request bodies must be
// enveloped, quoted from the encryption section of the spec.
//
// The token endpoint is deliberately absent: its body is plaintext.
func encryptedPaths() map[string]bool {
	p := defaultPaths()
	return map[string]bool{
		p.balance:        true,
		p.validation:     true,
		p.viewBill:       true,
		p.payment:        true,
		p.status:         true,
		p.creditCardBill: true,
	}
}

// --- common response envelope ---
//
// Every endpoint wraps its result in this shape:
//
//	{ "success": true,  "data": {...} | [...] }
//	{ "success": false, "message": { "code": "...", "text": "..." } }

// apiMessage is the error detail block.
type apiMessage struct {
	Code string `json:"code"`
	Text string `json:"text"`
}

// --- token generation ---

// tokenRequest is the plaintext credential exchange body.
//
// Spec "Request Parameters": clientId (String, required), clientSecret (String,
// required).
type tokenRequest struct {
	ClientID     string `json:"clientId"`
	ClientSecret string `json:"clientSecret"`
}

// tokenEnvelope is the token response.
//
// Spec "Success Response (200)":
//
//	{"success": true, "data": {"token": "...", "expiryTime": "2025-10-29 12:26:53"}}
type tokenEnvelope struct {
	Success bool        `json:"success"`
	Message *apiMessage `json:"message,omitempty"`
	Data    struct {
		Token string `json:"token"`
		// ExpiryTime is formatted "YYYY-MM-DD HH:mm:ss" per the field table.
		ExpiryTime string `json:"expiryTime"`
	} `json:"data"`
}

// expiryTimeLayout matches the documented "YYYY-MM-DD HH:mm:ss" format.
const expiryTimeLayout = "2006-01-02 15:04:05"

// --- balance ---

// balanceRequestPayload is the plaintext body of the balance call.
//
// Spec: memberId — "Member ID of the retailer account (Onboarded email id)".
type balanceRequestPayload struct {
	MemberID string `json:"memberId"`
}

// balanceEnvelope is the balance response. Spec: {"success":true,"data":{"balance":303.5}}
type balanceEnvelope struct {
	Success bool        `json:"success"`
	Message *apiMessage `json:"message,omitempty"`
	Data    struct {
		Balance float64 `json:"balance"`
	} `json:"data"`
}

// --- validation ---

// validationRequestPayload is the plaintext body of the validation call.
//
// Spec "Request Parameters": amt, cn, op mandatory; adParams conditional; cir
// optional; agentId mandatory; planCode conditionally mandatory. All strings
// except adParams, which is a map.
type validationRequestPayload struct {
	Amt      string            `json:"amt"`
	CN       string            `json:"cn"`
	Op       string            `json:"op"`
	Cir      string            `json:"cir"`
	AgentID  string            `json:"agentId"`
	PlanCode string            `json:"planCode"`
	AdParams map[string]string `json:"adParams"`
}

// validationEnvelope is the validation response.
//
// Note that a business failure returns HTTP 200 with success=false and still
// populates data, so both blocks are decoded.
type validationEnvelope struct {
	Success bool        `json:"success"`
	Message *apiMessage `json:"message,omitempty"`
	Data    struct {
		Status          string  `json:"status"`
		Description     string  `json:"description"`
		Balance         float64 `json:"balance"`
		DiscountedPrice float64 `json:"discountedPrice"`
		BusinessError   bool    `json:"businessError"`
	} `json:"data"`
}

// --- view bill ---

// viewBillRequestPayload is the plaintext body of the view-bill call.
//
// Spec "Request Parameters": cn, op, cir, agentId mandatory; adParams conditional.
type viewBillRequestPayload struct {
	CN       string            `json:"cn"`
	Op       string            `json:"op"`
	Cir      string            `json:"cir"`
	AgentID  string            `json:"agentId"`
	AdParams map[string]string `json:"adParams"`
}

// billRecord is one entry of the view-bill result.
//
// Amounts arrive as strings here, unlike the numeric balance field elsewhere.
type billRecord struct {
	BillAmount    string  `json:"billAmount"`
	BillNetAmount string  `json:"billnetamount"`
	BillDate      string  `json:"billdate"`
	DueDate       string  `json:"dueDate"`
	AcceptPayment bool    `json:"acceptPayment"`
	AcceptPartPay bool    `json:"acceptPartPay"`
	UserName      string  `json:"userName"`
	CellNumber    string  `json:"cellNumber"`
	MinBillAmount float64 `json:"minBillAmount"`
	// AdditionalDetails is populated only when the biller returns extra fields,
	// for example FASTag tag status and vehicle model.
	AdditionalDetails map[string]any `json:"additionalDetails"`
}

// viewBillEnvelope is the view-bill response. Note that data is an ARRAY.
type viewBillEnvelope struct {
	Success bool         `json:"success"`
	Message *apiMessage  `json:"message,omitempty"`
	Data    []billRecord `json:"data"`
}

// --- payment ---

// paymentRequestPayload is the plaintext body of the payment call.
//
// Spec "Request Parameters" for /recharge/v3/retailerPayment. reqid is our
// unique transaction request ID, capped at 20 characters, and the spec asks that
// it be prefixed with an identifier of ours.
//
// ad1/ad2 are optional extras; ad9 and ad3 carry the linked mobile and bank code
// for credit-card payments.
type paymentRequestPayload struct {
	CN                 string `json:"cn"`
	Op                 string `json:"op"`
	Cir                string `json:"cir"`
	Amt                string `json:"amt"`
	ReqID              string `json:"reqid"`
	CustomerMobile     string `json:"customerMobile"`
	RemitterName       string `json:"remitterName"`
	PaymentRefID       string `json:"paymentRefID"`
	PaymentMode        string `json:"paymentMode"`
	AgentID            string `json:"agentId"`
	PaymentAccountInfo string `json:"paymentAccountInfo"`

	Ad1 string `json:"ad1,omitempty"`
	Ad2 string `json:"ad2,omitempty"`
	// Ad9 is the mobile linked to the credit card; Ad3 is the bank code.
	Ad9 string `json:"ad9,omitempty"`
	Ad3 string `json:"ad3,omitempty"`
}

// paymentEnvelope is the payment response.
type paymentEnvelope struct {
	Success bool        `json:"success"`
	Message *apiMessage `json:"message,omitempty"`
	Data    struct {
		Status        string  `json:"status"`
		TxID          string  `json:"txId"`
		Balance       float64 `json:"balance"`
		MobikwikStamp string  `json:"mobikwikstamp"`
		OpRefNo       string  `json:"opRefNo"`
		DiscountPrice float64 `json:"discountprice"`
		CouponStatus  string  `json:"couponstatus"`
	} `json:"data"`
}

// --- status check ---

// statusRequestPayload is the plaintext body of the status call.
//
// Spec: txId — "Transaction ID (same as reqid in recharge API or mobikwikstamp)".
type statusRequestPayload struct {
	TxID string `json:"txId"`
}

// statusEnvelope is the status-check response.
//
// A failed transaction is reported as success=true with
// data.status=RECHARGEFAILURE. Some responses use txStatus rather than status,
// so both are decoded.
type statusEnvelope struct {
	Success bool        `json:"success"`
	Message *apiMessage `json:"message,omitempty"`
	Data    struct {
		TxID     string `json:"txId"`
		Status   string `json:"status"`
		TxStatus string `json:"txStatus"`

		Description     string  `json:"description"`
		StatusDetails   string  `json:"statusDetails"`
		DiscountedPrice float64 `json:"discountedPrice"`
		Balance         float64 `json:"balance"`
		OperatorRefNo   string  `json:"operatorRefNo"`
		MobikwikStamp   string  `json:"mobikwikStamp"`

		// Lowercase variants appear in the failed-case sample.
		MobikwikRefNo        string  `json:"mobikwikrefno"`
		MobikwikStampLower   string  `json:"mobikwikstamp"`
		OperatorRefNoLower   string  `json:"operatorrefno"`
		OperatorName         string  `json:"operatorname"`
		CircleName           string  `json:"circlename"`
		CellNumber           string  `json:"cellNumber"`
		RechargeRetailAmount float64 `json:"rechargeRetailAmount"`
		TxDate               int64   `json:"txDate"`
	} `json:"data"`
}

// resolvedStatus returns whichever status field the provider populated.
func (s statusEnvelope) resolvedStatus() string {
	if s.Data.Status != "" {
		return s.Data.Status
	}
	return s.Data.TxStatus
}

// resolvedStamp returns whichever MobiKwik stamp casing was populated.
func (s statusEnvelope) resolvedStamp() string {
	if s.Data.MobikwikStamp != "" {
		return s.Data.MobikwikStamp
	}
	if s.Data.MobikwikStampLower != "" {
		return s.Data.MobikwikStampLower
	}
	return s.Data.MobikwikRefNo
}

// resolvedOperatorRef returns whichever operator reference casing was populated.
func (s statusEnvelope) resolvedOperatorRef() string {
	if s.Data.OperatorRefNo != "" {
		return s.Data.OperatorRefNo
	}
	return s.Data.OperatorRefNoLower
}

// --- credit card bill fetch ---

// ccBillRequestPayload is the plaintext body of the credit-card bill fetch.
//
// Spec: last4, mobile, agentId, bankCode — all mandatory strings.
type ccBillRequestPayload struct {
	Last4    string `json:"last4"`
	Mobile   string `json:"mobile"`
	AgentID  string `json:"agentId"`
	BankCode string `json:"bankCode"`
}

// ccBillEnvelope is the credit-card bill response.
type ccBillEnvelope struct {
	Success bool        `json:"success"`
	Message *apiMessage `json:"message,omitempty"`
	Data    struct {
		StatementDate    string  `json:"statementDate"`
		DueDate          string  `json:"dueDate"`
		DueAmount        float64 `json:"dueAmount"`
		MinimumAmountDue float64 `json:"minimumAmountDue"`
	} `json:"data"`
}

// ============================================================================
// Documented status strings and error codes
// ============================================================================

// Payment response statuses, from the "Status Values" table.
const (
	statusSuccess         = "SUCCESS"
	statusSuccessPending  = "SUCCESSPENDING"
	statusRechargeFailure = "RECHARGEFAILURE"
)

// Status-check response statuses, from the status API samples.
const (
	statusRechargeSuccess        = "RECHARGESUCCESS"
	statusRechargeSuccessPending = "RECHARGESUCCESSPENDING"
)

// Validation response statuses.
const (
	statusValidationSuccess = "RECHARGEVALIDATIONSUCCESS"
	statusValidationFailure = "RECHARGEVALIDATIONFAILURE"
)

// Documented error codes.
const (
	// codeBadCredentials is returned by the token API when clientId or
	// clientSecret is wrong, and by the credit-card bill fetch for an invalid
	// request.
	codeBadCredentials = "1308"
	// codeTokenRejected means the token is expired, invalid, or absent. The
	// caller should re-mint and retry once.
	codeTokenRejected = "401"
	// codeEncryptionRejected means the provider could not process the encrypted
	// request. This is a client-side construction fault, not a transient error.
	codeEncryptionRejected = "900"
	// codeSystemError is the generic 500. Critically, for the payment endpoint
	// this is INCONCLUSIVE and requires a status check.
	codeSystemError = "500"
	// codeInternalError is the status API's generic internal failure.
	codeInternalError = "E500"
	// codePlansUnavailable means no plans exist for the operator/circle pair.
	codePlansUnavailable = "103"
)

// inconclusivePaymentTexts are provider messages that look like failures but are
// explicitly documented as requiring a status check.
//
// The spec states: "If you get the above mentioned response, kindly perform a
// status check for the same." Treating these as terminal failures would reverse
// a wallet hold for a payment that may have succeeded.
var inconclusivePaymentTexts = []string{
	"sorry! the transaction couldn't succeed",
	"sorry! the transaction couldn’t succeed", // curly apostrophe, as printed
	"something went wrong. please try again later.",
}

// PaymentMode values accepted by the payment endpoint, from the paymode table.
const (
	PaymentModeCash            = "Cash"
	PaymentModeCreditCard      = "Credit Card"
	PaymentModeDebitCard       = "Debit Card"
	PaymentModeInternetBanking = "Internet Banking"
	PaymentModeUPI             = "UPI"
	PaymentModeWallet          = "Wallet"
)

// CreditCardOperatorID is the fixed operator ID for credit-card bill payments.
// Spec: "Op will always be 208 in case of credit card bill payment".
const CreditCardOperatorID = "208"

// maxReqIDLength is the documented cap on reqid ("20 digits", and the UAT sample
// notes "Unique Reqid upto 20 characters").
const maxReqIDLength = 20

// xMClientHeader and xMClientValue are required on the plan-fetching API.
const (
	xMClientHeader = "X-MClient"
	xMClientValue  = "14"
)
