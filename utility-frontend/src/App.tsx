import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom"
import { Toaster } from "@/components/ui/sonner"
import { TooltipProvider } from "@/components/ui/tooltip"
import { AuthProvider } from "@/context/auth-context"
import { ProtectedRoute } from "@/components/auth/protected-route"
import { DashboardLayout } from "@/components/layout/dashboard-layout"
import { adminNav, retailerNav } from "@/config/nav"
import { LoginPage } from "@/pages/auth/login"
import { NotFound } from "@/pages/errors/not-found"

import { AdminDashboard } from "@/pages/admin/dashboard"
import { ServiceCategoryPage } from "@/pages/admin/modules/service-category"
import { CityMasterPage } from "@/pages/admin/modules/city-master"
import { UserTypeMasterPage } from "@/pages/admin/modules/user-type-master"
import { ServiceMasterPage } from "@/pages/admin/modules/service-master"
import { PlanMasterPage } from "@/pages/admin/modules/plan-master"
import { CommissionSlotsPage } from "@/pages/admin/modules/commission-slots"
import { AnnouncementsPage } from "@/pages/admin/modules/announcements"
import { TicketDepartmentsPage } from "@/pages/admin/modules/ticket-departments"
import { CompanyBanksPage } from "@/pages/admin/company-banks"
import { UserManagerPage } from "@/pages/admin/user-manager/index"
import { RetailerProfilePage } from "@/pages/admin/user-manager/retailer-profile"
import { AccountHistoryPage } from "@/pages/admin/account-history"
import { ServiceReportPage } from "@/pages/admin/service-report"
import { FundRequestsPage } from "@/pages/admin/fund-requests"
import { PayoutBanksPage } from "@/pages/admin/payout-banks"
import { FundTransferPage } from "@/pages/admin/fund-transfer"
import { AdminSettingsPage } from "@/pages/admin/settings"

import { RetailerDashboard } from "@/pages/retailer/dashboard"
import { ProfilePage } from "@/pages/retailer/profile"
import { KycPage } from "@/pages/retailer/kyc"
import { AepsWorkspace } from "@/pages/retailer/services/aeps"
import { RetailerServiceReportPage } from "@/pages/retailer/service-report"

import { BharatConnectFlowProvider } from "@/lib/bharat-connect/flow-context"
import { BharatConnectHome } from "@/pages/bharat-connect/home"
import { BharatConnectCategories } from "@/pages/bharat-connect/categories"
import { BharatConnectBillers } from "@/pages/bharat-connect/billers"
import { BharatConnectBillFetch } from "@/pages/bharat-connect/bill-fetch"
import { BharatConnectPayment } from "@/pages/bharat-connect/payment"
import { BharatConnectSuccess } from "@/pages/bharat-connect/success"
import { BharatConnectReceipt } from "@/pages/bharat-connect/receipt"
import { BharatConnectComplaints } from "@/pages/bharat-connect/complaints"
import { BharatConnectTransactions } from "@/pages/bharat-connect/transactions"
import { BharatConnectSmsReceipt } from "@/pages/bharat-connect/sms-receipt"
import { RetailerAccountHistoryPage } from "@/pages/retailer/account-history"
import { CommissionSlabPage } from "@/pages/retailer/commission-slab"
import { GstReportPage } from "@/pages/retailer/gst-report"
import { TdsReportPage } from "@/pages/retailer/tds-report"
import { CommissionReportPage } from "@/pages/retailer/commission-report"
import { RetailerSettingsPage } from "@/pages/retailer/settings"

/**
 * The path the app is mounted under, e.g. "/app".
 *
 * Vite sets BASE_URL from the `base` build option. Router basenames must not have
 * a trailing slash, and "/" must become "" or every route would be prefixed twice.
 */
const ROUTER_BASENAME = import.meta.env.BASE_URL.replace(/\/$/, "")

