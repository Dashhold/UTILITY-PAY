package service

import (
	"context"
	"fmt"
	"time"

	"gorm.io/gorm"

	"github.com/utilipay/backend/internal/models"
)

// ContentService serves master data and announcements.
type ContentService struct {
	db *gorm.DB
}

// NewContentService builds a ContentService.
func NewContentService(db *gorm.DB) *ContentService {
	return &ContentService{db: db}
}

// Announcements returns published, unexpired announcements for a role.
//
// Expiry is filtered in SQL rather than in Go so an expired notice can never
// reach the client, even if a caller forgets to check.
func (s *ContentService) Announcements(ctx context.Context, role models.Role) ([]models.Announcement, error) {
	audiences := []models.AnnouncementAudience{models.AudienceAll}
	switch role {
	case models.RoleAdmin:
		audiences = append(audiences, models.AudienceAdmin)
	case models.RoleRetailer:
		audiences = append(audiences, models.AudienceRetailer)
	}

	var out []models.Announcement
	err := s.db.WithContext(ctx).
		Where("status = ?", models.AnnouncementPublished).
		Where("audience IN ?", audiences).
		Where("expiry_date IS NULL OR expiry_date > ?", time.Now().UTC()).
		Order("published_date DESC NULLS LAST").
		Limit(50).
		Find(&out).Error
	if err != nil {
		return nil, fmt.Errorf("content: announcements: %w", err)
	}
	return out, nil
}

// CompanyBanks returns active company accounts for retailer deposits.
//
// The default account is ordered first so the UI can present it without extra
// logic.
func (s *ContentService) CompanyBanks(ctx context.Context) ([]models.CompanyBank, error) {
	var out []models.CompanyBank
	err := s.db.WithContext(ctx).
		Where("status = ?", models.StatusActive).
		Order("is_default DESC, bank_name ASC").
		Find(&out).Error
	if err != nil {
		return nil, fmt.Errorf("content: company banks: %w", err)
	}
	return out, nil
}

// ServiceCategories returns enabled service categories.
func (s *ContentService) ServiceCategories(ctx context.Context) ([]models.ServiceCategory, error) {
	var out []models.ServiceCategory
	err := s.db.WithContext(ctx).
		Where("status = ?", models.StatusEnabled).
		Order("sort_order ASC, name ASC").
		Find(&out).Error
	if err != nil {
		return nil, fmt.Errorf("content: service categories: %w", err)
	}
	return out, nil
}

// Services returns active services, optionally filtered by category.
func (s *ContentService) Services(ctx context.Context, category string) ([]models.Service, error) {
	q := s.db.WithContext(ctx).Where("status = ?", models.StatusActive)
	if category != "" && category != "all" {
		q = q.Where("category = ?", category)
	}

	var out []models.Service
	if err := q.Order("category ASC, name ASC").Find(&out).Error; err != nil {
		return nil, fmt.Errorf("content: services: %w", err)
	}
	return out, nil
}

// Cities returns active serviceable cities.
func (s *ContentService) Cities(ctx context.Context) ([]models.City, error) {
	var out []models.City
	err := s.db.WithContext(ctx).
		Where("status = ?", models.StatusActive).
		Order("state ASC, name ASC").
		Find(&out).Error
	if err != nil {
		return nil, fmt.Errorf("content: cities: %w", err)
	}
	return out, nil
}

// UserTypes returns active retailer tiers.
func (s *ContentService) UserTypes(ctx context.Context) ([]models.UserType, error) {
	var out []models.UserType
	err := s.db.WithContext(ctx).
		Where("status = ?", models.StatusActive).
		Order("name ASC").
		Find(&out).Error
	if err != nil {
		return nil, fmt.Errorf("content: user types: %w", err)
	}
	return out, nil
}

// TicketDepartments returns active support departments.
func (s *ContentService) TicketDepartments(ctx context.Context) ([]models.TicketDepartment, error) {
	var out []models.TicketDepartment
	err := s.db.WithContext(ctx).
		Where("status = ?", models.StatusActive).
		Order("name ASC").
		Find(&out).Error
	if err != nil {
		return nil, fmt.Errorf("content: ticket departments: %w", err)
	}
	return out, nil
}
