package user

import (
	"context"
	"encoding/json"
	"errors"
	"log"
	"strings"
	"sync"
	"time"

	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/mongo"
)

// ── SSE Hub ───────────────────────────────────────────────────────────────────
// sseClient คือ connection ของ User 1 คนที่เปิด SSE ค้างไว้
// แต่ละ client subscribe เฉพาะ ticketID ของตัวเองเท่านั้น
type sseClient struct {
	ticketID string      // กรองเฉพาะ ticket ที่ตัวเองสนใจ
	send     chan []byte // channel สำหรับส่ง event ไปยัง client
}

// Hub เก็บ SSE clients ทั้งหมดที่กำลัง connect อยู่
type Hub struct {
	mu      sync.RWMutex
	clients map[*sseClient]bool
}

var globalHub = &Hub{
	clients: make(map[*sseClient]bool),
}

func (h *Hub) Register(c *sseClient) {
	h.mu.Lock()
	defer h.mu.Unlock()
	h.clients[c] = true
	log.Printf("[SSE Hub] Client registered for ticket: %s (total: %d)", c.ticketID, len(h.clients))
}

func (h *Hub) Unregister(c *sseClient) {
	h.mu.Lock()
	defer h.mu.Unlock()
	if _, ok := h.clients[c]; ok {
		delete(h.clients, c)
		close(c.send)
		log.Printf("[SSE Hub] Client unregistered for ticket: %s (total: %d)", c.ticketID, len(h.clients))
	}
}

// BroadcastToTicket ส่ง event ไปยัง:
//   - User ที่ subscribe ticketID นั้น (เจ้าของ ticket)
//   - Admin dashboard ที่ใช้ wildcard ticketID = "*"
func (h *Hub) BroadcastToTicket(ticketID string, msg []byte) {
	h.mu.RLock()
	defer h.mu.RUnlock()
	for c := range h.clients {
		if c.ticketID == ticketID || c.ticketID == "*" {
			select {
			case c.send <- msg:
			default:
				// client channel เต็ม — ข้าม
			}
		}
	}
}

// BroadcastAll ส่งไปยัง admin dashboard (ticketID = "*") เท่านั้น
// ใช้เมื่อมี ticket ใหม่เข้ามา → admin เห็นทันที
func (h *Hub) BroadcastAll(msg []byte) {
	h.mu.RLock()
	defer h.mu.RUnlock()
	for c := range h.clients {
		if c.ticketID == "*" {
			select {
			case c.send <- msg:
			default:
			}
		}
	}
}

// ── Service ───────────────────────────────────────────────────────────────────
type Service interface {
	CreateTicket(ctx context.Context, req CreateTicketRequest) (*TicketResponse, error)
	GetAllTickets(ctx context.Context) ([]TicketResponse, error)
	GetTicket(ctx context.Context, ticketID string) (*TicketResponse, error)
	AcknowledgeTicket(ctx context.Context, ticketID string) (*TicketResponse, error)
	CloseTicket(ctx context.Context, ticketID string) (*TicketResponse, error)
	SetUrgent(ctx context.Context, ticketID string, urgent UrgentLevel) (*TicketResponse, error)
	StartChangeStream(ctx context.Context)
	GetHub() *Hub
}

type service struct {
	repo Repository
	hub  *Hub
}

func NewService(repo Repository) Service {
	return &service{repo: repo, hub: globalHub}
}

func (s *service) GetHub() *Hub {
	return s.hub
}

// CreateTicket — User กดปุ่ม SOS
// ตั้งค่า Status = Pending และ Urgent = "" อัตโนมัติ
func (s *service) CreateTicket(ctx context.Context, req CreateTicketRequest) (*TicketResponse, error) {
	ticketID, err := s.repo.GenerateTicketID(ctx)
	if err != nil {
		return nil, err
	}

	ticket := &Ticket{
		TicketID: ticketID,
		// ลบบรรทัดนี้ออก:
		// UserName:  req.UserName,
		Status:    StatusPending,
		Urgent:    UrgentNone,
		Location:  req.Location,
		VoiceClip: req.VoiceClip,
		Timestamp: time.Now(),
	}

	if err := s.repo.Create(ctx, ticket); err != nil {
		return nil, err
	}

	resp := toResponse(*ticket)
	log.Printf("[SOS] New ticket created: %s", ticket.TicketID)
	return &resp, nil
}

