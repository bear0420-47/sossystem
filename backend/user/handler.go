package user

import (
	"encoding/json"
	"log"

	"github.com/gofiber/fiber/v2"
	"github.com/gofiber/websocket/v2"
)

type Handler struct {
	svc Service
}

func NewHandler(svc Service) *Handler {
	return &Handler{svc: svc}
}

// RegisterRoutes mounts all SOS API endpoints on the given fiber.Router
// Routes are grouped under /api/v1/sos
func (h *Handler) RegisterRoutes(router fiber.Router) {
	sos := router.Group("/sos")

	// ── User (Victim) routes ──────────────────────────────────────────────
	// POST /api/v1/sos/tickets           → create new SOS ticket
	// GET  /api/v1/sos/tickets/:id       → poll ticket status (user screen)
	// GET  /api/v1/sos/ws                → WebSocket: real-time status push to user
	sos.Post("/tickets", h.CreateTicket)
	sos.Get("/tickets/:id", h.GetTicket)

	// ── Admin (Responder) routes ──────────────────────────────────────────
	// GET   /api/v1/sos/admin/tickets              → dashboard: all tickets
	// PATCH /api/v1/sos/admin/tickets/:id/acknowledge → Pending → In Progress
	// PATCH /api/v1/sos/admin/tickets/:id/close       → → Closed
	// PATCH /api/v1/sos/admin/tickets/:id/urgent      → set urgency level
	admin := sos.Group("/admin")
	admin.Get("/tickets", h.GetAllTickets)
	admin.Patch("/tickets/:id/acknowledge", h.AcknowledgeTicket)
	admin.Patch("/tickets/:id/close", h.CloseTicket)
	admin.Patch("/tickets/:id/urgent", h.SetUrgent)

	// ── WebSocket upgrade ─────────────────────────────────────────────────
	// GET /api/v1/sos/ws  → upgrade to WebSocket for real-time updates
	sos.Get("/ws", websocket.New(h.WebSocketHandler))
}

// CreateTicket handles POST /sos/tickets
// Triggered when user presses the SOS button; auto-sets Status = Pending
func (h *Handler) CreateTicket(c *fiber.Ctx) error {
	var req CreateTicketRequest
	if err := c.BodyParser(&req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"error": "Invalid request body",
		})
	}

	if req.UserName == "" || req.Location == "" || req.VoiceClip == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"error": "user_name, location, and voice_clip are required",
		})
	}

	ticket, err := h.svc.CreateTicket(c.Context(), req)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"error": err.Error(),
		})
	}

	return c.Status(fiber.StatusCreated).JSON(ticket)
}

// GetTicket handles GET /sos/tickets/:id
// Used by the User's app to poll/verify their current ticket status
func (h *Handler) GetTicket(c *fiber.Ctx) error {
	ticketID := c.Params("id")
	ticket, err := h.svc.GetTicket(c.Context(), ticketID)
	if err != nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{
			"error": err.Error(),
		})
	}
	return c.JSON(ticket)
}

// GetAllTickets handles GET /sos/admin/tickets
// Admin dashboard: returns all tickets sorted newest first
func (h *Handler) GetAllTickets(c *fiber.Ctx) error {
	tickets, err := h.svc.GetAllTickets(c.Context())
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"error": err.Error(),
		})
	}
	return c.JSON(tickets)
}

// AcknowledgeTicket handles PATCH /sos/admin/tickets/:id/acknowledge
// Changes status from Pending → In Progress; triggers User screen to turn green
func (h *Handler) AcknowledgeTicket(c *fiber.Ctx) error {
	ticketID := c.Params("id")
	ticket, err := h.svc.AcknowledgeTicket(c.Context(), ticketID)
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"error": err.Error(),
		})
	}
	return c.JSON(ticket)
}

// CloseTicket handles PATCH /sos/admin/tickets/:id/close
// Marks case as resolved; history is preserved in MongoDB for audit trail
func (h *Handler) CloseTicket(c *fiber.Ctx) error {
	ticketID := c.Params("id")
	ticket, err := h.svc.CloseTicket(c.Context(), ticketID)
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"error": err.Error(),
		})
	}
	return c.JSON(ticket)
}

// SetUrgent handles PATCH /sos/admin/tickets/:id/urgent
// Admin-only: sets urgency level (Low / Medium / High / Critical)
func (h *Handler) SetUrgent(c *fiber.Ctx) error {
	ticketID := c.Params("id")

	var req UpdateUrgentRequest
	if err := c.BodyParser(&req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"error": "Invalid request body",
		})
	}

	ticket, err := h.svc.SetUrgent(c.Context(), ticketID, req.Urgent)
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"error": err.Error(),
		})
	}
	return c.JSON(ticket)
}

// WebSocketHandler manages a single WebSocket connection lifecycle
// Clients connect here to receive real-time ticket events pushed by Change Stream
func (h *Handler) WebSocketHandler(c *websocket.Conn) {
	client := &wsClient{send: make(chan []byte, 64)}
	hub := h.svc.GetHub()
	hub.Register(client)

	log.Printf("[WS] Client connected: %s", c.RemoteAddr())

	// Goroutine: write outgoing messages to the WebSocket
	done := make(chan struct{})
	go func() {
		defer close(done)
		for msg := range client.send {
			if err := c.WriteMessage(websocket.TextMessage, msg); err != nil {
				log.Printf("[WS] Write error: %v", err)
				return
			}
		}
	}()

	// Block here reading incoming messages (ping/pong or client close)
	for {
		_, msg, err := c.ReadMessage()
		if err != nil {
			log.Printf("[WS] Client disconnected: %s", c.RemoteAddr())
			break
		}
		// Echo back any message as JSON acknowledgement (optional ping support)
		_ = msg
	}

	hub.Unregister(client)
	<-done

	// Send final close event to the WebSocket client payload
	closePayload, _ := json.Marshal(fiber.Map{"operation": "disconnect"})
	_ = c.WriteMessage(websocket.TextMessage, closePayload)
}