package user

// CreateTicketRequest — payload sent by the User/Victim when pressing SOS
// voice_clip is a pre-signed URL from the client after uploading the audio file
type CreateTicketRequest struct {
	Location  string `json:"location"   validate:"required"` // "lat, lng"
	VoiceClip string `json:"voice_clip" validate:"required"` // storage URL
}

// UpdateStatusRequest — payload sent by Admin to change ticket status
type UpdateStatusRequest struct {
	Status TicketStatus `json:"status" validate:"required,oneof=Pending 'In Progress' Closed"`
}

// UpdateUrgentRequest — payload sent by Admin to set priority level
// Only admin can call this endpoint
type UpdateUrgentRequest struct {
	Urgent UrgentLevel `json:"urgent" validate:"required,oneof='' Low Medium High Critical"`
}

// TicketResponse — outgoing JSON that exactly matches the required schema
type TicketResponse struct {
	TicketID  string       `json:"ticket_id"`
	Status    TicketStatus `json:"status"`
	Urgent    UrgentLevel  `json:"urgent"`
	Location  string       `json:"location"`
	VoiceClip string       `json:"voice_clip"`
	Timestamp string       `json:"timestamp"` // RFC3339 timestamp in Asia/Bangkok
}
