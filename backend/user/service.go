package ticket

import (
	"context"
	"errors"
	"fmt"
	"time"

	"go.mongodb.org/mongo-driver/bson"
)

// --- Sentinel errors ---
var (
	ErrTicketNotFound    = errors.New("ticket not found")
	ErrUnauthorized      = errors.New("unauthorized: admin only")
	ErrInvalidStatus     = errors.New("invalid status transition")
)

type Service interface {
	// User flow
	CreateTicket(ctx context.Context, req CreateTicketRequest) (*TicketResponse, error)
	AttachVoiceClip(ctx context.Context, ticketID string, voiceURL string) (*UploadVoiceResponse, error)
	GetTicketStatus(ctx context.Context, ticketID string) (*TicketResponse, error)

	// Admin flow
	ListTickets(ctx context.Context, statusFilter string) (*TicketListResponse, error)
	AcknowledgeTicket(ctx context.Context, ticketID string, adminNote string) (*TicketResponse, error)
	CloseTicket(ctx context.Context, ticketID string, adminNote string) (*TicketResponse, error)
	SetUrgentLevel(ctx context.Context, ticketID string, urgent UrgentLevel) (*TicketResponse, error)
}

type service struct {
	repo Repository
}

func NewService(repo Repository) Service {
	return &service{repo: repo}
}

// ─── User Flow ────────────────────────────────────────────────────────────────

// CreateTicket รับ GPS + ชื่อผู้ใช้ → สร้าง ticket ใหม่สถานะ Pending
func (s *service) CreateTicket(ctx context.Context, req CreateTicketRequest) (*TicketResponse, error) {
	ticketID := generateTicketID()

	t := &Ticket{
		TicketID:  ticketID,
		UserName:  req.UserName,
		UserID:    req.UserID,
		Location:  fmt.Sprintf("%.6f, %.6f", req.Latitude, req.Longitude),
		Latitude:  req.Latitude,
		Longitude: req.Longitude,
		VoiceClip: req.VoiceClip, // อาจว่างก่อน แล้ว attach ทีหลัง
		Status:    StatusPending,
		Urgent:    "",
	}

	created, err := s.repo.Create(ctx, t)
	if err != nil {
		return nil, fmt.Errorf("service.CreateTicket: %w", err)
	}
	return toResponse(created), nil
}

// AttachVoiceClip อัปเดต URL เสียงหลังจาก client upload ขึ้น object storage
func (s *service) AttachVoiceClip(ctx context.Context, ticketID string, voiceURL string) (*UploadVoiceResponse, error) {
	_, err := s.repo.UpdateVoiceClip(ctx, ticketID, voiceURL)
	if err != nil {
		return nil, fmt.Errorf("service.AttachVoiceClip: %w", err)
	}
	return &UploadVoiceResponse{
		TicketID:  ticketID,
		VoiceClip: voiceURL,
		Message:   "voice clip attached successfully",
	}, nil
}

// GetTicketStatus ให้ User ดึงสถานะล่าสุดของตัวเอง (polling fallback)
func (s *service) GetTicketStatus(ctx context.Context, ticketID string) (*TicketResponse, error) {
	t, err := s.repo.FindByTicketID(ctx, ticketID)
	if err != nil {
		return nil, err
	}
	return toResponse(t), nil
}

// ─── Admin Flow ───────────────────────────────────────────────────────────────

// ListTickets ดึงรายการ ticket ทั้งหมด (กรองด้วย status ได้)
func (s *service) ListTickets(ctx context.Context, statusFilter string) (*TicketListResponse, error) {
	filter := bson.M{}
	if statusFilter != "" {
		filter["status"] = statusFilter
	}

	tickets, total, err := s.repo.FindAll(ctx, filter)
	if err != nil {
		return nil, fmt.Errorf("service.ListTickets: %w", err)
	}

	resp := make([]TicketResponse, 0, len(tickets))
	for _, t := range tickets {
		resp = append(resp, *toResponse(t))
	}
	return &TicketListResponse{Total: total, Tickets: resp}, nil
}

// AcknowledgeTicket Admin กดรับเรื่อง → เปลี่ยนเป็น In Progress (User screen เปลี่ยนเป็นเขียว)
func (s *service) AcknowledgeTicket(ctx context.Context, ticketID string, adminNote string) (*TicketResponse, error) {
	t, err := s.repo.FindByTicketID(ctx, ticketID)
	if err != nil {
		return nil, err
	}
	if t.Status != StatusPending {
		return nil, fmt.Errorf("%w: can only acknowledge Pending tickets", ErrInvalidStatus)
	}

	updated, err := s.repo.UpdateStatus(ctx, ticketID, StatusInProgress, adminNote)
	if err != nil {
		return nil, fmt.Errorf("service.AcknowledgeTicket: %w", err)
	}
	return toResponse(updated), nil
}

// CloseTicket Admin ปิดเคสหลังให้ความช่วยเหลือเสร็จ
func (s *service) CloseTicket(ctx context.Context, ticketID string, adminNote string) (*TicketResponse, error) {
	t, err := s.repo.FindByTicketID(ctx, ticketID)
	if err != nil {
		return nil, err
	}
	if t.Status == StatusClosed {
		return nil, fmt.Errorf("%w: ticket is already closed", ErrInvalidStatus)
	}

	updated, err := s.repo.UpdateStatus(ctx, ticketID, StatusClosed, adminNote)
	if err != nil {
		return nil, fmt.Errorf("service.CloseTicket: %w", err)
	}
	return toResponse(updated), nil
}

// SetUrgentLevel Admin กำหนดระดับความเร่งด่วน (Admin-only field)
func (s *service) SetUrgentLevel(ctx context.Context, ticketID string, urgent UrgentLevel) (*TicketResponse, error) {
	updated, err := s.repo.UpdateUrgent(ctx, ticketID, urgent)
	if err != nil {
		return nil, fmt.Errorf("service.SetUrgentLevel: %w", err)
	}
	return toResponse(updated), nil
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

func generateTicketID() string {
	return fmt.Sprintf("SOS-%d", time.Now().UnixNano()%100000)
}

func toResponse(t *Ticket) *TicketResponse {
	closedFmt := ""
	if t.ClosedAt != nil {
		closedFmt = t.ClosedAt.Format("2006-01-02 15:04:05")
	}
	_ = closedFmt

	return &TicketResponse{
		TicketID:  t.TicketID,
		UserName:  t.UserName,
		UserID:    t.UserID,
		Status:    t.Status,
		Urgent:    t.Urgent,
		Location:  t.Location,
		Latitude:  t.Latitude,
		Longitude: t.Longitude,
		VoiceClip: t.VoiceClip,
		Timestamp: t.Timestamp.Format("2006-01-02 15:04:05"),
		UpdatedAt: t.UpdatedAt.Format("2006-01-02 15:04:05"),
		AdminNote: t.AdminNote,
	}
}