func (s *service) GetAllTickets(ctx context.Context) ([]TicketResponse, error) {
	tickets, err := s.repo.FindAll(ctx)
	if err != nil {
		return nil, err
	}
	responses := make([]TicketResponse, len(tickets))
	for i, t := range tickets {
		responses[i] = toResponse(t)
	}
	return responses, nil
}

func (s *service) GetTicket(ctx context.Context, ticketID string) (*TicketResponse, error) {
	ticket, err := s.repo.FindByTicketID(ctx, ticketID)
	if err != nil {
		if errors.Is(err, mongo.ErrNoDocuments) {
			return nil, errors.New("ticket not found")
		}
		return nil, err
	}
	resp := toResponse(*ticket)
	return &resp, nil
}

// AcknowledgeTicket — Admin กดรับเรื่อง: Pending → In Progress
// Change Stream จะ broadcast ไปยัง User เจ้าของ ticket ทันที
func (s *service) AcknowledgeTicket(ctx context.Context, ticketID string) (*TicketResponse, error) {
	ticket, err := s.repo.FindByTicketID(ctx, ticketID)
	if err != nil {
		return nil, errors.New("ticket not found")
	}
	if ticket.Status != StatusPending {
		return nil, errors.New("only Pending tickets can be acknowledged")
	}

	if err := s.repo.UpdateStatus(ctx, ticketID, StatusInProgress); err != nil {
		return nil, err
	}

	ticket.Status = StatusInProgress
	resp := toResponse(*ticket)
	log.Printf("[SOS] Ticket %s → In Progress", ticketID)
	return &resp, nil
}

// CloseTicket — Admin ปิดงาน → ข้อมูลยังอยู่ใน MongoDB เป็น log ย้อนหลัง
func (s *service) CloseTicket(ctx context.Context, ticketID string) (*TicketResponse, error) {
	ticket, err := s.repo.FindByTicketID(ctx, ticketID)
	if err != nil {
		return nil, errors.New("ticket not found")
	}
	if ticket.Status == StatusClosed {
		return nil, errors.New("ticket is already closed")
	}

	if err := s.repo.UpdateStatus(ctx, ticketID, StatusClosed); err != nil {
		return nil, err
	}

	ticket.Status = StatusClosed
	resp := toResponse(*ticket)
	log.Printf("[SOS] Ticket %s → Closed", ticketID)
	return &resp, nil
}

// SetUrgent — Admin จัดลำดับความเร่งด่วน (admin-only field)
func (s *service) SetUrgent(ctx context.Context, ticketID string, urgent UrgentLevel) (*TicketResponse, error) {
	ticket, err := s.repo.FindByTicketID(ctx, ticketID)
	if err != nil {
		return nil, errors.New("ticket not found")
	}
	if ticket.Status == StatusClosed {
		return nil, errors.New("cannot change urgency of a closed ticket")
	}

	if err := s.repo.UpdateUrgent(ctx, ticketID, urgent); err != nil {
		return nil, err
	}

	ticket.Urgent = urgent
	resp := toResponse(*ticket)
	log.Printf("[SOS] Ticket %s urgency → %s", ticketID, urgent)
	return &resp, nil
}

