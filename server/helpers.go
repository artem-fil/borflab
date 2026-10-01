package main

import (
	"bytes"
	"context"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"regexp"
	"strconv"
	"time"

	"image"
	"image/jpeg"
	"image/png"
	_ "image/png"

	"golang.org/x/image/draw"
)

func sanitizeJSON(s string) ([]byte, error) {

	var js map[string]any
	err := json.Unmarshal([]byte(s), &js)
	if err == nil {
		return []byte(s), nil
	}

	re := regexp.MustCompile("(?s)```(?:json)?\\s*(\\{.*?\\})\\s*```")
	matches := re.FindStringSubmatch(s)
	if len(matches) >= 2 {
		return []byte(matches[1]), nil
	}

	return nil, fmt.Errorf("can't parse JSON, even after markdown cleanup")
}

func encodeToBase64(data []byte) string {
	return base64.StdEncoding.EncodeToString(data)
}

func imageInfo(imgBytes []byte) (mime string, width, height, size int, err error) {
	size = len(imgBytes)

	mime = http.DetectContentType(imgBytes)

	img, _, err := image.Decode(bytes.NewReader(imgBytes))
	if err != nil {
		return "", 0, 0, size, err
	}

	bounds := img.Bounds()
	width = bounds.Dx()
	height = bounds.Dy()

	return mime, width, height, size, nil
}

func resizeAndConvert(file io.Reader, maxDim int) ([]byte, error) {
	imgBytes, err := io.ReadAll(file)
	if err != nil {
		return nil, err
	}

	mime := http.DetectContentType(imgBytes)

	if mime == "image/jpeg" {
		cfg, _, err := image.DecodeConfig(bytes.NewReader(imgBytes))
		if err == nil {
			if cfg.Width <= maxDim && cfg.Height <= maxDim {
				return imgBytes, nil
			}
		}
	}

	img, _, err := image.Decode(bytes.NewReader(imgBytes))
	if err != nil {
		return nil, err
	}

	width := img.Bounds().Dx()
	height := img.Bounds().Dy()

	if width > maxDim || height > maxDim {
		scale := float64(maxDim) / float64(width)
		if height > width {
			scale = float64(maxDim) / float64(height)
		}

		newW := int(float64(width) * scale)
		newH := int(float64(height) * scale)

		dst := image.NewRGBA(image.Rect(0, 0, newW, newH))
		draw.CatmullRom.Scale(dst, dst.Bounds(), img, img.Bounds(), draw.Over, nil)
		img = dst
	}

	buf := new(bytes.Buffer)
	if err := jpeg.Encode(buf, img, &jpeg.Options{Quality: 90}); err != nil {
		return nil, fmt.Errorf("cannot encode JPEG: %w", err)
	}

	return buf.Bytes(), nil
}

type SpriteBatch struct {
	Idle   []byte
	Walk   []byte
	Hit    []byte
	Avatar []byte
}

