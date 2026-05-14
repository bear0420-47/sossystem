package user

import (
	"bufio"
	"context"
	"encoding/json"
	"fmt"
	"log"
	"time"

	"github.com/gofiber/fiber/v2"
)

type Handler struct {
	svc Service
}

func NewHandler(svc Service) *Handler {
	return &Handler{svc: svc}
}

// RegisterRoutes mounts all SOS endpoints
//
// User routes:
//   POST /api/v1/sos/tickets           → กด SOS สร้าง ticket
//   GET  /api/v1/sos/tickets/:id        → ดูสถานะ ticket (fallback poll)
//   GET  /api/v1/sos/tickets/:id/stream → SSE stream รับ status update แบบ real-time
//
// Admin routes:
//   GET   /api/v1/sos/admin/tickets                    → dashboard ดู ticket ทั้งหมด
//   GET   /api/v1/sos/admin/stream                     → SSE stream รับ ticket ใหม่แบบ real-time
//   PATCH /api/v1/sos/admin/tickets/:id/acknowledge    → Pending → In Progress
//   PATCH /api/v1/sos/admin/tickets/:id/close          → → Closed
//   PATCH /api/v1/sos/admin/tickets/:id/urgent         → ตั้งระดับความเร่งด่วน
func (h *Handler) RegisterRoutes(router fiber.Router) {
	sos := router.Group("/sos")

	// User
	sos.Post("/tickets", h.CreateTicket)
	sos.Get("/tickets/:id", h.GetTicket)
	sos.Get("/tickets/:id/stream", h.StreamTicketStatus) // ← SSE สำหรับ User

	// Admin
	admin := sos.Group("/admin")
	admin.Get("/tickets", h.GetAllTickets)
	admin.Get("/stream", h.StreamAllTickets)             // ← SSE สำหรับ Admin dashboard
	admin.Patch("/tickets/:id/acknowledge", h.AcknowledgeTicket)
	admin.Patch("/tickets/:id/close", h.CloseTicket)
	admin.Patch("/tickets/:id/urgent", h.SetUrgent)
}

// ── User Handlers ─────────────────────────────────────────────────────────────

// CreateTicket handles POST /sos/tickets
// User กดปุ่ม SOS → ระบบสร้าง Ticket ใหม่ด้วยสถานะ Pending
func (h *Handler) CreateTicket(c *fiber.Ctx) error {
	var req CreateTicketRequest
	if err := c.BodyParser(&req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"error": "Invalid request body",
		})
	}

	if  req.Location == "" || req.VoiceClip == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"error": "location, and voice_clip are required",
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
// Fallback สำหรับ poll สถานะถ้า SSE ถูกตัดการเชื่อมต่อ
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

// StreamTicketStatus handles GET /sos/tickets/:id/stream
//
// SSE endpoint สำหรับ User — เปิด connection ค้างไว้
// Server จะ push event มาทุกครั้งที่ status ของ ticket นั้นเปลี่ยน
//
// SSE Event format:
//
//	data: {"operation":"update","ticket":{...}}\n\n
//
// States ที่ User จะได้รับ:
//
//	Pending    → หน้าจอสีเหลืองกะพริบ (กำลังส่งข้อมูล)
//	In Progress → หน้าจอสีเขียว "กำลังมาช่วย"
//	Closed     → ปิดหน้า SOS
func (h *Handler) StreamTicketStatus(c *fiber.Ctx) error {
	ticketID := c.Params("id")

	// ตรวจสอบว่า ticket มีอยู่จริงก่อนเปิด stream
	ticket, err := h.svc.GetTicket(c.Context(), ticketID)
	if err != nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{
			"error": "ticket not found",
		})
	}

	// ตั้งค่า SSE headers
	c.Set("Content-Type", "text/event-stream")
	c.Set("Cache-Control", "no-cache")
	c.Set("Connection", "keep-alive")
	c.Set("X-Accel-Buffering", "no") // ปิด Nginx buffering (สำคัญมาก)

	log.Printf("[SSE] User connected to stream for ticket: %s", ticketID)

	// ลงทะเบียน SSE client ใน Hub
	client := &sseClient{
		ticketID: ticketID,
		send:     make(chan []byte, 16),
	}
	hub := h.svc.GetHub()
	hub.Register(client)
	defer hub.Unregister(client)

	// ใช้ context ของ request เพื่อตรวจจับ client disconnect
	reqCtx := c.Context()

	c.Context().SetBodyStreamWriter(func(w *bufio.Writer) {
		// ส่งสถานะปัจจุบันทันทีที่ connect (ไม่ต้องรอ event)
		initialData, _ := json.Marshal(fiber.Map{
			"operation": "connected",
			"ticket":    ticket,
		})
		fmt.Fprintf(w, "data: %s\n\n", initialData)
		w.Flush()

		// Heartbeat ทุก 30 วินาที เพื่อไม่ให้ connection หลุด
		ticker := time.NewTicker(30 * time.Second)
		defer ticker.Stop()

		for {
			select {
			case msg, ok := <-client.send:
				if !ok {
					// Hub ปิด channel → หยุด
					return
				}
				// ส่ง SSE event ไปยัง client
				fmt.Fprintf(w, "data: %s\n\n", msg)
				if err := w.Flush(); err != nil {
					log.Printf("[SSE] Flush error for ticket %s: %v", ticketID, err)
					return
				}

			case <-ticker.C:
				// Heartbeat comment — client ไม่แสดงผล แต่ป้องกัน timeout
				fmt.Fprintf(w, ": heartbeat\n\n")
				if err := w.Flush(); err != nil {
					return
				}

			case <-reqCtx.Done():
				log.Printf("[SSE] User disconnected from ticket: %s", ticketID)
				return

			case <-context.Background().Done():
				return
			}
		}
	})

	return nil
}

