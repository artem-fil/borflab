package main

import (
	"bytes"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"regexp"

	"image"
	"image/jpeg"

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

func CheckStone(maybeStone string) (*Stone, error) {
	stone := Stone(maybeStone)
	switch stone {
	case StoneQuartz, StoneTanzanite, StoneAgate, StoneRuby, StoneSapphire, StoneTopaz, StoneJade:
		return &stone, nil
	default:
		return nil, fmt.Errorf("invalid stone: '%s'", maybeStone)
	}
}

func CheckBiome(maybeBiome string) (*Biome, error) {
	biome := Biome(maybeBiome)
	switch biome {
	case BiomeAmazonia, BiomeAquatica, BiomePlushlandia, BiomeCanopica:
		return &biome, nil
	default:
		return nil, fmt.Errorf("invalid biome: '%s'", maybeBiome)
	}
}
