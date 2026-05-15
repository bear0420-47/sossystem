package main

import (
	"context"
	"log"
	"os"
	"os/signal"
	"syscall"

	"sos-system/database"
	"sos-system/user"

	"github.com/gofiber/fiber/v2"
	"github.com/gofiber/fiber/v2/middleware/cors"
	"github.com/gofiber/fiber/v2/middleware/logger"
	"github.com/gofiber/fiber/v2/middleware/recover"
	"github.com/joho/godotenv"
)

const uploadDir = "./uploads/voice"

func main() {
	if err := godotenv.Load(); err != nil {
		log.Println("[Config] No .env file found, using environment variables")
	}

	// ── สร้าง upload directory ถ้ายังไม่มี ────────────────────────────────
	if err := os.MkdirAll(uploadDir, 0755); err != nil {
		log.Fatalf("[Upload] Cannot create upload directory: %v", err)
	}
	log.Printf("[Upload] Voice files will be saved to: %s", uploadDir)

	// ── Database ──────────────────────────────────────────────────────────
	database.ConnectMongo()
	defer database.Disconnect()

	// ── Context สำหรับ graceful shutdown ──────────────────────────────────
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	// ── Dependency injection ──────────────────────────────────────────────
	repo := user.NewRepository()
	svc := user.NewService(repo)
	handler := user.NewHandler(svc, uploadDir) // ← ส่ง uploadDir เข้าไป

	// ── เริ่ม MongoDB Change Stream / Polling fallback ────────────────────
	svc.StartChangeStream(ctx)

	// ── Fiber ─────────────────────────────────────────────────────────────
	app := fiber.New(fiber.Config{
		AppName:               "SOS Emergency Response System",
		StreamRequestBody:     true,
		BodyLimit:             10 * 1024 * 1024, // 10MB — รองรับไฟล์เสียง
		DisableStartupMessage: false,
	})

	app.Use(recover.New())
	app.Use(logger.New())
	app.Use(cors.New(cors.Config{
		AllowOrigins: "*",
		AllowHeaders: "Origin, Content-Type, Accept, Cache-Control",
		AllowMethods: "GET, POST, PATCH, DELETE",
	}))

	app.Use("/uploads/voice", func(c *fiber.Ctx) error {
		c.Set("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate")
		c.Set("Pragma", "no-cache")
		c.Set("Expires", "0")
		return c.Next()
	})

	// Serve ไฟล์เสียงที่ upload แล้ว (static files)
	// เข้าถึงได้ที่ GET /uploads/voice/<filename>
	app.Static("/uploads/voice", uploadDir)

	// Health check
	app.Get("/health", func(c *fiber.Ctx) error {
		return c.JSON(fiber.Map{"status": "ok", "service": "SOS System"})
	})

	// SOS routes
	api := app.Group("/api/v1")
	handler.RegisterRoutes(api)

	// ── Graceful shutdown ─────────────────────────────────────────────────
	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)

	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}

	go func() {
		log.Printf("[Server] SOS System (SSE mode) running on :%s", port)
		if err := app.Listen(":" + port); err != nil {
			log.Fatalf("[Server] Failed to start: %v", err)
		}
	}()

	<-quit
	log.Println("[Server] Shutting down...")
	cancel()
	_ = app.Shutdown()
}
