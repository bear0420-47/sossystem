package user

import (
	"context"
	"errors"
	"log"
	"sync"
	"time"

	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/mongo"
)

// wsClient represents a connected WebSocket client
type wsClient struct {
	send chan []byte
}

// Hub manages all active WebSocket connections for real-time broadcast
type Hub struct {
	mu      sync.RWMutex
	clients map[*wsClient]bool
}

var globalHub = &Hub{
	clients: make(map[*wsClient]bool),
}

func (h *Hub) Register(c *wsClient) {
	h.mu.Lock()
	defer h.mu.Unlock()
	h.clients[c] = true
}

func (h *Hub) Unregister(c *wsClient) {
	h.mu.Lock()
	defer h.mu.Unlock()
	delete(h.clients, c)
	close(c.send)
}

func (h *Hub) Broadcast(msg []byte) {
	h.mu.RLock()
	defer h.mu.RUnlock()
	for c := range h.clients {
		select {
		case c.send <- msg:
		default:
			// Client too slow — skip this cycle
		}
	}
}

// Service defines all business logic for the SOS system
type Service interface {
	CreateTicket(ctx context.Context, req CreateTicketRequest) (*TicketResponse, error)
	GetAllTickets(ctx context.Context) ([]TicketResponse, error)
	GetTicket(ctx context.Context, ticketID string) (*TicketResponse, error)
	AcknowledgeTicket(ctx context.Context, ticketID string) (*TicketResponse, error) // Pending → In Progress
	CloseTicket(ctx context.Context, ticketID string) (*TicketResponse, error)       // In Progress → Closed
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

// CreateTicket — called when user presses SOS button
// Automatically sets Status = Pending and records current timestamp
func (s *service) CreateTicket(ctx context.Context, req CreateTicketRequest) (*TicketResponse, error) {
	ticketID, err := s.repo.GenerateTicketID(ctx)
	if err != nil {
		return nil, err
	}

	ticket := &Ticket{
		TicketID:  ticketID,
		UserName:  req.UserName,
		Status:    StatusPending, // always starts as Pending
		Urgent:    UrgentNone,   // admin sets this later
		Location:  req.Location,
		VoiceClip: req.VoiceClip,
		Timestamp: time.Now(),
	}

	if err := s.repo.Create(ctx, ticket); err != nil {
		return nil, err
	}

	resp := toResponse(*ticket)
	log.Printf("[SOS] New ticket created: %s by %s", ticket.TicketID, ticket.UserName)
	return &resp, nil
}

// GetAllTickets — admin dashboard view, sorted newest first
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

// GetTicket — get single ticket for user status polling
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

// AcknowledgeTicket — admin accepts the case: Pending → In Progress
// This triggers real-time update to the User's screen (turns green)
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
	log.Printf("[SOS] Ticket %s acknowledged → In Progress", ticketID)
	return &resp, nil
}

// CloseTicket — admin marks the case as resolved
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
	log.Printf("[SOS] Ticket %s closed", ticketID)
	return &resp, nil
}

// SetUrgent — admin-only: classify urgency level of the case
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
	log.Printf("[SOS] Ticket %s urgency set to: %s", ticketID, urgent)
	return &resp, nil
}

// StartChangeStream listens to MongoDB Change Stream and broadcasts updates
// to all connected WebSocket clients in real time
func (s *service) StartChangeStream(ctx context.Context) {
	go func() {
		log.Println("[ChangeStream] Starting MongoDB Change Stream watcher...")
		for {
			select {
			case <-ctx.Done():
				log.Println("[ChangeStream] Context cancelled, stopping.")
				return
			default:
			}

			stream, err := s.repo.WatchChanges(ctx)
			if err != nil {
				log.Printf("[ChangeStream] Watch error: %v — retrying in 3s", err)
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

				// Broadcast operation type + full ticket to all WebSocket clients
				resp := toResponse(*event.FullDocument)
				payload, _ := bson.MarshalExtJSON(bson.M{
					"operation": event.OperationType,
					"ticket":    resp,
				}, false, false)

				s.hub.Broadcast(payload)
				log.Printf("[ChangeStream] Broadcast %s for ticket %s", event.OperationType, event.FullDocument.TicketID)
			}

			if err := stream.Err(); err != nil && ctx.Err() == nil {
				log.Printf("[ChangeStream] Stream error: %v — restarting in 3s", err)
				time.Sleep(3 * time.Second)
			}
		}
	}()
}