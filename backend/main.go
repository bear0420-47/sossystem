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

func main() {
	if err := godotenv.Load(); err != nil {
		log.Println("[Config] No .env file found, using environment variables")
	}

	// ── Database ──────────────────────────────────────────────────────────
	database.ConnectMongo()
	defer database.Disconnect()

	// ── Context สำหรับ graceful shutdown ──────────────────────────────────
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	// ── Dependency injection ──────────────────────────────────────────────
	repo := user.NewRepository()
	svc := user.NewService(repo)
	handler := user.NewHandler(svc)

	// ── เริ่ม MongoDB Change Stream (real-time push ผ่าน SSE Hub) ─────────
	svc.StartChangeStream(ctx)

	// ── Fiber (ไม่ต้องใช้ Streamable เพราะ SSE ใช้ SetBodyStreamWriter) ──
	app := fiber.New(fiber.Config{
		AppName:               "SOS Emergency Response System",
		StreamRequestBody:     true,
		DisableStartupMessage: false,
	})

	app.Use(recover.New())
	app.Use(logger.New())
	app.Use(cors.New(cors.Config{
		AllowOrigins: "*",
		AllowHeaders: "Origin, Content-Type, Accept, Cache-Control",
		AllowMethods: "GET, POST, PATCH, DELETE",
	}))

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