package main

import (
	"context"
	"log"
	"os"
	"os/signal"
	"syscall"

	"sossystem/database"
	"sossystem/user"

	"github.com/gofiber/fiber/v2"
	"github.com/gofiber/fiber/v2/middleware/cors"
	"github.com/gofiber/fiber/v2/middleware/logger"
	"github.com/gofiber/fiber/v2/middleware/recover"
	"github.com/joho/godotenv"
)

func main() {
	// Load .env (ignore error in production where env vars are set externally)
	if err := godotenv.Load(); err != nil {
		log.Println("[Config] No .env file found, using environment variables")
	}

	// ── Database ──────────────────────────────────────────────────────────
	database.ConnectMongo()
	defer database.Disconnect()

	// ── Application context (for graceful shutdown) ───────────────────────
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	// ── Dependency injection (wire up layers) ─────────────────────────────
	repo := user.NewRepository()
	svc := user.NewService(repo)
	handler := user.NewHandler(svc)

	// ── Real-time Change Stream (MongoDB → WebSocket broadcast) ───────────
	svc.StartChangeStream(ctx)

	// ── Fiber HTTP Server ─────────────────────────────────────────────────
	app := fiber.New(fiber.Config{
		AppName: "SOS Emergency Response System",
	})

	// Global middleware
	app.Use(recover.New())
	app.Use(logger.New())
	app.Use(cors.New(cors.Config{
		AllowOrigins: "*",
		AllowHeaders: "Origin, Content-Type, Accept",
		AllowMethods: "GET, POST, PATCH, DELETE",
	}))

	// Health check
	app.Get("/health", func(c *fiber.Ctx) error {
		return c.JSON(fiber.Map{"status": "ok", "service": "SOS System"})
	})

	// Register SOS routes under /api/v1
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
		log.Printf("[Server] SOS System running on :%s", port)
		if err := app.Listen(":" + port); err != nil {
			log.Fatalf("[Server] Failed to start: %v", err)
		}
	}()

	<-quit
	log.Println("[Server] Shutting down gracefully...")
	cancel()
	_ = app.Shutdown()
}
