package user

import (
	"bytes"
	"mime/multipart"
	"net/http"
	"net/http/httptest"
	"net/textproto"
	"testing"
)

func TestValidateAudioFileAcceptsWebM(t *testing.T) {
	file := buildMultipartFileHeader(t, "voice", "recording.webm", []byte{
		0x1A, 0x45, 0xDF, 0xA3, 0x93, 0x42, 0x82, 0x88,
		0x77, 0x65, 0x62, 0x6D, 0x42, 0x87, 0x81, 0x02,
	})

	mimeType, err := validateAudioFile(file)
	if err != nil {
		t.Fatalf("expected webm file to be accepted, got error: %v", err)
	}

	if mimeType != "video/webm" {
		t.Fatalf("expected detected mime type video/webm, got %q", mimeType)
	}
}

func TestValidateAudioFileRejectsDeclaredButNonAudioContentType(t *testing.T) {
	file := buildMultipartFileHeaderWithDeclaredType(t, "voice", "recording.webm", "audio/webm", []byte("not-a-recognizable-webm-header"))

	_, err := validateAudioFile(file)
	if err == nil {
		t.Fatalf("expected declared audio/webm content type to be rejected when magic bytes are not audio")
	}
}

func buildMultipartFileHeader(t *testing.T, fieldName, fileName string, content []byte) *multipart.FileHeader {
	t.Helper()
	return buildMultipartFileHeaderWithDeclaredType(t, fieldName, fileName, "application/octet-stream", content)
}

func buildMultipartFileHeaderWithDeclaredType(t *testing.T, fieldName, fileName, contentType string, content []byte) *multipart.FileHeader {
	t.Helper()

	var body bytes.Buffer
	writer := multipart.NewWriter(&body)

	headers := make(textproto.MIMEHeader)
	headers.Set("Content-Disposition", `form-data; name="`+fieldName+`"; filename="`+fileName+`"`)
	headers.Set("Content-Type", contentType)

	part, err := writer.CreatePart(headers)
	if err != nil {
		t.Fatalf("create form file: %v", err)
	}

	if _, err := part.Write(content); err != nil {
		t.Fatalf("write multipart content: %v", err)
	}

	if err := writer.Close(); err != nil {
		t.Fatalf("close multipart writer: %v", err)
	}

	req := httptest.NewRequest(http.MethodPost, "/", &body)
	req.Header.Set("Content-Type", writer.FormDataContentType())

	if err := req.ParseMultipartForm(int64(body.Len())); err != nil {
		t.Fatalf("parse multipart form: %v", err)
	}

	files := req.MultipartForm.File[fieldName]
	if len(files) != 1 {
		t.Fatalf("expected 1 uploaded file, got %d", len(files))
	}

	return files[0]
}