// processAndCropSprites нарезает лист на idle/walk/hit + avatar.
// targetSize — сторона финального квадрата в пикселях (64 или 128).
// debugDir — если не пусто, туда сохраняются: сырой лист с оверлеем найденных bbox
// и все промежуточные кропы до финального ресайза. Пусто — дебаг выключен.
func processAndCropSprites(spriteSheetBytes []byte, targetSize int, debugDir string) (*SpriteBatch, error) {
	srcImg, _, err := image.Decode(bytes.NewReader(spriteSheetBytes))
	if err != nil {
		return nil, fmt.Errorf("cannot decode sprite sheet image: %w", err)
	}

	bounds := srcImg.Bounds()
	width, height := bounds.Dx(), bounds.Dy()
	frameWidth := width / 3

	frames := []struct {
		name string
		rect image.Rectangle
	}{
		{"idle", image.Rect(0, 0, frameWidth, height)},
		{"walk", image.Rect(frameWidth, 0, frameWidth*2, height)},
		{"hit", image.Rect(frameWidth*2, 0, width, height)},
	}

	crops := make(map[string]*image.RGBA, 3)
	bboxesForDebug := make(map[string]image.Rectangle, 3)

	for _, f := range frames {
		bbox, found := findBBox(srcImg, f.rect)
		if !found {
			if debugDir != "" {
				dumpDebugSheet(srcImg, nil, debugDir, "FAILED_"+f.name)
			}
			return nil, fmt.Errorf("frame %q: no non-transparent pixels found in its third of the sheet", f.name)
		}
		squared := tightSquareCrop(bbox, f.rect, bboxPaddingFrac)
		bboxesForDebug[f.name] = squared
		crops[f.name] = cropToRGBA(srcImg, squared)
	}

	if debugDir != "" {
		dumpDebugSheet(srcImg, bboxesForDebug, debugDir, "ok")
		for name, img := range crops {
			dumpDebugImage(img, debugDir, name+"_crop")
		}
	}

	idle64 := letterboxScale(crops["idle"], targetSize)
	walk64 := letterboxScale(crops["walk"], targetSize)
	hit64 := letterboxScale(crops["hit"], targetSize)

	idleCrop := crops["idle"]
	avatarSrcRect := image.Rect(0, 0, idleCrop.Bounds().Dx(), idleCrop.Bounds().Dy()*6/10)
	avatarCrop := cropToRGBA(idleCrop, avatarSrcRect)
	avatar64 := letterboxScale(avatarCrop, targetSize)

	return &SpriteBatch{
		Idle:   encodePNG(idle64),
		Walk:   encodePNG(walk64),
		Hit:    encodePNG(hit64),
		Avatar: encodePNG(avatar64),
	}, nil
}

// tightSquareCrop строит квадрат вокруг ЦЕНТРА bbox (не углов), с равным
// паддингом со всех сторон — гарантирует, что монстр останется по центру
// кропа. Если квадрат не помещается в frameBounds, сдвигается целиком
// (не обрезается асимметрично), и только в крайнем случае ужимается,
// но не меньше исходного bbox.
func tightSquareCrop(bbox, frameBounds image.Rectangle, paddingFrac float64) image.Rectangle {
	maxDim := bbox.Dx()
	if bbox.Dy() > maxDim {
		maxDim = bbox.Dy()
	}
	pad := int(float64(maxDim) * paddingFrac)
	side := maxDim + pad*2

	cx := (bbox.Min.X + bbox.Max.X) / 2
	cy := (bbox.Min.Y + bbox.Max.Y) / 2

	maxAllowedSide := frameBounds.Dx()
	if frameBounds.Dy() < maxAllowedSide {
		maxAllowedSide = frameBounds.Dy()
	}
	if side > maxAllowedSide {
		side = maxAllowedSide
		if side < maxDim {
			side = maxDim // не режем сам силуэт монстра
		}
	}

	half := side / 2
	r := image.Rect(cx-half, cy-half, cx-half+side, cy-half+side)

	// сдвигаем целиком, если вылезли за границы фрейма — форма квадрата
	// (и центровка монстра внутри него) не нарушается
	if r.Min.X < frameBounds.Min.X {
		d := frameBounds.Min.X - r.Min.X
		r.Min.X += d
		r.Max.X += d
	}
	if r.Max.X > frameBounds.Max.X {
		d := r.Max.X - frameBounds.Max.X
		r.Min.X -= d
		r.Max.X -= d
	}
	if r.Min.Y < frameBounds.Min.Y {
		d := frameBounds.Min.Y - r.Min.Y
		r.Min.Y += d
		r.Max.Y += d
	}
	if r.Max.Y > frameBounds.Max.Y {
		d := r.Max.Y - frameBounds.Max.Y
		r.Min.Y -= d
		r.Max.Y -= d
	}

	return r.Intersect(frameBounds)
}