// StartChangeStream — ฟัง MongoDB Change Stream แล้ว broadcast ผ่าน SSE Hub
//
// Flow:
//
//	insert  → BroadcastAll    (admin dashboard เห็น ticket ใหม่ทันที)
//	update  → BroadcastToTicket (User เจ้าของ ticket เห็นสถานะเปลี่ยนทันที)
func (s *service) StartChangeStream(ctx context.Context) {
	go func() {
		log.Println("[ChangeStream] Starting...")
		for {
			select {
			case <-ctx.Done():
				log.Println("[ChangeStream] Stopped.")
				return
			default:
			}

			stream, err := s.repo.WatchChanges(ctx)
			if err != nil {
				if isReplicaSetError(err) {
					log.Println("[ChangeStream] Replica set not available — switching to polling mode (2s interval)")
					s.startPollingFallback(ctx)
					return
				}
				log.Printf("[ChangeStream] Watch error: %v — retry in 3s", err)
				time.Sleep(3 * time.Second)
				continue
			}

			log.Println("[ChangeStream] Watching for ticket changes...")

			for stream.Next(ctx) {
				var event struct {
					OperationType string  `bson:"operationType"`
					FullDocument  *Ticket `bson:"fullDocument"`
				}

				if err := stream.Decode(&event); err != nil {
					log.Printf("[ChangeStream] Decode error: %v", err)
					continue
				}

				if event.FullDocument == nil {
					continue
				}

				resp := toResponse(*event.FullDocument)

				// สร้าง SSE payload: "data: {...}\n\n"
				payload, _ := bson.MarshalExtJSON(bson.M{
					"operation": event.OperationType,
					"ticket":    resp,
				}, false, false)

				switch event.OperationType {
				case "insert":
					// Ticket ใหม่ → แจ้ง admin dashboard ทุก client
					s.hub.BroadcastAll(payload)
					log.Printf("[ChangeStream] insert → BroadcastAll ticket %s", event.FullDocument.TicketID)

				case "update", "replace":
					// Status/Urgent เปลี่ยน → แจ้งเฉพาะ User เจ้าของ ticket
					s.hub.BroadcastToTicket(event.FullDocument.TicketID, payload)
					log.Printf("[ChangeStream] update → BroadcastToTicket %s (status: %s)",
						event.FullDocument.TicketID, event.FullDocument.Status)
				}
			}

			if err := stream.Err(); err != nil && ctx.Err() == nil {
				log.Printf("[ChangeStream] Stream error: %v — restart in 3s", err)
				time.Sleep(3 * time.Second)
			}
		}
	}()
}

// isReplicaSetError ตรวจว่า error มาจากการที่ MongoDB ไม่ใช่ Replica Set
func isReplicaSetError(err error) bool {
	return strings.Contains(err.Error(), "only supported on replica sets") ||
		strings.Contains(err.Error(), "Location40573")
}

// startPollingFallback ใช้แทน Change Stream ตอน dev (MongoDB standalone)
// Poll ทุก 2 วินาที เปรียบเทียบ snapshot ก่อนหน้า → broadcast เฉพาะที่เปลี่ยน
func (s *service) startPollingFallback(ctx context.Context) {
	go func() {
		log.Println("[Polling] Fallback mode active — polling every 2s")

		// snapshot เก็บ status+urgent ล่าสุดของแต่ละ ticket
		type snapshot struct {
			status TicketStatus
			urgent UrgentLevel
		}
		prev := make(map[string]snapshot)
		prevCount := 0

		ticker := time.NewTicker(2 * time.Second)
		defer ticker.Stop()

		for {
			select {
			case <-ctx.Done():
				log.Println("[Polling] Stopped.")
				return
			case <-ticker.C:
			}

			tickets, err := s.repo.FindAll(ctx)
			if err != nil {
				log.Printf("[Polling] FindAll error: %v", err)
				continue
			}

			// ตรวจ ticket ใหม่
			if len(tickets) > prevCount {
				for i := prevCount; i < len(tickets); i++ {
					t := tickets[i]
					resp := toResponse(t)
					payload, _ := json.Marshal(map[string]any{
						"operation": "insert",
						"ticket":    resp,
					})
					s.hub.BroadcastAll(payload)
					log.Printf("[Polling] insert → BroadcastAll ticket %s", t.TicketID)
				}
				prevCount = len(tickets)
			}

			// ตรวจ status / urgent ที่เปลี่ยนแปลง
			for _, t := range tickets {
				snap, exists := prev[t.TicketID]
				if !exists {
					prev[t.TicketID] = snapshot{status: t.Status, urgent: t.Urgent}
					continue
				}

				if snap.status != t.Status || snap.urgent != t.Urgent {
					resp := toResponse(t)
					payload, _ := json.Marshal(map[string]any{
						"operation": "update",
						"ticket":    resp,
					})
					s.hub.BroadcastToTicket(t.TicketID, payload)
					log.Printf("[Polling] update → BroadcastToTicket %s (status: %s)", t.TicketID, t.Status)
					prev[t.TicketID] = snapshot{status: t.Status, urgent: t.Urgent}
				}
			}
		}
	}()
}