export default function App() {
  return (
    <AuthProvider>
      <TooltipProvider delayDuration={200}>
        <BharatConnectFlowProvider>
        <BrowserRouter basename={ROUTER_BASENAME}>
          <Routes>
            <Route path="/" element={<Navigate to="/login" replace />} />
            <Route path="/login" element={<LoginPage />} />

            <Route element={<ProtectedRoute allowedRole="admin" />}>
              <Route path="/admin" element={<DashboardLayout navItems={adminNav} brandLabel="Admin Panel" />}>
                <Route index element={<AdminDashboard />} />
                <Route path="modules/service-category" element={<ServiceCategoryPage />} />
                <Route path="modules/city-master" element={<CityMasterPage />} />
                <Route path="modules/user-type-master" element={<UserTypeMasterPage />} />
                <Route path="modules/service-master" element={<ServiceMasterPage />} />
                <Route path="modules/plan-master" element={<PlanMasterPage />} />
                <Route path="modules/commission-slots" element={<CommissionSlotsPage />} />
                <Route path="modules/announcements" element={<AnnouncementsPage />} />
                <Route path="modules/ticket-departments" element={<TicketDepartmentsPage />} />

                {/* The product catalogue and order management are out of scope
                    for this release. The backend models and endpoints remain, so
                    restoring the screens is a routing change rather than a
                    rebuild. */}
                <Route path="products/*" element={<Navigate to="/admin" replace />} />
                <Route path="orders" element={<Navigate to="/admin" replace />} />

                <Route path="company-banks" element={<CompanyBanksPage />} />
                <Route path="user-manager" element={<UserManagerPage />} />
                <Route path="user-manager/:id" element={<RetailerProfilePage />} />
                <Route path="account-history" element={<AccountHistoryPage />} />
                <Route path="service-report" element={<ServiceReportPage />} />
                <Route path="fund-requests" element={<FundRequestsPage />} />
                <Route path="payout-banks" element={<PayoutBanksPage />} />
                <Route path="fund-transfer" element={<FundTransferPage />} />
                <Route path="settings" element={<AdminSettingsPage />} />
                <Route path="*" element={<NotFound />} />
              </Route>
            </Route>

            <Route element={<ProtectedRoute allowedRole="retailer" />}>
              <Route path="/retailer" element={<DashboardLayout navItems={retailerNav} brandLabel="Retailer Panel" />}>
                <Route index element={<RetailerDashboard />} />
                <Route path="profile" element={<ProfilePage />} />
                <Route path="kyc" element={<KycPage />} />
                <Route path="services" element={<Navigate to="/retailer/services/aeps" replace />} />
                <Route path="services/aeps" element={<AepsWorkspace />} />

                {/* Legacy path — NPCI has retired the BBPS name in favour of Bharat Connect. */}
                <Route path="services/bbps" element={<Navigate to="/retailer/bharat-connect" replace />} />

                {/* Bharat Connect compliance journey. Each stage is a distinct
                    screen so it can be captured for the NPCI submission PDF. */}
                <Route path="bharat-connect">
                  <Route index element={<BharatConnectHome />} />
                  <Route path="categories" element={<BharatConnectCategories />} />
                  <Route path="billers/:categorySlug" element={<BharatConnectBillers />} />
                  <Route path="billers/:categorySlug/:billerId" element={<BharatConnectBillFetch />} />
                  <Route path="payment" element={<BharatConnectPayment />} />
                  <Route path="success/:txnId" element={<BharatConnectSuccess />} />
                  <Route path="receipt/:txnId" element={<BharatConnectReceipt />} />
                  <Route path="sms-receipt/:txnId" element={<BharatConnectSmsReceipt />} />
                  <Route path="transactions" element={<BharatConnectTransactions />} />
                  <Route path="complaints" element={<BharatConnectComplaints />} />
                </Route>

                <Route path="service-report" element={<RetailerServiceReportPage />} />
                <Route path="account-history" element={<RetailerAccountHistoryPage />} />
                <Route path="commission-slab" element={<CommissionSlabPage />} />
                <Route path="gst-report" element={<GstReportPage />} />
                <Route path="tds-report" element={<TdsReportPage />} />
                <Route path="commission-report" element={<CommissionReportPage />} />
                <Route path="settings" element={<RetailerSettingsPage />} />
                <Route path="*" element={<NotFound />} />
              </Route>
            </Route>

            <Route path="*" element={<NotFound />} />
          </Routes>
        </BrowserRouter>
        </BharatConnectFlowProvider>
        <Toaster />
      </TooltipProvider>
    </AuthProvider>
  )
}
