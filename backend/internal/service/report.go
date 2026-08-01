package service

import (
	"context"
	"fmt"
	"time"

	"github.com/google/uuid"
	"github.com/shopspring/decimal"
	"gorm.io/gorm"

	"github.com/utilipay/backend/internal/models"
)

// ReportService produces the retailer statutory and earnings reports.
type ReportService struct {
	db *gorm.DB
}

// NewReportService builds a ReportService.
func NewReportService(db *gorm.DB) *ReportService {
	return &ReportService{db: db}
}

// CommissionRow is one service's earnings over the reporting window.
type CommissionRow struct {
	Service     string `json:"service"`
	Category    string `json:"category"`
	Count       int64  `json:"count"`
	Volume      Money  `json:"volume"`
	Commission  Money  `json:"commission"`
	TDS         Money  `json:"tds"`
	GST         Money  `json:"gst"`
	NetEarnings Money  `json:"netEarnings"`
}

// CommissionReport is the commission report payload.
type CommissionReport struct {
	From  *time.Time      `json:"from,omitempty"`
	To    *time.Time      `json:"to,omitempty"`
	Rows  []CommissionRow `json:"rows"`
	Total CommissionRow   `json:"total"`
	// Monthly powers the earnings chart.
	Monthly []MonthlyEarnings `json:"monthly"`
}

// MonthlyEarnings is one month's aggregate.
type MonthlyEarnings struct {
	Month      string `json:"month"`
	Volume     Money  `json:"volume"`
	Commission Money  `json:"commission"`
	Count      int64  `json:"count"`
}

// Commission aggregates earnings by service.
//
// Only successful transactions are counted: a failed or pending transaction has
// earned nothing, and including them would overstate income on a statutory report.
func (s *ReportService) Commission(ctx context.Context, retailerID uuid.UUID, from, to *time.Time) (*CommissionReport, error) {
	q := s.scoped(ctx, retailerID, from, to)

	var rows []CommissionRow
	err := q.Select(`service,
	                 category,
	                 COUNT(*) AS count,
	                 COALESCE(SUM(amount), 0) AS volume,
	                 COALESCE(SUM(commission), 0) AS commission,
	                 COALESCE(SUM(tds), 0) AS tds,
	                 COALESCE(SUM(gst), 0) AS gst,
	                 COALESCE(SUM(commission - tds - gst), 0) AS net_earnings`).
		Group("service, category").
		Order("commission DESC").
		Scan(&rows).Error
	if err != nil {
		return nil, fmt.Errorf("report: commission rows: %w", err)
	}

	total := CommissionRow{
		Service: "Total",
		Volume:  decimal.Zero, Commission: decimal.Zero,
		TDS: decimal.Zero, GST: decimal.Zero, NetEarnings: decimal.Zero,
	}
	for _, r := range rows {
		total.Count += r.Count
		total.Volume = total.Volume.Add(r.Volume)
		total.Commission = total.Commission.Add(r.Commission)
		total.TDS = total.TDS.Add(r.TDS)
		total.GST = total.GST.Add(r.GST)
		total.NetEarnings = total.NetEarnings.Add(r.NetEarnings)
	}

	monthly, err := s.monthly(ctx, retailerID, from, to)
	if err != nil {
		return nil, err
	}

	return &CommissionReport{From: from, To: to, Rows: rows, Total: total, Monthly: monthly}, nil
}

// monthly aggregates volume and commission by calendar month.
func (s *ReportService) monthly(ctx context.Context, retailerID uuid.UUID, from, to *time.Time) ([]MonthlyEarnings, error) {
	var rows []MonthlyEarnings
	err := s.scoped(ctx, retailerID, from, to).
		Select(`to_char(created_at, 'YYYY-MM') AS month,
		        COALESCE(SUM(amount), 0) AS volume,
		        COALESCE(SUM(commission), 0) AS commission,
		        COUNT(*) AS count`).
		Group("month").
		Order("month ASC").
		Scan(&rows).Error
	if err != nil {
		return nil, fmt.Errorf("report: monthly earnings: %w", err)
	}
	return rows, nil
}

// GSTRow is one month's GST liability.
type GSTRow struct {
	Month      string `json:"month"`
	Count      int64  `json:"count"`
	Commission Money  `json:"commission"`
	GST        Money  `json:"gst"`
}

// GSTReport is the GST report payload.
type GSTReport struct {
	From  *time.Time `json:"from,omitempty"`
	To    *time.Time `json:"to,omitempty"`
	Rows  []GSTRow   `json:"rows"`
	Total Money      `json:"totalGst"`
	// GSTIN is echoed so the rendered report carries the retailer's registration.
	GSTIN string `json:"gstin"`
}

