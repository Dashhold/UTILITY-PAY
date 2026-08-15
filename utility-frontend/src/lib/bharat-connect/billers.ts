import type { Biller, BillerParam } from "./types"

/**
 * Bharat Connect biller master.
 *
 * This is UAT sample data shaped exactly like the NBBL biller-master response,
 * so switching to the live `GET /bharat-connect/billers` endpoint is a data
 * source swap only. Biller IDs follow the NBBL convention.
 */

const consumerNumber = (label = "Consumer Number", len = 12): BillerParam => ({
  key: "consumerNumber",
  label,
  type: "text",
  minLength: 6,
  maxLength: len,
  placeholder: `Enter ${len}-digit ${label.toLowerCase()}`,
  helpText: "Printed on the top-left of your bill",
})

const mobileParam: BillerParam = {
  key: "mobileNumber",
  label: "Mobile Number",
  type: "tel",
  minLength: 10,
  maxLength: 10,
  pattern: "^[6-9][0-9]{9}$",
  placeholder: "10-digit registered mobile number",
}

const FLAT_0 = { type: "flat" as const, value: 0 }

function biller(b: Omit<Biller, "live"> & { live?: boolean }): Biller {
  return { live: true, ...b }
}

export const BILLERS: Biller[] = [
  // ---------------------------------------------------------------- Electricity
  biller({
    id: "MSEDCL00000MAH01", operatorId: "31", name: "MSEDCL (Mahavitaran)", categorySlug: "electricity",
    coverage: "Maharashtra", fetchRequirement: "MANDATORY", amountExactness: "Exact",
    supportsAdhoc: false, supportsPartPay: false, ccf: { type: "flat", value: 5 }, popular: true,
    params: [consumerNumber("Consumer Number", 12)],
  }),
  biller({
    id: "ADANIELE0000MUM01", operatorId: "31", name: "Adani Electricity Mumbai Ltd", categorySlug: "electricity",
    coverage: "Mumbai", fetchRequirement: "MANDATORY", amountExactness: "Exact",
    supportsAdhoc: false, supportsPartPay: false, ccf: { type: "flat", value: 5 }, popular: true,
    params: [consumerNumber("Consumer Number", 9)],
  }),
  biller({
    id: "TATAPOWE0000DEL01", operatorId: "31", name: "Tata Power Delhi Distribution Ltd", categorySlug: "electricity",
    coverage: "Delhi", fetchRequirement: "MANDATORY", amountExactness: "Exact",
    supportsAdhoc: false, supportsPartPay: false, ccf: { type: "flat", value: 5 }, popular: true,
    params: [{ key: "caNumber", label: "CA Number", type: "number", minLength: 9, maxLength: 9, placeholder: "9-digit CA number", helpText: "Contract Account number on your bill" }],
  }),
  biller({
    id: "BSESRAJD0000DEL01", operatorId: "31", name: "BSES Rajdhani Power Ltd", categorySlug: "electricity",
    coverage: "Delhi", fetchRequirement: "MANDATORY", amountExactness: "Exact",
    supportsAdhoc: false, supportsPartPay: false, ccf: { type: "flat", value: 5 }, popular: true,
    params: [consumerNumber("CA Number", 9)],
  }),
  biller({
    id: "TORRENTP0000GUJ01", name: "Torrent Power", categorySlug: "electricity",
    coverage: "Gujarat, Maharashtra", fetchRequirement: "MANDATORY", amountExactness: "Exact",
    supportsAdhoc: false, supportsPartPay: false, ccf: { type: "flat", value: 5 }, popular: false,
    params: [{ key: "serviceNumber", label: "Service Number", type: "number", minLength: 9, maxLength: 12, placeholder: "Enter service number" }],
  }),
  biller({
    id: "UPPCLURB0000UP001", name: "UPPCL (Urban)", categorySlug: "electricity",
    coverage: "Uttar Pradesh", fetchRequirement: "MANDATORY", amountExactness: "Exact",
    supportsAdhoc: false, supportsPartPay: true, ccf: { type: "flat", value: 5 }, popular: true,
    params: [consumerNumber("Account Number", 10)],
  }),
  biller({
    id: "BESCOM000000KAR01", name: "BESCOM", categorySlug: "electricity",
    coverage: "Karnataka", fetchRequirement: "MANDATORY", amountExactness: "Exact",
    supportsAdhoc: false, supportsPartPay: false, ccf: { type: "flat", value: 5 }, popular: false,
    params: [{ key: "accountId", label: "Account ID", type: "text", minLength: 6, maxLength: 12, placeholder: "Enter account ID" }],
  }),
  biller({
    id: "TNEB00000000TN001", name: "TNEB (TANGEDCO)", categorySlug: "electricity",
    coverage: "Tamil Nadu", fetchRequirement: "MANDATORY", amountExactness: "Exact",
    supportsAdhoc: false, supportsPartPay: false, ccf: { type: "flat", value: 5 }, popular: false,
    params: [consumerNumber("Consumer Number", 12)],
  }),

  // ---------------------------------------------------------------------- Water
  biller({
    id: "DELHIJAL0000DEL01", name: "Delhi Jal Board", categorySlug: "water",
    coverage: "Delhi", fetchRequirement: "MANDATORY", amountExactness: "Exact",
    supportsAdhoc: false, supportsPartPay: false, ccf: FLAT_0, popular: true,
    params: [{ key: "kNumber", label: "K Number", type: "number", minLength: 11, maxLength: 11, placeholder: "11-digit K number" }],
  }),
  biller({
    id: "BWSSB0000000KAR01", name: "Bangalore Water Supply & Sewerage Board", categorySlug: "water",
    coverage: "Karnataka", fetchRequirement: "MANDATORY", amountExactness: "Exact",
    supportsAdhoc: false, supportsPartPay: false, ccf: FLAT_0, popular: true,
    params: [{ key: "rrNumber", label: "RR Number", type: "text", minLength: 6, maxLength: 12, placeholder: "Enter RR number" }],
  }),
  biller({
    id: "CHENNAIM0000TN001", name: "Chennai Metro Water", categorySlug: "water",
    coverage: "Tamil Nadu", fetchRequirement: "MANDATORY", amountExactness: "Exact",
    supportsAdhoc: false, supportsPartPay: false, ccf: FLAT_0, popular: false,
    params: [consumerNumber("Consumer Number", 10)],
  }),
  biller({
    id: "PUNEMUNI0000MAH01", name: "Pune Municipal Corporation - Water", categorySlug: "water",
    coverage: "Maharashtra", fetchRequirement: "MANDATORY", amountExactness: "Exact",
    supportsAdhoc: false, supportsPartPay: false, ccf: FLAT_0, popular: false,
    params: [consumerNumber("Consumer Number", 12)],
  }),

  // ------------------------------------------------------------------------ Gas
  biller({
    id: "MAHANAGA0000MUM01", name: "Mahanagar Gas Ltd", categorySlug: "gas",
    coverage: "Mumbai", fetchRequirement: "MANDATORY", amountExactness: "Exact",
    supportsAdhoc: false, supportsPartPay: false, ccf: FLAT_0, popular: true,
    params: [{ key: "cardNumber", label: "CRN / Card Number", type: "number", minLength: 6, maxLength: 12, placeholder: "Enter customer reference number" }],
  }),
  biller({
    id: "INDRAPRA0000DEL01", name: "Indraprastha Gas Ltd", categorySlug: "gas",
    coverage: "Delhi NCR", fetchRequirement: "MANDATORY", amountExactness: "Exact",
    supportsAdhoc: false, supportsPartPay: false, ccf: FLAT_0, popular: true,
    params: [{ key: "customerId", label: "Customer ID", type: "number", minLength: 8, maxLength: 8, placeholder: "8-digit customer ID" }],
  }),
  biller({
    id: "GUJARATG0000GUJ01", name: "Gujarat Gas Ltd", categorySlug: "gas",
    coverage: "Gujarat", fetchRequirement: "MANDATORY", amountExactness: "Exact",
    supportsAdhoc: false, supportsPartPay: false, ccf: FLAT_0, popular: false,
    params: [{ key: "customerId", label: "Customer ID", type: "text", minLength: 6, maxLength: 14, placeholder: "Enter customer ID" }],
  }),

  // --------------------------------------------------------------- LPG Cylinder
  biller({
    id: "INDANEGA0000IND01", name: "Indane Gas (IOCL)", categorySlug: "lpg-cylinder",
    coverage: "National", fetchRequirement: "OPTIONAL", amountExactness: "Any",
    supportsAdhoc: true, supportsPartPay: false, ccf: FLAT_0, popular: true,
    params: [{ key: "lpgId", label: "LPG ID / Consumer Number", type: "text", minLength: 6, maxLength: 17, placeholder: "17-digit LPG ID" }, mobileParam],
  }),
  biller({
    id: "HPGAS0000000HPC01", name: "HP Gas", categorySlug: "lpg-cylinder",
    coverage: "National", fetchRequirement: "OPTIONAL", amountExactness: "Any",
    supportsAdhoc: true, supportsPartPay: false, ccf: FLAT_0, popular: true,
    params: [{ key: "consumerNumber", label: "Consumer Number", type: "text", minLength: 6, maxLength: 14, placeholder: "Enter consumer number" }],
  }),
  biller({
    id: "BHARATGA0000BPC01", name: "Bharat Gas", categorySlug: "lpg-cylinder",
    coverage: "National", fetchRequirement: "OPTIONAL", amountExactness: "Any",
    supportsAdhoc: true, supportsPartPay: false, ccf: FLAT_0, popular: false,
    params: [{ key: "consumerNumber", label: "Consumer Number", type: "text", minLength: 6, maxLength: 14, placeholder: "Enter consumer number" }],
  }),

  // ----------------------------------------------------------------- Broadband
  biller({
    id: "JIOFIBER0000NAT01", name: "JioFiber", categorySlug: "broadband",
    coverage: "National", fetchRequirement: "MANDATORY", amountExactness: "Exact",
    supportsAdhoc: false, supportsPartPay: false, ccf: FLAT_0, popular: true,
    params: [{ key: "customerId", label: "Customer ID / Registered Mobile", type: "text", minLength: 10, maxLength: 12, placeholder: "Enter customer ID" }],
  }),
  biller({
    id: "AIRTELXS0000NAT01", name: "Airtel Xstream Fiber", categorySlug: "broadband",
    coverage: "National", fetchRequirement: "MANDATORY", amountExactness: "Exact",
    supportsAdhoc: false, supportsPartPay: false, ccf: FLAT_0, popular: true,
    params: [{ key: "fixedLine", label: "Fixed Line / Account Number", type: "text", minLength: 8, maxLength: 14, placeholder: "Enter account number" }],
  }),
  biller({
    id: "BSNLBROA0000NAT01", name: "BSNL Broadband", categorySlug: "broadband",
    coverage: "National", fetchRequirement: "MANDATORY", amountExactness: "Exact",
    supportsAdhoc: false, supportsPartPay: false, ccf: FLAT_0, popular: false,
    params: [{ key: "accountNumber", label: "Account Number", type: "text", minLength: 6, maxLength: 14, placeholder: "Enter account number" }],
  }),
  biller({
    id: "ACTFIBER0000NAT01", name: "ACT Fibernet", categorySlug: "broadband",
    coverage: "National", fetchRequirement: "MANDATORY", amountExactness: "Exact",
    supportsAdhoc: false, supportsPartPay: false, ccf: FLAT_0, popular: false,
    params: [{ key: "userId", label: "User ID", type: "text", minLength: 6, maxLength: 16, placeholder: "Enter user ID" }],
  }),

  // ---------------------------------------------------------- Landline Postpaid
  biller({
    id: "BSNLLAND0000NAT01", name: "BSNL Landline", categorySlug: "landline",
    coverage: "National", fetchRequirement: "MANDATORY", amountExactness: "Exact",
    supportsAdhoc: false, supportsPartPay: false, ccf: FLAT_0, popular: true,
    params: [
      { key: "stdCode", label: "STD Code", type: "number", minLength: 2, maxLength: 5, placeholder: "e.g. 022" },
      { key: "landlineNumber", label: "Landline Number", type: "number", minLength: 6, maxLength: 10, placeholder: "Without STD code" },
    ],
  }),
  biller({
    id: "AIRTELLA0000NAT01", name: "Airtel Landline", categorySlug: "landline",
    coverage: "National", fetchRequirement: "MANDATORY", amountExactness: "Exact",
    supportsAdhoc: false, supportsPartPay: false, ccf: FLAT_0, popular: false,
    params: [{ key: "landlineNumber", label: "Landline Number with STD", type: "number", minLength: 10, maxLength: 11, placeholder: "e.g. 02240001234" }],
  }),

  // ----------------------------------------------------------- Mobile Postpaid
  biller({
    id: "AIRTELPO0000NAT01", name: "Airtel Postpaid", categorySlug: "mobile-postpaid",
    coverage: "National", fetchRequirement: "MANDATORY", amountExactness: "Exact and above",
    supportsAdhoc: false, supportsPartPay: true, ccf: FLAT_0, popular: true,
    params: [mobileParam],
  }),
  biller({
    id: "JIOPOSTP0000NAT01", name: "Jio Postpaid", categorySlug: "mobile-postpaid",
    coverage: "National", fetchRequirement: "MANDATORY", amountExactness: "Exact and above",
    supportsAdhoc: false, supportsPartPay: true, ccf: FLAT_0, popular: true,
    params: [mobileParam],
  }),
  biller({
    id: "VIPOSTPA0000NAT01", name: "Vi Postpaid", categorySlug: "mobile-postpaid",
    coverage: "National", fetchRequirement: "MANDATORY", amountExactness: "Exact and above",
    supportsAdhoc: false, supportsPartPay: true, ccf: FLAT_0, popular: true,
    params: [mobileParam],
  }),
  biller({
    id: "BSNLPOST0000NAT01", name: "BSNL Postpaid", categorySlug: "mobile-postpaid",
    coverage: "National", fetchRequirement: "MANDATORY", amountExactness: "Exact",
    supportsAdhoc: false, supportsPartPay: false, ccf: FLAT_0, popular: false,
    params: [mobileParam],
  }),

  // --------------------------------------------------------------------- FASTag
  biller({
    id: "ICICIFAS0000NAT01", name: "ICICI Bank FASTag", categorySlug: "fastag",
    coverage: "National", fetchRequirement: "NOT_SUPPORTED", amountExactness: "Any",
    supportsAdhoc: true, supportsPartPay: false, ccf: FLAT_0, popular: true,
    params: [{ key: "vehicleNumber", label: "Vehicle Registration Number", type: "text", minLength: 6, maxLength: 12, pattern: "^[A-Za-z]{2}[0-9A-Za-z]{4,10}$", placeholder: "e.g. MH01AB1234" }],
  }),
  biller({
    id: "HDFCFAST0000NAT01", name: "HDFC Bank FASTag", categorySlug: "fastag",
    coverage: "National", fetchRequirement: "NOT_SUPPORTED", amountExactness: "Any",
    supportsAdhoc: true, supportsPartPay: false, ccf: FLAT_0, popular: true,
    params: [{ key: "vehicleNumber", label: "Vehicle Registration Number", type: "text", minLength: 6, maxLength: 12, placeholder: "e.g. DL05CD6789" }],
  }),
  biller({
    id: "PAYTMFAS0000NAT01", name: "Paytm Payments Bank FASTag", categorySlug: "fastag",
    coverage: "National", fetchRequirement: "NOT_SUPPORTED", amountExactness: "Any",
    supportsAdhoc: true, supportsPartPay: false, ccf: FLAT_0, popular: false,
    params: [{ key: "vehicleNumber", label: "Vehicle Registration Number", type: "text", minLength: 6, maxLength: 12, placeholder: "e.g. KA03EF4567" }],
  }),

    // ---------------------------------------------------- Insurance Premium
  biller({
    id: "LICOFIND0000NAT01", name: "Life Insurance Corporation of India", categorySlug: "insurance",
    coverage: "National", fetchRequirement: "MANDATORY", amountExactness: "Exact",
    supportsAdhoc: false, supportsPartPay: false, ccf: FLAT_0, popular: true,
    params: [
      { key: "policyNumber", label: "Policy Number", type: "number", minLength: 8, maxLength: 9, placeholder: "9-digit policy number" },
      { key: "dateOfBirth", label: "Policy Holder Date of Birth", type: "date" },
    ],
  }),
  biller({
    id: "HDFCLIFE0000NAT01", name: "HDFC Life Insurance", categorySlug: "insurance",
    coverage: "National", fetchRequirement: "MANDATORY", amountExactness: "Exact",
    supportsAdhoc: false, supportsPartPay: false, ccf: FLAT_0, popular: true,
    params: [{ key: "policyNumber", label: "Policy Number", type: "text", minLength: 6, maxLength: 14, placeholder: "Enter policy number" }],
  }),
  biller({
    id: "ICICIPRU0000NAT01", name: "ICICI Prudential Life Insurance", categorySlug: "insurance",
    coverage: "National", fetchRequirement: "MANDATORY", amountExactness: "Exact",
    supportsAdhoc: false, supportsPartPay: false, ccf: FLAT_0, popular: false,
    params: [{ key: "policyNumber", label: "Policy Number", type: "text", minLength: 6, maxLength: 14, placeholder: "Enter policy number" }],
  }),
  biller({
    id: "STARHEAL0000NAT01", name: "Star Health Insurance", categorySlug: "insurance",
    coverage: "National", fetchRequirement: "MANDATORY", amountExactness: "Exact",
    supportsAdhoc: false, supportsPartPay: false, ccf: FLAT_0, popular: false,
    params: [{ key: "policyNumber", label: "Policy Number", type: "text", minLength: 6, maxLength: 16, placeholder: "Enter policy number" }],
  }),

  // ------------------------------------------------------------ Loan Repayment
  biller({
    id: "BAJAJFIN0000NAT01", name: "Bajaj Finance Ltd", categorySlug: "loan-emi",
    coverage: "National", fetchRequirement: "MANDATORY", amountExactness: "Exact",
    supportsAdhoc: false, supportsPartPay: false, ccf: FLAT_0, popular: true,
    params: [{ key: "loanNumber", label: "Loan Account Number", type: "text", minLength: 6, maxLength: 16, placeholder: "Enter loan account number" }],
  }),
  biller({
    id: "MUTHOOTF0000NAT01", name: "Muthoot Finance Ltd", categorySlug: "loan-emi",
    coverage: "National", fetchRequirement: "MANDATORY", amountExactness: "Exact",
    supportsAdhoc: false, supportsPartPay: false, ccf: FLAT_0, popular: false,
    params: [{ key: "loanNumber", label: "Loan Account Number", type: "text", minLength: 6, maxLength: 20, placeholder: "Enter loan account number" }],
  }),
  biller({
    id: "HDBFINAN0000NAT01", name: "HDB Financial Services", categorySlug: "loan-emi",
    coverage: "National", fetchRequirement: "MANDATORY", amountExactness: "Exact",
    supportsAdhoc: false, supportsPartPay: false, ccf: FLAT_0, popular: false,
    params: [{ key: "loanNumber", label: "Loan Account Number", type: "text", minLength: 6, maxLength: 16, placeholder: "Enter loan account number" }],
  }),

  // ---------------------------------------------------------- Municipal Taxes
  biller({
    id: "BMCPROPT0000MUM01", name: "Municipal Corporation of Greater Mumbai", categorySlug: "municipal-taxes",
    coverage: "Mumbai", fetchRequirement: "MANDATORY", amountExactness: "Exact",
    supportsAdhoc: false, supportsPartPay: false, ccf: FLAT_0, popular: true,
    params: [{ key: "propertyAccountNumber", label: "Property Account Number", type: "text", minLength: 6, maxLength: 16, placeholder: "Enter property account number" }],
  }),
  biller({
    id: "BBMPPROP0000KAR01", name: "BBMP Property Tax", categorySlug: "municipal-taxes",
    coverage: "Karnataka", fetchRequirement: "MANDATORY", amountExactness: "Exact",
    supportsAdhoc: false, supportsPartPay: false, ccf: FLAT_0, popular: true,
    params: [{ key: "sasApplicationNumber", label: "SAS Application Number", type: "text", minLength: 6, maxLength: 16, placeholder: "Enter SAS application number" }],
  }),
  biller({
    id: "PMCPROPT0000MAH01", name: "Pune Municipal Corporation - Property Tax", categorySlug: "municipal-taxes",
    coverage: "Maharashtra", fetchRequirement: "MANDATORY", amountExactness: "Exact",
    supportsAdhoc: false, supportsPartPay: false, ccf: FLAT_0, popular: false,
    params: [{ key: "propertyId", label: "Property ID", type: "text", minLength: 6, maxLength: 16, placeholder: "Enter property ID" }],
  }),

  // ------------------------------------------------------- Municipal Services
  biller({
    id: "NMCSERVI0000MAH01", name: "Nagpur Municipal Corporation - Services", categorySlug: "municipal-services",
    coverage: "Maharashtra", fetchRequirement: "MANDATORY", amountExactness: "Exact",
    supportsAdhoc: false, supportsPartPay: false, ccf: FLAT_0, popular: false,
    params: [consumerNumber("Service Number", 14)],
  }),
  biller({
    id: "GHMCSERV0000TEL01", name: "GHMC - Trade Licence Fees", categorySlug: "municipal-services",
    coverage: "Telangana", fetchRequirement: "MANDATORY", amountExactness: "Exact",
    supportsAdhoc: false, supportsPartPay: false, ccf: FLAT_0, popular: false,
    params: [{ key: "licenceNumber", label: "Trade Licence Number", type: "text", minLength: 6, maxLength: 16, placeholder: "Enter licence number" }],
  }),

  // ----------------------------------------------------------- Education Fees
  biller({
    id: "DELHIUNI0000DEL01", name: "University of Delhi", categorySlug: "education-fees",
    coverage: "Delhi", fetchRequirement: "MANDATORY", amountExactness: "Exact",
    supportsAdhoc: false, supportsPartPay: false, ccf: FLAT_0, popular: true,
    params: [{ key: "enrollmentNumber", label: "Enrollment Number", type: "text", minLength: 6, maxLength: 16, placeholder: "Enter enrollment number" }],
  }),
  biller({
    id: "AMITYUNI0000UP001", name: "Amity University", categorySlug: "education-fees",
    coverage: "National", fetchRequirement: "MANDATORY", amountExactness: "Exact",
    supportsAdhoc: false, supportsPartPay: true, ccf: FLAT_0, popular: false,
    params: [{ key: "studentId", label: "Student ID", type: "text", minLength: 6, maxLength: 16, placeholder: "Enter student ID" }],
  }),
  biller({
    id: "KENDRIYA0000NAT01", name: "Kendriya Vidyalaya Sangathan", categorySlug: "education-fees",
    coverage: "National", fetchRequirement: "MANDATORY", amountExactness: "Exact",
    supportsAdhoc: false, supportsPartPay: false, ccf: FLAT_0, popular: false,
    params: [{ key: "admissionNumber", label: "Admission Number", type: "text", minLength: 4, maxLength: 16, placeholder: "Enter admission number" }],
  }),

  // ---------------------------------------------------------- Housing Society
  biller({
    id: "MYGATE000000NAT01", name: "MyGate Housing Society", categorySlug: "housing-society",
    coverage: "National", fetchRequirement: "MANDATORY", amountExactness: "Exact",
    supportsAdhoc: false, supportsPartPay: false, ccf: FLAT_0, popular: true,
    params: [{ key: "flatCode", label: "Flat / Unit Code", type: "text", minLength: 4, maxLength: 16, placeholder: "Enter flat code" }, mobileParam],
  }),
  biller({
    id: "ADDAHOUS0000NAT01", name: "ADDA Housing Society", categorySlug: "housing-society",
    coverage: "National", fetchRequirement: "MANDATORY", amountExactness: "Exact",
    supportsAdhoc: false, supportsPartPay: false, ccf: FLAT_0, popular: false,
    params: [{ key: "memberCode", label: "Member Code", type: "text", minLength: 4, maxLength: 16, placeholder: "Enter member code" }],
  }),

  // ------------------------------------------------------------------ Cable TV
  biller({
    id: "HATHWAYC0000NAT01", name: "Hathway Cable", categorySlug: "cable-tv",
    coverage: "National", fetchRequirement: "OPTIONAL", amountExactness: "Any",
    supportsAdhoc: true, supportsPartPay: false, ccf: FLAT_0, popular: true,
    params: [{ key: "subscriberId", label: "Subscriber ID", type: "text", minLength: 6, maxLength: 16, placeholder: "Enter subscriber ID" }],
  }),
  biller({
    id: "GTPLCABL0000GUJ01", name: "GTPL Cable", categorySlug: "cable-tv",
    coverage: "Gujarat", fetchRequirement: "OPTIONAL", amountExactness: "Any",
    supportsAdhoc: true, supportsPartPay: false, ccf: FLAT_0, popular: false,
    params: [{ key: "subscriberId", label: "Subscriber ID", type: "text", minLength: 6, maxLength: 16, placeholder: "Enter subscriber ID" }],
  }),
  biller({
    id: "TATAPLAY0000NAT01", name: "Tata Play", categorySlug: "cable-tv",
    coverage: "National", fetchRequirement: "OPTIONAL", amountExactness: "Any",
    supportsAdhoc: true, supportsPartPay: false, ccf: FLAT_0, popular: true,
    params: [{ key: "subscriberId", label: "Subscriber ID", type: "number", minLength: 10, maxLength: 10, placeholder: "10-digit subscriber ID" }],
  }),

  // -------------------------------------------------------------- Subscription
  biller({
    id: "HOTSTARS0000NAT01", name: "JioHotstar Subscription", categorySlug: "subscription",
    coverage: "National", fetchRequirement: "MANDATORY", amountExactness: "Exact",
    supportsAdhoc: false, supportsPartPay: false, ccf: FLAT_0, popular: true,
    params: [{ key: "registeredMobile", label: "Registered Mobile Number", type: "tel", minLength: 10, maxLength: 10, placeholder: "10-digit mobile number" }],
  }),
  biller({
    id: "SONYLIVS0000NAT01", name: "SonyLIV Subscription", categorySlug: "subscription",
    coverage: "National", fetchRequirement: "MANDATORY", amountExactness: "Exact",
    supportsAdhoc: false, supportsPartPay: false, ccf: FLAT_0, popular: false,
    params: [{ key: "registeredMobile", label: "Registered Mobile Number", type: "tel", minLength: 10, maxLength: 10, placeholder: "10-digit mobile number" }],
  }),

  // ------------------------------------------------------------------ Hospital
  biller({
    id: "APOLLOHO0000NAT01", name: "Apollo Hospitals", categorySlug: "hospital",
    coverage: "National", fetchRequirement: "MANDATORY", amountExactness: "Exact",
    supportsAdhoc: false, supportsPartPay: true, ccf: FLAT_0, popular: true,
    params: [{ key: "patientId", label: "Patient / UHID Number", type: "text", minLength: 4, maxLength: 16, placeholder: "Enter UHID" }],
  }),
  biller({
    id: "FORTISHO0000NAT01", name: "Fortis Healthcare", categorySlug: "hospital",
    coverage: "National", fetchRequirement: "MANDATORY", amountExactness: "Exact",
    supportsAdhoc: false, supportsPartPay: true, ccf: FLAT_0, popular: false,
    params: [{ key: "patientId", label: "Patient ID", type: "text", minLength: 4, maxLength: 16, placeholder: "Enter patient ID" }],
  }),

  // --------------------------------------------------------------- Credit Card
  biller({
    id: "HDFCCRED0000NAT01", name: "HDFC Bank Credit Card", categorySlug: "credit-card",
    coverage: "National", fetchRequirement: "MANDATORY", amountExactness: "Exact, above and below",
    supportsAdhoc: false, supportsPartPay: true, ccf: FLAT_0, popular: true,
    params: [{ key: "cardNumber", label: "Last 4 digits of Card", type: "number", minLength: 4, maxLength: 4, placeholder: "1234" }, mobileParam],
  }),
  biller({
    id: "SBICARDS0000NAT01", name: "SBI Card", categorySlug: "credit-card",
    coverage: "National", fetchRequirement: "MANDATORY", amountExactness: "Exact, above and below",
    supportsAdhoc: false, supportsPartPay: true, ccf: FLAT_0, popular: true,
    params: [{ key: "cardNumber", label: "Last 4 digits of Card", type: "number", minLength: 4, maxLength: 4, placeholder: "1234" }, mobileParam],
  }),

  // ------------------------------------------------------ Clubs & Associations
  biller({
    id: "WILLINGD0000MUM01", name: "Willingdon Sports Club", categorySlug: "clubs-associations",
    coverage: "Mumbai", fetchRequirement: "MANDATORY", amountExactness: "Exact",
    supportsAdhoc: false, supportsPartPay: false, ccf: FLAT_0, popular: false,
    params: [{ key: "membershipNumber", label: "Membership Number", type: "text", minLength: 4, maxLength: 16, placeholder: "Enter membership number" }],
  }),

  // -------------------------------------------------------------------- Rental
  biller({
    id: "NOBROKER0000NAT01", name: "NoBroker Rent Payment", categorySlug: "rental",
    coverage: "National", fetchRequirement: "OPTIONAL", amountExactness: "Any",
    supportsAdhoc: true, supportsPartPay: false, ccf: { type: "percent", value: 0.5, cap: 50 }, popular: false,
    params: [{ key: "agreementId", label: "Rent Agreement ID", type: "text", minLength: 4, maxLength: 20, placeholder: "Enter agreement ID" }, mobileParam],
  }),
]

