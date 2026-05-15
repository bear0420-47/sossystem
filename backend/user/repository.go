package user

import (
	"context"
	"fmt"
	"strconv"
	"strings"
	"time"

	"sos-system/database"

	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/mongo"
	"go.mongodb.org/mongo-driver/mongo/options"
)

const collectionName = "tickets"

// const counterCollectionName = "counters"
const ticketCounterKey = "ticket_id"

var bangkokLocation = loadBangkokLocation()

func loadBangkokLocation() *time.Location {
	location, err := time.LoadLocation("Asia/Bangkok")
	if err != nil {
		return time.FixedZone("Asia/Bangkok", 7*60*60)
	}

	return location
}

func formatBangkokTime(t time.Time) string {
	return t.In(bangkokLocation).Format(time.RFC3339)
}

type Repository interface {
	Create(ctx context.Context, ticket *Ticket) error
	FindAll(ctx context.Context) ([]Ticket, error)
	FindByTicketID(ctx context.Context, ticketID string) (*Ticket, error)
	UpdateStatus(ctx context.Context, ticketID string, status TicketStatus) error
	UpdateUrgent(ctx context.Context, ticketID string, urgent UrgentLevel) error
	WatchChanges(ctx context.Context) (*mongo.ChangeStream, error)
	GenerateTicketID(ctx context.Context) (string, error)
}

type repository struct {
	col        *mongo.Collection
	counterCol *mongo.Collection
}

func NewRepository() Repository {
	r := &repository{
		col: database.GetCollection(collectionName),
		//counterCol: database.GetCollection(counterCollectionName),
	}

	// Ensure ticket_id is unique even under high concurrency.
	indexModel := mongo.IndexModel{
		Keys:    bson.D{{Key: "ticket_id", Value: 1}},
		Options: options.Index().SetUnique(true),
	}
	_, _ = r.col.Indexes().CreateOne(context.Background(), indexModel)

	return r
}

// Create inserts a new SOS ticket into MongoDB
func (r *repository) Create(ctx context.Context, ticket *Ticket) error {
	_, err := r.col.InsertOne(ctx, ticket)
	return err
}

// FindAll returns all tickets sorted by timestamp descending (newest first)
func (r *repository) FindAll(ctx context.Context) ([]Ticket, error) {
	opts := options.Find().SetSort(bson.D{{Key: "timestamp", Value: -1}})
	cursor, err := r.col.Find(ctx, bson.M{}, opts)
	if err != nil {
		return nil, err
	}
	defer cursor.Close(ctx)

	var tickets []Ticket
	if err := cursor.All(ctx, &tickets); err != nil {
		return nil, err
	}
	return tickets, nil
}

// FindByTicketID retrieves a single ticket by its human-readable ID (e.g. "SOS-9901")
func (r *repository) FindByTicketID(ctx context.Context, ticketID string) (*Ticket, error) {
	var ticket Ticket
	err := r.col.FindOne(ctx, bson.M{"ticket_id": ticketID}).Decode(&ticket)
	if err != nil {
		return nil, err
	}
	return &ticket, nil
}

// UpdateStatus changes the lifecycle state; only Status field is modified
func (r *repository) UpdateStatus(ctx context.Context, ticketID string, status TicketStatus) error {
	filter := bson.M{"ticket_id": ticketID}
	update := bson.M{"$set": bson.M{"status": status}}
	_, err := r.col.UpdateOne(ctx, filter, update)
	return err
}

// UpdateUrgent sets admin-controlled priority level; only Urgent field is modified
func (r *repository) UpdateUrgent(ctx context.Context, ticketID string, urgent UrgentLevel) error {
	filter := bson.M{"ticket_id": ticketID}
	update := bson.M{"$set": bson.M{"urgent": urgent}}
	_, err := r.col.UpdateOne(ctx, filter, update)
	return err
}

// WatchChanges opens a MongoDB Change Stream on the tickets collection
// This enables real-time push to WebSocket clients without polling
func (r *repository) WatchChanges(ctx context.Context) (*mongo.ChangeStream, error) {
	opts := options.ChangeStream().SetFullDocument(options.UpdateLookup)
	return r.col.Watch(ctx, mongo.Pipeline{}, opts)
}

// GenerateTicketID creates a sequential ID like "SOS-0001"
// Uses the highest existing numeric suffix so deleted rows do not cause duplicates.
func (r *repository) GenerateTicketID(ctx context.Context) (string, error) {
	cursor, err := r.col.Find(
		ctx,
		bson.M{},
		options.Find().SetProjection(bson.M{"ticket_id": 1, "_id": 0}),
	)
	if err != nil {
		return "", err
	}
	defer cursor.Close(ctx)

	maxNumber := 0
	for cursor.Next(ctx) {
		var doc struct {
			TicketID string `bson:"ticket_id"`
		}
		if err := cursor.Decode(&doc); err != nil {
			return "", err
		}

		number := extractTicketNumber(doc.TicketID)
		if number > maxNumber {
			maxNumber = number
		}
	}

	if err := cursor.Err(); err != nil {
		return "", err
	}

	return fmt.Sprintf("SOS-%04d", maxNumber+1), nil
}

func extractTicketNumber(ticketID string) int {
	parts := strings.Split(ticketID, "-")
	if len(parts) != 2 {
		return 0
	}

	number, err := strconv.Atoi(parts[1])
	if err != nil {
		return 0
	}

	return number
}

// toResponse converts internal Ticket model to the outgoing DTO
func toResponse(t Ticket) TicketResponse {
	return TicketResponse{
		TicketID:  t.TicketID,
		Status:    t.Status,
		Urgent:    t.Urgent,
		Location:  t.Location,
		VoiceClip: t.VoiceClip,
		Timestamp: formatBangkokTime(t.Timestamp),
	}
}