// letterboxScale масштабирует src методом ближайшего соседа так, чтобы он
// вписался в targetSize x targetSize БЕЗ искажения пропорций (contain-fit),
// и центрирует результат на прозрачном квадратном холсте. Длинная сторона
// монстра будет вплотную к краям картинки, короткая — с минимальным
// прозрачным полем по бокам.
func letterboxScale(src image.Image, targetSize int) *image.RGBA {
	sb := src.Bounds()
	sw, sh := sb.Dx(), sb.Dy()

	var scale float64
	if sw >= sh {
		scale = float64(targetSize) / float64(sw)
	} else {
		scale = float64(targetSize) / float64(sh)
	}
	dw := int(float64(sw) * scale)
	dh := int(float64(sh) * scale)
	if dw < 1 {
		dw = 1
	}
	if dh < 1 {
		dh = 1
	}

	scaled := image.NewRGBA(image.Rect(0, 0, dw, dh))
	draw.NearestNeighbor.Scale(scaled, scaled.Bounds(), src, sb, draw.Over, nil)

	canvas := image.NewRGBA(image.Rect(0, 0, targetSize, targetSize))
	offX := (targetSize - dw) / 2
	offY := (targetSize - dh) / 2
	draw.Draw(canvas, image.Rect(offX, offY, offX+dw, offY+dh), scaled, image.Point{}, draw.Over)
	return canvas
}

func cropSubImage(img image.Image, rect image.Rectangle) image.Image {
	type subImager interface {
		SubImage(r image.Rectangle) image.Image
	}
	if si, ok := img.(subImager); ok {
		return si.SubImage(rect)
	}

	dst := image.NewRGBA(image.Rect(0, 0, rect.Dx(), rect.Dy()))
	draw.Draw(dst, dst.Bounds(), img, rect.Min, draw.Src)
	return dst
}

func resizeTo64(img image.Image) ([]byte, error) {
	dst := image.NewRGBA(image.Rect(0, 0, 64, 64))

	// NearestNeighbor критически важен, чтобы сохранить четкие границы пикселей pixel-art'а
	draw.NearestNeighbor.Scale(dst, dst.Bounds(), img, img.Bounds(), draw.Over, nil)

	var buf bytes.Buffer
	if err := png.Encode(&buf, dst); err != nil {
		return nil, err
	}
	return buf.Bytes(), nil
}

func downloadFile(ctx context.Context, url string) ([]byte, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return nil, fmt.Errorf("cannot create download request: %w", err)
	}

	client := &http.Client{Timeout: 60 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return nil, fmt.Errorf("cannot execute download request: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("download failed with status %d", resp.StatusCode)
	}

	data, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("cannot read downloaded body: %w", err)
	}

	return data, nil
}

func CheckStone(maybeStone string) (*StoneType, error) {
	stone := StoneType(maybeStone)
	switch stone {
	case StoneQuartz, StoneAmazonite, StoneAgate, StoneRuby, StoneSapphire, StoneTopaz, StoneJade:
		return &stone, nil
	default:
		return nil, fmt.Errorf("invalid stone: '%s'", maybeStone)
	}
}

func CheckBiome(maybeBiome string) (*Biome, error) {
	biome := Biome(maybeBiome)
	switch biome {
	case BiomeAmazonia, BiomeCoralux, BiomePlushland, BiomeCanopica:
		return &biome, nil
	default:
		return nil, fmt.Errorf("invalid biome: '%s'", maybeBiome)
	}
}

func CheckRarity(maybeRarity string) (*Rarity, error) {
	rarity := Rarity(maybeRarity)
	switch rarity {
	case RarityCommon, RarityEpic, RarityLegendary, RarityMythic, RarityRare:
		return &rarity, nil
	default:
		return nil, fmt.Errorf("invalid rarity: '%s'", maybeRarity)
	}
}

func ParseInt(value string, defaultValue, min, max int) int {
	if value == "" {
		return defaultValue
	}

	v, err := strconv.Atoi(value)
	if err != nil {
		return defaultValue
	}

	if v < min {
		return min
	}
	if v > max {
		return max
	}

	return v
}

func ValidateSort(sortBy, defaultSort string) string {

	allowedSorts := map[string]bool{
		"created": true,
		"rarity":  true,
		"biome":   true,
		"name":    true,
	}

	if _, ok := allowedSorts[sortBy]; ok {
		return sortBy
	}

	return defaultSort
}

func ValidateOrder(order, defaultOrder string) string {
	if order == "asc" || order == "desc" {
		return order
	}

	return defaultOrder
}