export const LIVE_BILLERS = BILLERS.filter((b) => b.live)

export function billersByCategory(categorySlug: string): Biller[] {
  return LIVE_BILLERS.filter((b) => b.categorySlug === categorySlug)
}

export function popularBillers(categorySlug?: string): Biller[] {
  return LIVE_BILLERS.filter((b) => b.popular && (!categorySlug || b.categorySlug === categorySlug))
}

export function findBiller(id: string): Biller | undefined {
  return BILLERS.find((b) => b.id === id)
}

export function searchBillers(query: string, categorySlug?: string): Biller[] {
  const q = query.trim().toLowerCase()
  const pool = categorySlug ? billersByCategory(categorySlug) : LIVE_BILLERS
  if (!q) return pool
  return pool.filter(
    (b) =>
      b.name.toLowerCase().includes(q) ||
      b.coverage.toLowerCase().includes(q) ||
      b.id.toLowerCase().includes(q)
  )
}

/** Customer Convenience Fee for a given biller and bill amount. */
export function calculateCcf(biller: Biller, billAmount: number): number {
  const { type, value, cap } = biller.ccf
  if (type === "flat") return value
  const fee = (billAmount * value) / 100
  return Math.round((cap ? Math.min(fee, cap) : fee) * 100) / 100
}
