package bharatconnect

// Circle is a telecom circle from the provider's reference data.
type Circle struct {
	ID   int    `json:"id"`
	Name string `json:"name"`
}

// Circles returns the circle list documented in the provider specification.
//
// It is embedded rather than fetched because the provider exposes no circle
// endpoint, and a recharge cannot be validated without a circle id.
//
// Source: "Recharge & Bill Payment API Documentation", Circle List table.
func Circles() []Circle {
	return []Circle{
		{1, "Andhra Pradesh"},
		{2, "Assam"},
		{3, "Bihar & Jharkhand"},
		{4, "Chennai"},
		{5, "Delhi & NCR"},
		{6, "Gujarat"},
		{7, "Haryana"},
		{8, "Himachal Pradesh"},
		{9, "Jammu & Kashmir"},
		{10, "Karnataka"},
		{11, "Kerala"},
		{12, "Kolkata"},
		{13, "Maharashtra & Goa (except Mumbai)"},
		{14, "MP & Chattisgarh"},
		{15, "Mumbai"},
		{16, "North East"},
		{17, "Orissa"},
		{18, "Punjab"},
		{19, "Rajasthan"},
		{20, "Tamilnadu"},
		{21, "UP (East)"},
		{22, "UP (West) & Uttarakhand"},
		{23, "West Bengal"},
	}
}

// PlanTypeName maps a planType id to its label.
//
// Source: "Plan Type Categorisation" table. The ids are sparse, so a map is used
// rather than a slice.
func PlanTypeName(id int) string {
	if name, ok := planTypes[id]; ok {
		return name
	}
	return "Other"
}

// PlanTypes returns every documented plan type, for building a filter control.
func PlanTypes() map[int]string {
	out := make(map[int]string, len(planTypes))
	for k, v := range planTypes {
		out[k] = v
	}
	return out
}

var planTypes = map[int]string{
	1:  "All Plans",
	2:  "Full Talktime",
	3:  "Topup",
	4:  "Validity Recharge",
	5:  "Local SMS Pack",
	6:  "SMS",
	7:  "General SMS Pack",
	8:  "3G",
	9:  "Data",
	10: "Lifetime Validity",
	11: "Night Packs",
	12: "Unlimited Talktime",
	13: "Local Call",
	14: "STD",
	15: "ISD",
	16: "Rate Cutter",
	17: "Special Offer",
	18: "4G",
	19: "Monthly",
	20: "3 Month",
	21: "6 Month",
	22: "Annual",
	23: "Channel",
	24: "Popular",
	30: "121 Made For You",
	31: "Best Offers",
	41: "Jio Phone",
	42: "Smart Phone",
	43: "MNP",
	45: "Data Addon",
	46: "International Roaming",
	47: "JIO Cricket Plans",
	48: "Popular (Jio)",
}

// PaymentModes lists the payment modes the specification permits.
//
// Source: Recharge API "paymentMode" parameter description.
func PaymentModes() []string {
	return []string{"Cash", "Credit Card", "Debit Card", "Internet Banking", "UPI", "Wallet"}
}

// PaymentAccountInfoHint describes what paymentAccountInfo must contain for a
// given mode, per the specification's Paymode table.
//
// Sending the wrong shape here is a common integration error, so the rule is
// encoded rather than left to the caller's memory.
func PaymentAccountInfoHint(mode string) string {
	switch mode {
	case "Cash":
		return "Cash Payment"
	case "Credit Card", "Debit Card", "Internet Banking":
		return "Use the payment reference ID"
	case "UPI":
		return "Customer VPA, for example name@icici"
	case "Wallet":
		return "Linked mobile number"
	default:
		return ""
	}
}
