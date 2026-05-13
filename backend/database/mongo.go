package database

import (
	"context"
	"os"

	"go.mongodb.org/mongo-driver/v2/mongo"
	"go.mongodb.org/mongo-driver/v2/mongo/options"
)

// Connect เปิด connection ไป MongoDB และคืน *mongo.Database ที่พร้อมใช้
// ข้อสังเกต: mongo.Connect เป็น lazy — ต้อง Ping เพื่อให้แน่ใจว่าเชื่อมจริง
func Connect(ctx context.Context) (*mongo.Database, error) {
	uri := os.Getenv("MONGO_URI")
	if uri == "" {
		uri = "mongodb://localhost:27017"
	}
	dbName := os.Getenv("MONGO_DB")
	if dbName == "" {
		dbName = "sossystem"
	}

	client, err := mongo.Connect(options.Client().ApplyURI(uri))
	if err != nil {
		return nil, err
	}

	if err := client.Ping(ctx, nil); err != nil {
		return nil, err
	}

	return client.Database(dbName), nil
}
