package main

import (
	"bytes"
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"image"
	"image/jpeg"
	_ "image/jpeg"
	"image/png"
	_ "image/png"
	"net/http"
	"time"

	"golang.org/x/image/draw"
)

type R2Client struct {
	config   R2Config
	endpoint string
}

func NewR2Client(cfg R2Config) *R2Client {
	return &R2Client{
		config:   cfg,
		endpoint: fmt.Sprintf("https://%s.r2.cloudflarestorage.com", cfg.R2Id),
	}
}

func (r *R2Client) URL(key string) string {
	return fmt.Sprintf("%s/%s", r.config.R2Url, key)
}

func (r *R2Client) Upload(ctx context.Context, key, contentType string, data []byte) error {
	url := fmt.Sprintf("%s/%s/%s", r.endpoint, r.config.R2Bucket, key)

	now := time.Now().UTC()
	dateStamp := now.Format("20060102")
	amzDate := now.Format("20060102T150405Z")
	bodyHash := sha256Hex(data)
	host := fmt.Sprintf("%s.r2.cloudflarestorage.com", r.config.R2Id)

	canonicalHeaders := fmt.Sprintf(
		"content-type:%s\nhost:%s\nx-amz-content-sha256:%s\nx-amz-date:%s\n",
		contentType, host, bodyHash, amzDate,
	)
	signedHeaders := "content-type;host;x-amz-content-sha256;x-amz-date"
	canonicalRequest := fmt.Sprintf("PUT\n/%s/%s\n\n%s\n%s\n%s",
		r.config.R2Bucket, key, canonicalHeaders, signedHeaders, bodyHash,
	)

	credentialScope := fmt.Sprintf("%s/auto/s3/aws4_request", dateStamp)
	stringToSign := fmt.Sprintf("AWS4-HMAC-SHA256\n%s\n%s\n%s",
		amzDate, credentialScope, sha256Hex([]byte(canonicalRequest)),
	)

	signingKey := hmacSHA256(
		hmacSHA256(
			hmacSHA256(
				hmacSHA256([]byte("AWS4"+r.config.R2Secret), []byte(dateStamp)),
				[]byte("auto"),
			),
			[]byte("s3"),
		),
		[]byte("aws4_request"),
	)
	signature := hex.EncodeToString(hmacSHA256(signingKey, []byte(stringToSign)))

	req, err := http.NewRequestWithContext(ctx, http.MethodPut, url, bytes.NewReader(data))
	if err != nil {
		return err
	}
	req.Header.Set("Content-Type", contentType)
	req.Header.Set("Host", host)
	req.Header.Set("x-amz-date", amzDate)
	req.Header.Set("x-amz-content-sha256", bodyHash)
	req.Header.Set("Authorization", fmt.Sprintf(
		"AWS4-HMAC-SHA256 Credential=%s/%s, SignedHeaders=%s, Signature=%s",
		r.config.R2Key, credentialScope, signedHeaders, signature,
	))

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK && resp.StatusCode != http.StatusCreated {
		return fmt.Errorf("r2 upload failed: status %d", resp.StatusCode)
	}
	return nil
}

// ResizeJPEG декодирует любой формат, ресайзит до maxPx по длинной стороне, возвращает JPEG
func ResizeJPEG(data []byte, maxPx int) ([]byte, error) {
	src, _, err := image.Decode(bytes.NewReader(data))
	if err != nil {
		return nil, fmt.Errorf("decode: %w", err)
	}
	dst := scaleImage(src, maxPx)
	var buf bytes.Buffer
	if err := jpeg.Encode(&buf, dst, &jpeg.Options{Quality: 85}); err != nil {
		return nil, fmt.Errorf("jpeg encode: %w", err)
	}
	return buf.Bytes(), nil
}

// ResizePNG декодирует PNG, ресайзит до maxPx по длинной стороне, возвращает PNG
func ResizePNG(data []byte, maxPx int) ([]byte, error) {
	src, err := png.Decode(bytes.NewReader(data))
	if err != nil {
		return nil, fmt.Errorf("decode png: %w", err)
	}
	dst := scaleImage(src, maxPx)
	var buf bytes.Buffer
	if err := png.Encode(&buf, dst); err != nil {
		return nil, fmt.Errorf("png encode: %w", err)
	}
	return buf.Bytes(), nil
}

func scaleImage(src image.Image, maxPx int) image.Image {
	b := src.Bounds()
	w, h := b.Dx(), b.Dy()
	if w <= maxPx && h <= maxPx {
		return src
	}
	var dw, dh int
	if w > h {
		dw, dh = maxPx, h*maxPx/w
	} else {
		dw, dh = w*maxPx/h, maxPx
	}
	dst := image.NewRGBA(image.Rect(0, 0, dw, dh))
	draw.BiLinear.Scale(dst, dst.Bounds(), src, b, draw.Over, nil)
	return dst
}

func sha256Hex(data []byte) string {
	h := sha256.Sum256(data)
	return hex.EncodeToString(h[:])
}

func hmacSHA256(key, data []byte) []byte {
	h := hmac.New(sha256.New, key)
	h.Write(data)
	return h.Sum(nil)
}
