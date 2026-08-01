export type Role = "admin" | "retailer"

export type TxStatus = "success" | "pending" | "failed" | "processing" | "refunded"

export interface StatCard {
  label: string
  value: string
  change?: string
  trend?: "up" | "down" | "flat"
  icon?: string
}

export interface Transaction {
  id: string
  txnId: string
  date: string
  service: string
  category: "AEPS" | "BBPS" | "Recharge" | "DTH" | "Money Transfer" | "FASTag" | "Insurance" | "Verification"
  retailer: string
  amount: number
  commission: number
  status: TxStatus
  mode?: string
}

export interface FundRequest {
  id: string
  retailer: string
  amount: number
  mode: string
  bank: string
  date: string
  status: "pending" | "approved" | "rejected"
  utr?: string
}

export interface PayoutBank {
  id: string
  bankName: string
  accountNumber: string
  ifsc: string
  branch: string
  linkedRetailers: number
  status: "active" | "inactive"
}

export interface Retailer {
  id: string
  name: string
  shopName: string
  email: string
  phone: string
  city: string
  state: string
  walletBalance: number
  kycStatus: "verified" | "pending" | "rejected" | "not_submitted"
  status: "active" | "inactive" | "suspended"
  joinedDate: string
  userType: string
}

export const PRODUCT_CATEGORIES = [
  "POS Machines",
  "Biometric Devices",
  "Printers",
  "Stationery",
  "Card Readers",
  "Accessories",
] as const

export type ProductCategory = (typeof PRODUCT_CATEGORIES)[number]

export type ProductStatus = "enabled" | "disabled"

export interface Product {
  id: string
  name: string
  sku: string
  category: ProductCategory
  description: string
  price: number
  stock: number
  status: ProductStatus
  createdDate: string
}

export type OrderStatus = "pending" | "processing" | "shipped" | "delivered" | "cancelled"

export interface ProductOrderItem {
  productName: string
  sku: string
  quantity: number
  price: number
}

export interface ProductOrder {
  id: string
  orderId: string
  retailer: string
  product: string
  quantity: number
  amount: number
  status: OrderStatus
  date: string
  items: ProductOrderItem[]
  shippingAddress: string
}

export interface ServiceCategoryItem {
  id: string
  name: string
  icon: string
  description: string
  status: "enabled" | "disabled"
  servicesCount: number
}

export interface City {
  id: string
  name: string
  state: string
  status: "active" | "inactive"
  pincodeFrom: string
  pincodeTo: string
}

export interface UserTypeItem {
  id: string
  name: string
  description: string
  permissions: string[]
  status: "active" | "inactive"
  usersCount: number
}

export interface ServiceItem {
  id: string
  name: string
  category: string
  apiProvider: string
  status: "active" | "inactive"
  minAmount: number
  maxAmount: number
}

export interface CommissionPlan {
  id: string
  name: string
  userType: string
  services: string[]
  status: "active" | "inactive"
}

export interface CommissionSlot {
  id: string
  service: string
  slabType: "flat" | "percentage"
  value: number
  tds: number
  gst: number
  userType: string
  status: "active" | "inactive"
}

export type AnnouncementAudience = "Admin" | "Retailer" | "All"

export interface Announcement {
  id: string
  title: string
  message: string
  audience: AnnouncementAudience
  status: "published" | "draft" | "expired"
  publishedDate: string
  expiryDate: string
}

export interface TicketDepartment {
  id: string
  name: string
  description: string
  agentsCount: number
  status: "active" | "inactive"
}