// GST aggregates GST deducted from commission, by month.
func (s *ReportService) GST(ctx context.Context, retailerID uuid.UUID, from, to *time.Time) (*GSTReport, error) {
	var rows []GSTRow
	err := s.scoped(ctx, retailerID, from, to).
		Select(`to_char(created_at, 'YYYY-MM') AS month,
		        COUNT(*) AS count,
		        COALESCE(SUM(commission), 0) AS commission,
		        COALESCE(SUM(gst), 0) AS gst`).
		Group("month").
		Order("month DESC").
		Scan(&rows).Error
	if err != nil {
		return nil, fmt.Errorf("report: gst rows: %w", err)
	}

	total := decimal.Zero
	for _, r := range rows {
		total = total.Add(r.GST)
	}

	var retailer models.Retailer
	if err := s.db.WithContext(ctx).Select("gstin").Where("id = ?", retailerID).First(&retailer).Error; err != nil {
		return nil, fmt.Errorf("report: load gstin: %w", err)
	}

	return &GSTReport{From: from, To: to, Rows: rows, Total: total, GSTIN: retailer.GSTIN}, nil
}

// TDSRow is one month's TDS deduction.
type TDSRow struct {
	Month      string `json:"month"`
	Count      int64  `json:"count"`
	Commission Money  `json:"commission"`
	TDS        Money  `json:"tds"`
}

// TDSReport is the TDS report payload.
type TDSReport struct {
	From  *time.Time `json:"from,omitempty"`
	To    *time.Time `json:"to,omitempty"`
	Rows  []TDSRow   `json:"rows"`
	Total Money      `json:"totalTds"`
	PAN   string     `json:"pan"`
	// FinancialYear labels the Indian tax year the window falls in.
	FinancialYear string `json:"financialYear"`
}

// TDS aggregates TDS deducted from commission, by month.
func (s *ReportService) TDS(ctx context.Context, retailerID uuid.UUID, from, to *time.Time) (*TDSReport, error) {
	var rows []TDSRow
	err := s.scoped(ctx, retailerID, from, to).
		Select(`to_char(created_at, 'YYYY-MM') AS month,
		        COUNT(*) AS count,
		        COALESCE(SUM(commission), 0) AS commission,
		        COALESCE(SUM(tds), 0) AS tds`).
		Group("month").
		Order("month DESC").
		Scan(&rows).Error
	if err != nil {
		return nil, fmt.Errorf("report: tds rows: %w", err)
	}

	total := decimal.Zero
	for _, r := range rows {
		total = total.Add(r.TDS)
	}

	var retailer models.Retailer
	if err := s.db.WithContext(ctx).Select("pan").Where("id = ?", retailerID).First(&retailer).Error; err != nil {
		return nil, fmt.Errorf("report: load pan: %w", err)
	}

	return &TDSReport{
		From: from, To: to, Rows: rows, Total: total,
		PAN:           retailer.PAN,
		FinancialYear: financialYear(to),
	}, nil
}

// ServiceReportRow is one service's activity, including failures.
type ServiceReportRow struct {
	Service      string `json:"service"`
	Category     string `json:"category"`
	Total        int64  `json:"total"`
	SuccessCount int64  `json:"successCount"`
	FailedCount  int64  `json:"failedCount"`
	PendingCount int64  `json:"pendingCount"`
	Volume       Money  `json:"volume"`
	Commission   Money  `json:"commission"`
}

// ServiceReport summarises activity per service.
//
// Unlike the earnings reports this counts every status, because its purpose is to
// show operational health rather than income.
func (s *ReportService) ServiceReport(ctx context.Context, retailerID *uuid.UUID, from, to *time.Time) ([]ServiceReportRow, error) {
	q := s.db.WithContext(ctx).Model(&models.Transaction{})
	if retailerID != nil {
		q = q.Where("retailer_id = ?", *retailerID)
	}
	if from != nil {
		q = q.Where("created_at >= ?", *from)
	}
	if to != nil {
		q = q.Where("created_at <= ?", *to)
	}

	var rows []ServiceReportRow
	err := q.Select(`service,
	                 category,
	                 COUNT(*) AS total,
	                 COUNT(*) FILTER (WHERE status = 'success') AS success_count,
	                 COUNT(*) FILTER (WHERE status = 'failed') AS failed_count,
	                 COUNT(*) FILTER (WHERE status IN ('pending','processing')) AS pending_count,
	                 COALESCE(SUM(amount) FILTER (WHERE status = 'success'), 0) AS volume,
	                 COALESCE(SUM(commission) FILTER (WHERE status = 'success'), 0) AS commission`).
		Group("service, category").
		Order("total DESC").
		Scan(&rows).Error
	if err != nil {
		return nil, fmt.Errorf("report: service report: %w", err)
	}
	return rows, nil
}

// scoped builds the base query for earnings reports: successful transactions for
// one retailer within the window.
func (s *ReportService) scoped(ctx context.Context, retailerID uuid.UUID, from, to *time.Time) *gorm.DB {
	q := s.db.WithContext(ctx).Model(&models.Transaction{}).
		Where("retailer_id = ?", retailerID).
		Where("status = ?", models.TxStatusSuccess)

	if from != nil {
		q = q.Where("created_at >= ?", *from)
	}
	if to != nil {
		q = q.Where("created_at <= ?", *to)
	}
	return q
}

// financialYear returns the Indian financial year label for a date.
//
// The year runs April to March, so January to March belongs to the year that
// started the previous April.
func financialYear(at *time.Time) string {
	t := time.Now()
	if at != nil {
		t = *at
	}
	year := t.Year()
	if int(t.Month()) < 4 {
		year--
	}
	return fmt.Sprintf("%d-%02d", year, (year+1)%100)
}
