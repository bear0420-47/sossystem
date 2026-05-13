package ticket

import (
	"context"
	"fmt"
	"time"

	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/bson/primitive"
	"go.mongodb.org/mongo-driver/mongo"
	"go.mongodb.org/mongo-driver/mongo/options"
)

type Repository interface {
	Create(ctx context.Context, ticket *Ticket) (*Ticket, error)
	FindByTicketID(ctx context.Context, ticketID string) (*Ticket, error)
	FindAll(ctx context.Context, filter bson.M) ([]*Ticket, int64, error)
	UpdateStatus(ctx context.Context, ticketID string, status TicketStatus, adminNote string) (*Ticket, error)
	UpdateUrgent(ctx context.Context, ticketID string, urgent UrgentLevel) (*Ticket, error)
	UpdateVoiceClip(ctx context.Context, ticketID string, voiceURL string) (*Ticket, error)
	WatchChanges(ctx context.Context) (*mongo.ChangeStream, error)
}

type repository struct {
	col *mongo.Collection
}

func NewRepository(db *mongo.Database) Repository {
	col := db.Collection("tickets")

	// Index: ค้นหาด้วย ticket_id
	col.Indexes().CreateOne(ctx(), mongo.IndexModel{
		Keys:    bson.D{{Key: "ticket_id", Value: 1}},
		Options: options.Index().SetUnique(true),
	})
	// Index: เรียงตาม timestamp (Dashboard)
	col.Indexes().CreateOne(ctx(), mongo.IndexModel{
		Keys: bson.D{{Key: "timestamp", Value: -1}},
	})
	// Index: กรองตาม status
	col.Indexes().CreateOne(ctx(), mongo.IndexModel{
		Keys: bson.D{{Key: "status", Value: 1}},
	})

	return &repository{col: col}
}

func ctx() context.Context {
	c, _ := context.WithTimeout(context.Background(), 5*time.Second)
	return c
}

// Create สร้าง ticket ใหม่
func (r *repository) Create(ctx context.Context, t *Ticket) (*Ticket, error) {
	t.ID = primitive.NewObjectID()
	t.Timestamp = time.Now()
	t.UpdatedAt = time.Now()
	t.Status = StatusPending // เริ่มต้นเป็น Pending เสมอ
	t.Urgent = ""            // ให้ admin เป็นคนกำหนดเอง

	_, err := r.col.InsertOne(ctx, t)
	if err != nil {
		return nil, fmt.Errorf("create ticket: %w", err)
	}
	return t, nil
}

// FindByTicketID ค้นหาด้วย ticket_id string (เช่น "SOS-9901")
func (r *repository) FindByTicketID(ctx context.Context, ticketID string) (*Ticket, error) {
	var t Ticket
	err := r.col.FindOne(ctx, bson.M{"ticket_id": ticketID}).Decode(&t)
	if err != nil {
		if err == mongo.ErrNoDocuments {
			return nil, ErrTicketNotFound
		}
		return nil, fmt.Errorf("find ticket: %w", err)
	}
	return &t, nil
}

// FindAll ดึงรายการ ticket (รองรับ filter เช่น status, user_id)
func (r *repository) FindAll(ctx context.Context, filter bson.M) ([]*Ticket, int64, error) {
	opts := options.Find().SetSort(bson.D{{Key: "timestamp", Value: -1}})

	total, err := r.col.CountDocuments(ctx, filter)
	if err != nil {
		return nil, 0, fmt.Errorf("count tickets: %w", err)
	}

	cursor, err := r.col.Find(ctx, filter, opts)
	if err != nil {
		return nil, 0, fmt.Errorf("find tickets: %w", err)
	}
	defer cursor.Close(ctx)

	var tickets []*Ticket
	if err := cursor.All(ctx, &tickets); err != nil {
		return nil, 0, fmt.Errorf("decode tickets: %w", err)
	}
	return tickets, total, nil
}

// UpdateStatus เปลี่ยนสถานะ (Admin เท่านั้น) → trigger real-time ผ่าน Change Stream
func (r *repository) UpdateStatus(ctx context.Context, ticketID string, status TicketStatus, adminNote string) (*Ticket, error) {
	now := time.Now()
	update := bson.M{
		"$set": bson.M{
			"status":     status,
			"updated_at": now,
			"admin_note": adminNote,
		},
	}

	// ถ้าปิดเคส บันทึกเวลาปิดด้วย
	if status == StatusClosed {
		update["$set"].(bson.M)["closed_at"] = now
	}

	opts := options.FindOneAndUpdate().SetReturnDocument(options.After)
	var t Ticket
	err := r.col.FindOneAndUpdate(ctx, bson.M{"ticket_id": ticketID}, update, opts).Decode(&t)
	if err != nil {
		if err == mongo.ErrNoDocuments {
			return nil, ErrTicketNotFound
		}
		return nil, fmt.Errorf("update status: %w", err)
	}
	return &t, nil
}

// UpdateUrgent — Admin กำหนดระดับความเร่งด่วน
func (r *repository) UpdateUrgent(ctx context.Context, ticketID string, urgent UrgentLevel) (*Ticket, error) {
	opts := options.FindOneAndUpdate().SetReturnDocument(options.After)
	var t Ticket
	err := r.col.FindOneAndUpdate(ctx,
		bson.M{"ticket_id": ticketID},
		bson.M{"$set": bson.M{"urgent": urgent, "updated_at": time.Now()}},
		opts,
	).Decode(&t)
	if err != nil {
		if err == mongo.ErrNoDocuments {
			return nil, ErrTicketNotFound
		}
		return nil, fmt.Errorf("update urgent: %w", err)
	}
	return &t, nil
}

// UpdateVoiceClip อัปเดต URL เสียงหลังจาก upload ขึ้น storage เสร็จ
func (r *repository) UpdateVoiceClip(ctx context.Context, ticketID string, voiceURL string) (*Ticket, error) {
	opts := options.FindOneAndUpdate().SetReturnDocument(options.After)
	var t Ticket
	err := r.col.FindOneAndUpdate(ctx,
		bson.M{"ticket_id": ticketID},
		bson.M{"$set": bson.M{"voice_clip": voiceURL, "updated_at": time.Now()}},
		opts,
	).Decode(&t)
	if err != nil {
		if err == mongo.ErrNoDocuments {
			return nil, ErrTicketNotFound
		}
		return nil, fmt.Errorf("update voice_clip: %w", err)
	}
	return &t, nil
}

// WatchChanges เปิด MongoDB Change Stream เพื่อ push real-time ไปยัง SSE / WebSocket
func (r *repository) WatchChanges(ctx context.Context) (*mongo.ChangeStream, error) {
	pipeline := mongo.Pipeline{
		bson.D{{Key: "$match", Value: bson.D{
			{Key: "operationType", Value: bson.D{{Key: "$in", Value: bson.A{"insert", "update"}}}},
		}}},
	}
	opts := options.ChangeStream().SetFullDocument(options.UpdateLookup)
	stream, err := r.col.Watch(ctx, pipeline, opts)
	if err != nil {
		return nil, fmt.Errorf("watch changes: %w", err)
	}
	return stream, nil
}