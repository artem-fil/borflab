package main

import (
	"bytes"
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"image"
	"image/color"
	"image/jpeg"
	_ "image/jpeg"
	"image/png"
	_ "image/png"
	"net/http"
	"os"
	"path/filepath"
	"time"

	"golang.org/x/image/draw"
)

const (
	bboxPaddingFrac = 0.02
	alphaThreshold  = 0x1400 // ~8%
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

func findBBox(img image.Image, rect image.Rectangle) (bbox image.Rectangle, found bool) {
	minX, minY := rect.Max.X, rect.Max.Y
	maxX, maxY := rect.Min.X, rect.Min.Y

	for y := rect.Min.Y; y < rect.Max.Y; y++ {
		for x := rect.Min.X; x < rect.Max.X; x++ {
			_, _, _, a := img.At(x, y).RGBA()
			if a > alphaThreshold {
				found = true
				if x < minX {
					minX = x
				}
				if x > maxX {
					maxX = x
				}
				if y < minY {
					minY = y
				}
				if y > maxY {
					maxY = y
				}
			}
		}
	}
	if !found {
		return image.Rectangle{}, false
	}
	return image.Rect(minX, minY, maxX+1, maxY+1), true
}

// padAndSquare добавляет паддинг вокруг bbox, приводит к квадрату
// и сдвигает (не сжимает) прямоугольник так, чтобы он не выходил за frameBounds.
func padAndSquare(bbox, frameBounds image.Rectangle) image.Rectangle {
	padX := int(float64(bbox.Dx()) * bboxPaddingFrac)
	padY := int(float64(bbox.Dy()) * bboxPaddingFrac)
	r := image.Rect(bbox.Min.X-padX, bbox.Min.Y-padY, bbox.Max.X+padX, bbox.Max.Y+padY)

	// клампим паддинг к границам своей трети
	r = r.Intersect(frameBounds)

	// приводим к квадрату по большей стороне, центр — центр текущего r
	side := r.Dx()
	if r.Dy() > side {
		side = r.Dy()
	}
	cx, cy := (r.Min.X+r.Max.X)/2, (r.Min.Y+r.Max.Y)/2
	half := side / 2
	sq := image.Rect(cx-half, cy-half, cx-half+side, cy-half+side)

	// если квадрат вылезает за frameBounds — сдвигаем целиком (не сжимаем),
	// чтобы не обрезать монстра
	if sq.Min.X < frameBounds.Min.X {
		d := frameBounds.Min.X - sq.Min.X
		sq.Min.X += d
		sq.Max.X += d
	}
	if sq.Max.X > frameBounds.Max.X {
		d := sq.Max.X - frameBounds.Max.X
		sq.Min.X -= d
		sq.Max.X -= d
	}
	if sq.Min.Y < frameBounds.Min.Y {
		d := frameBounds.Min.Y - sq.Min.Y
		sq.Min.Y += d
		sq.Max.Y += d
	}
	if sq.Max.Y > frameBounds.Max.Y {
		d := sq.Max.Y - frameBounds.Max.Y
		sq.Min.Y -= d
		sq.Max.Y -= d
	}

	// финальный кламп на случай если сторона квадрата больше самой трети целиком
	return sq.Intersect(frameBounds)
}

func cropToRGBA(src image.Image, rect image.Rectangle) *image.RGBA {
	dst := image.NewRGBA(image.Rect(0, 0, rect.Dx(), rect.Dy()))
	draw.Draw(dst, dst.Bounds(), src, rect.Min, draw.Src)
	return dst
}

// scaleNearest ресайзит в квадрат targetSize x targetSize методом ближайшего соседа —
// единственный корректный способ для пиксель-арта, BiLinear/BiCubic размывают его в кашу.
func scaleNearest(src image.Image, targetSize int) *image.RGBA {
	dst := image.NewRGBA(image.Rect(0, 0, targetSize, targetSize))
	draw.NearestNeighbor.Scale(dst, dst.Bounds(), src, src.Bounds(), draw.Over, nil)
	return dst
}

func encodePNG(img image.Image) []byte {
	var buf bytes.Buffer
	_ = png.Encode(&buf, img) // encode в память не должен фейлиться на валидном image.RGBA
	return buf.Bytes()
}

// ── debug helpers ────────────────────────────────────────────────────────────

func dumpDebugImage(img image.Image, debugDir, name string) {
	_ = os.MkdirAll(debugDir, 0755)
	path := filepath.Join(debugDir, name+".png")
	f, err := os.Create(path)
	if err != nil {
		return
	}
	defer f.Close()
	_ = png.Encode(f, img)
}

// dumpDebugSheet сохраняет исходный лист с нарисованными поверх bbox-рамками
// (красная рамка = squared bbox, использованный для кропа) — удобно смотреть,
// что именно задетектилось.
func dumpDebugSheet(src image.Image, bboxes map[string]image.Rectangle, debugDir, tag string) {
	_ = os.MkdirAll(debugDir, 0755)
	b := src.Bounds()
	dst := image.NewRGBA(b)
	draw.Draw(dst, b, src, b.Min, draw.Src)

	red := color.RGBA{255, 0, 0, 255}
	for _, r := range bboxes {
		drawRect(dst, r, red)
	}

	path := filepath.Join(debugDir, fmt.Sprintf("sheet_%s.png", tag))
	f, err := os.Create(path)
	if err != nil {
		return
	}
	defer f.Close()
	_ = png.Encode(f, dst)
}

func drawRect(img *image.RGBA, r image.Rectangle, c color.RGBA) {
	for x := r.Min.X; x < r.Max.X; x++ {
		img.Set(x, r.Min.Y, c)
		img.Set(x, r.Max.Y-1, c)
	}
	for y := r.Min.Y; y < r.Max.Y; y++ {
		img.Set(r.Min.X, y, c)
		img.Set(r.Max.X-1, y, c)
	}
}
