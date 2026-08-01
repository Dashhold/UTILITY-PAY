package bharatconnect

// Operation labels recorded on every audit entry.
//
// These are exported and centralised because the UAT evidence bundle queries logs
// by operation. If the client wrote ad-hoc string literals, renaming one would
// silently empty a checklist section rather than fail to compile.
const (
	OpToken      = "token"
	OpPlans      = "plans"
	OpBalance    = "balance"
	OpValidation = "validation"
	OpViewBill   = "view_bill"
	OpPayment    = "payment"
	OpStatus     = "status"
	OpCCBill     = "cc_bill"
)

// AllOperations returns every operation label, in checklist order.
func AllOperations() []string {
	return []string{
		OpToken,
		OpBalance,
		OpValidation,
		OpViewBill,
		OpPayment,
		OpStatus,
		OpPlans,
		OpCCBill,
	}
}
