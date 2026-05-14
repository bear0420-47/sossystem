package user

import (
	"time"

	"go.mongodb.org/mongo-driver/bson/primitive"
)

// TicketStatus defines the lifecycle states of an SOS ticket
type TicketStatus string

const (
	StatusPending    TicketStatus = "Pending"    // User submitted, waiting for admin
	StatusInProgress TicketStatus = "In Progress" // Admin acknowledged, help on the way
	StatusClosed     TicketStatus = "Closed"      // Case resolved
)

// UrgentLevel is set only by admin to prioritize cases
type UrgentLevel string

const (
	UrgentNone     UrgentLevel = ""        // default - not yet classified
	UrgentLow      UrgentLevel = "Low"
	UrgentMedium   UrgentLevel = "Medium"
	UrgentHigh     UrgentLevel = "High"
	UrgentCritical UrgentLevel = "Critical"
)

// Ticket is the core data model stored in MongoDB
// Matches the required JSON structure exactly
type Ticket struct {
	ID        primitive.ObjectID `bson:"_id,omitempty"    json:"-"`
	TicketID  string             `bson:"ticket_id"        json:"ticket_id"`   // e.g. "SOS-9901"
	Status    TicketStatus       `bson:"status"           json:"status"`      // Pending | In Progress | Closed
	Urgent    UrgentLevel        `bson:"urgent"           json:"urgent"`      // admin-only field, default ""
	Location  string             `bson:"location"         json:"location"`    // "lat, lng"
	VoiceClip string             `bson:"voice_clip"       json:"voice_clip"`  // URL to audio file
	Timestamp time.Time          `bson:"timestamp"        json:"timestamp"`
}