// ── Admin Handlers ────────────────────────────────────────────────────────────

// GetAllTickets handles GET /sos/admin/tickets
// Admin dashboard โหลด tickets ทั้งหมดครั้งแรก (sorted newest first)
func (h *Handler) GetAllTickets(c *fiber.Ctx) error {
	tickets, err := h.svc.GetAllTickets(c.Context())
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"error": err.Error(),
		})
	}
	return c.JSON(tickets)
}

// StreamAllTickets handles GET /sos/admin/stream
//
// SSE endpoint สำหรับ Admin Dashboard — รับ event ทุกประเภท
// ทั้ง insert (ticket ใหม่) และ update (status เปลี่ยน) ของทุก ticket
//
// SSE Event format:
//
//	data: {"operation":"insert","ticket":{...}}\n\n   ← ticket ใหม่เข้ามา
//	data: {"operation":"update","ticket":{...}}\n\n   ← status เปลี่ยน
func (h *Handler) StreamAllTickets(c *fiber.Ctx) error {
	c.Set("Content-Type", "text/event-stream")
	c.Set("Cache-Control", "no-cache")
	c.Set("Connection", "keep-alive")
	c.Set("X-Accel-Buffering", "no")

	log.Println("[SSE] Admin connected to dashboard stream")

	// Admin ใช้ ticketID = "*" เพื่อรับทุก event (BroadcastAll จะส่งมาให้)
	client := &sseClient{
		ticketID: "*",
		send:     make(chan []byte, 64),
	}
	hub := h.svc.GetHub()
	hub.Register(client)
	defer hub.Unregister(client)

	reqCtx := c.Context()

	c.Context().SetBodyStreamWriter(func(w *bufio.Writer) {
		// ยืนยันการเชื่อมต่อ
		fmt.Fprintf(w, "data: {\"operation\":\"connected\"}\n\n")
		w.Flush()

		ticker := time.NewTicker(30 * time.Second)
		defer ticker.Stop()

		for {
			select {
			case msg, ok := <-client.send:
				if !ok {
					return
				}
				fmt.Fprintf(w, "data: %s\n\n", msg)
				if err := w.Flush(); err != nil {
					log.Printf("[SSE] Admin flush error: %v", err)
					return
				}

			case <-ticker.C:
				fmt.Fprintf(w, ": heartbeat\n\n")
				if err := w.Flush(); err != nil {
					return
				}

			case <-reqCtx.Done():
				log.Println("[SSE] Admin disconnected from dashboard stream")
				return
			}
		}
	})

	return nil
}

// AcknowledgeTicket handles PATCH /sos/admin/tickets/:id/acknowledge
// Pending → In Progress → Change Stream จะ push ไปยัง User ทันที
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
// ปิดงาน — ข้อมูลยังเก็บใน MongoDB สำหรับ log ย้อนหลัง
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
// Admin ตั้งระดับความเร่งด่วน: Low / Medium / High / Critical
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