package ticket

// CreateTicketRequest — ส่งมาจาก User เมื่อกด SOS
type CreateTicketRequest struct {
	UserName  string  `json:"user_name"  validate:"required"`
	UserID    string  `json:"user_id"    validate:"required"`
	Latitude  float64 `json:"latitude"   validate:"required"`
	Longitude float64 `json:"longitude"  validate:"required"`
	// VoiceClip URL จะถูก set หลังจาก upload ไฟล์เสียงแล้ว
	VoiceClip string `json:"voice_clip"`
}

// UpdateStatusRequest — ส่งมาจาก Admin เพื่อเปลี่ยนสถานะ
type UpdateStatusRequest struct {
	Status    TicketStatus `json:"status"     validate:"required,oneof=Pending 'In Progress' Closed"`
	AdminNote string       `json:"admin_note"`
}

// UpdateUrgentRequest — ส่งมาจาก Admin เพื่อกำหนดระดับความเร่งด่วน (Admin เท่านั้น)
type UpdateUrgentRequest struct {
	Urgent UrgentLevel `json:"urgent" validate:"required,oneof=Low Medium High Critical"`
}

// TicketResponse — ส่งกลับไปให้ client
type TicketResponse struct {
	TicketID  string       `json:"ticket_id"`
	UserName  string       `json:"user_name"`
	UserID    string       `json:"user_id"`
	Status    TicketStatus `json:"status"`
	Urgent    UrgentLevel  `json:"urgent"`
	Location  string       `json:"location"`
	Latitude  float64      `json:"latitude"`
	Longitude float64      `json:"longitude"`
	VoiceClip string       `json:"voice_clip"`
	Timestamp string       `json:"timestamp"`
	UpdatedAt string       `json:"updated_at"`
	AdminNote string       `json:"admin_note,omitempty"`
}

// TicketListResponse — สำหรับ Admin Dashboard
type TicketListResponse struct {
	Total   int64             `json:"total"`
	Tickets []TicketResponse  `json:"tickets"`
}

// UploadVoiceResponse — ส่งกลับหลัง upload เสียงสำเร็จ
type UploadVoiceResponse struct {
	TicketID  string `json:"ticket_id"`
	VoiceClip string `json:"voice_clip"`
	Message   string `json:"message"`
}