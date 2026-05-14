package user

import (
	"fmt"
	"mime/multipart"
	"net/http"
	"path/filepath"

	"github.com/google/uuid"
	"github.com/gofiber/fiber/v2"
)

// allowedAudioTypes — MIME types ที่อนุญาตสำหรับไฟล์เสียง SOS
// ตรวจจาก magic bytes จริง ไม่ใช่แค่ extension
var allowedAudioTypes = map[string]bool{
	"audio/mpeg":      true, // .mp3
	"audio/mp4":       true, // .m4a / .mp4 audio
	"audio/x-m4a":     true, // .m4a (iOS default)
	"audio/x-wav":     true, // .wav variant
	"audio/wave":      true, // some detectors return this for wav
	"audio/ogg":       true, // .ogg
	"audio/wav":       true, // .wav
	"audio/webm":      true, // .webm audio (Android/Chrome)
	"video/mp4":       true, // .m4a บางครั้ง detect เป็น video/mp4
	"application/ogg": true, // .ogg variant
}

// maxVoiceFileSize — จำกัดขนาดไฟล์เสียงสูงสุด 10MB
// เพียงพอสำหรับคลิป 5-10 วินาที
const maxVoiceFileSize = 10 * 1024 * 1024 // 10MB

// VoiceUploadResponse — response หลัง upload สำเร็จ
// Client นำ voice_url ไปใช้ใน CreateTicket request
type VoiceUploadResponse struct {
	VoiceURL string `json:"voice_url"` // path สำหรับเข้าถึงไฟล์
	FileName string `json:"file_name"` // ชื่อไฟล์ที่ generate (UUID-based)
	Size     int64  `json:"size"`      // ขนาดไฟล์ (bytes)
	MimeType string `json:"mime_type"` // MIME type จริงที่ detect ได้
}

// validateAudioFile ตรวจ MIME type จาก magic bytes (512 bytes แรก)
// ป้องกันการ rename ไฟล์อันตรายเป็น .m4a แล้วส่งมา
func validateAudioFile(file *multipart.FileHeader) (string, error) {
	f, err := file.Open()
	if err != nil {
		return "", fmt.Errorf("cannot open file: %w", err)
	}
	defer f.Close()

	// อ่าน 512 bytes แรกสำหรับ MIME detection (ตาม Fiber doc)
	buf := make([]byte, 512)
	n, err := f.Read(buf)
	if err != nil {
		return "", fmt.Errorf("cannot read file: %w", err)
	}

	mimeType := http.DetectContentType(buf[:n])

	if !allowedAudioTypes[mimeType] {
		return "", fmt.Errorf("file type '%s' is not allowed — only audio files are accepted", mimeType)
	}

	return mimeType, nil
}

// UploadVoiceClip เป็น Fiber handler สำหรับรับไฟล์เสียงจาก client
func UploadVoiceClip(uploadDir string) fiber.Handler {
	return func(c *fiber.Ctx) error {
		// รับไฟล์จาก form field "voice"
		file, err := c.FormFile("voice")
		if err != nil {
			return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
				"error": "no voice file uploaded — use form-data field named 'voice'",
			})
		}

		// ตรวจขนาดไฟล์ก่อนเปิดอ่าน
		if file.Size > maxVoiceFileSize {
			return c.Status(fiber.StatusRequestEntityTooLarge).JSON(fiber.Map{
				"error": fmt.Sprintf("file too large: %d bytes (max %d bytes / 10MB)", file.Size, maxVoiceFileSize),
			})
		}

		// ตรวจ MIME type จาก magic bytes
		mimeType, err := validateAudioFile(file)
		if err != nil {
			return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
				"error": err.Error(),
			})
		}

		// สร้างชื่อไฟล์ใหม่ด้วย UUID — ไม่ใช้ชื่อจาก client เด็ดขาด (path traversal prevention)
		ext := filepath.Ext(file.Filename)
		if ext == "" {
			ext = ".m4a" // default extension สำหรับไฟล์เสียงไม่มี extension
		}
		safeFileName := fmt.Sprintf("%s%s", uuid.New().String(), ext)
		savePath := filepath.Join(uploadDir, safeFileName)

		// บันทึกไฟล์ลง disk
		if err := c.SaveFile(file, savePath); err != nil {
			return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
				"error": "failed to save voice file",
			})
		}

		// คืน URL สำหรับนำไปใช้ใน CreateTicket request
		voiceURL := fmt.Sprintf("/uploads/voice/%s", safeFileName)

		return c.Status(fiber.StatusCreated).JSON(VoiceUploadResponse{
			VoiceURL: voiceURL,
			FileName: safeFileName,
			Size:     file.Size,
			MimeType: mimeType,
		})
	}
}