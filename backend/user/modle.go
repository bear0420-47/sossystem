package ticket

import (
	"time"

	"go.mongodb.org/mongo-driver/bson/primitive"
)

type TicketStatus string
type UrgentLevel string

const (
	StatusPending    TicketStatus = "Pending"
	StatusInProgress TicketStatus = "In Progress"
	StatusClosed     TicketStatus = "Closed"

	UrgentLow      UrgentLevel = "Low"
	UrgentMedium   UrgentLevel = "Medium"
	UrgentHigh     UrgentLevel = "High"
	UrgentCritical UrgentLevel = "Critical"
)

type Ticket struct {
	ID        primitive.ObjectID `bson:"_id,omitempty"    json:"id,omitempty"`
	TicketID  string             `bson:"ticket_id"        json:"ticket_id"`
	UserName  string             `bson:"user_name"        json:"user_name"`
	UserID    string             `bson:"user_id"          json:"user_id"`
	Status    TicketStatus       `bson:"status"           json:"status"`
	Urgent    UrgentLevel        `bson:"urgent"           json:"urgent"`
	Location  string             `bson:"location"         json:"location"`
	Latitude  float64            `bson:"latitude"         json:"latitude"`
	Longitude float64            `bson:"longitude"        json:"longitude"`
	VoiceClip string             `bson:"voice_clip"       json:"voice_clip"`
	Timestamp time.Time          `bson:"timestamp"        json:"timestamp"`
	UpdatedAt time.Time          `bson:"updated_at"       json:"updated_at"`
	ClosedAt  *time.Time         `bson:"closed_at,omitempty" json:"closed_at,omitempty"`
	AdminNote string             `bson:"admin_note,omitempty" json:"admin_note,omitempty"`
}