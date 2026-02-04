package main

import (
	"bytes"
	"context"
	"encoding/base64"
	"encoding/binary"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"math"
	"math/rand"
	"mime/multipart"
	"net/http"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/google/uuid"

	"github.com/gagliardetto/solana-go"
	computebudget "github.com/gagliardetto/solana-go/programs/compute-budget"
	"github.com/gagliardetto/solana-go/programs/system"
	"github.com/gagliardetto/solana-go/rpc"
	"github.com/stripe/stripe-go/v81"
	"github.com/stripe/stripe-go/v81/paymentintent"
	"github.com/stripe/stripe-go/v81/webhook"
)

const (
	OPENAI_COMPLETION_URL     = "https://api.openai.com/v1/chat/completions"
	OPENAI_GENERATION_URL     = "https://api.openai.com/v1/images/generations"
	PINATA_PIN_FILE_URL       = "https://api.pinata.cloud/pinning/pinFileToIPFS"
	TOKEN_METADATA_PROGRAM_ID = "metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s"
)

var (
	tasks = sync.Map{}
)

type api struct {
	cfg       *Config
	db        *DB
	telegram  *Telegram
	rpcClient *rpc.Client
	sseAgent  *SSEAgent
}

type mintMonsterForm struct {
	UserPubKey string `json:"userPubKey"`
}

type mintStoneForm struct {
	UserPubKey string `json:"userPubKey"`
}

type swapMonsterForm struct {
	UserPubKey    string `json:"userPubKey"`
	MonsterPubKey string `json:"monsterPubKey"`
}

type createPaymentForm struct {
	ProductId string `json:"productId"`
}

var productsCatalog = map[string]Product{
	"pack10": {
		Id:    "pack10",
		Price: 399,
	},
	"pack25": {
		Id:    "pack25",
		Price: 999,
	},
}

func NewApi(cfg *Config, db *DB, telegram *Telegram, rpcClient *rpc.Client, sseAgent *SSEAgent) *api {

	return &api{cfg, db, telegram, rpcClient, sseAgent}
}

func (a *api) SyncUser(w *Responder, r *http.Request) {

	ctx := r.Context()
	claims, _ := Claims(r)

	user := User{
		PrivyId: claims.Id,
	}

	if maybeEmail, ok := claims.Email(); ok {
		user.Email = maybeEmail
	}
	if maybeWallets, ok := claims.Wallets(); ok {
		user.Wallets = maybeWallets
	}

	syncedUser, isNew, err := a.db.UpsertUser(ctx, &user)
	if err != nil {
		a.DbError(w, err)
		return
	}

	if isNew {

		payload := GeneratePackPayload(10)

		marshalledPayload, err := json.Marshal(payload)
		if err != nil {
			a.InternalError(w, err)
			return
		}

		purchase := &Purchase{
			UserId:   user.PrivyId,
			OrderId:  nil,
			Product:  "pack10",
			Provider: "free",
			Payload:  marshalledPayload,
		}

		if _, err := a.db.InsertPurchase(ctx, purchase); err != nil {
			a.DbError(w, err)
			return
		}
	}

	w.Send(syncedUser)
}

func (a *api) GetStones(w *Responder, r *http.Request) {

	ctx := r.Context()
	claims, _ := Claims(r)

	stones, err := a.db.SelectStoneStats(ctx, claims.Id)
	if err != nil {
		a.DbError(w, err)
		return
	}

	purchases, err := a.db.SelectPurchases(ctx, claims.Id)
	if err != nil {
		a.DbError(w, err)
		return
	}

	response := struct {
		Stones    map[string]int
		Purchases []Purchase
	}{
		Stones:    stones,
		Purchases: purchases,
	}

	w.Send(response)
}

func (a *api) GetMonsters(w *Responder, r *http.Request) {

	ctx := r.Context()
	claims, _ := Claims(r)

	query := r.URL.Query()

	page := ParseInt(query.Get("page"), 1, 1, 1000)
	limit := ParseInt(query.Get("limit"), 10, 1, 9)
	allowedSorts := map[string]bool{
		"created": true,
		"rarity":  true,
		"biome":   true,
		"name":    true,
	}
	sort := query.Get("sort")
	if !allowedSorts[sort] {
		sort = "created"
	}
	order := query.Get("order")
	if order != "asc" && order != "desc" {
		order = "desc"
	}

	offset := (page - 1) * limit

	monsters, total, err := a.db.SelectMonsters(ctx, claims.Id, limit, offset, sort, order)
	if err != nil {
		a.DbError(w, err)
		return
	}

	pages := 0
	if total > 0 {
		pages = (total + limit - 1) / limit
	}
	response := struct {
		Monsters []Monster
		Total    int
		Pages    int
	}{
		Monsters: monsters,
		Total:    total,
		Pages:    pages,
	}
	w.Send(response)
}

func (a *api) GetCounter(w *Responder, r *http.Request) {
	stats, err := a.db.SelectMonsterStats(r.Context())

	if err != nil {
		a.DbError(w, err)
		return
	}

	w.Send(stats)
}

func (a *api) GetProducts(w *Responder, r *http.Request) {

	products := make([]Product, 0, len(productsCatalog))
	for _, p := range productsCatalog {
		products = append(products, p)
	}

	response := struct {
		Products []Product
	}{
		Products: products,
	}

	w.Send(response)
}

func (a *api) OpenPurchase(w *Responder, r *http.Request) {
	claims, _ := Claims(r)
	purchaseId := Param(r)
	parsed, err := strconv.Atoi(purchaseId)
	if err != nil {
		a.BadRequestError(w, errors.New("Invalid purchase Id"))
		return
	}

	purchase, err := a.db.OpenPurchase(r.Context(), parsed, claims.Id)

	if err != nil {
		a.DbError(w, err)
		return
	}

	response := struct {
		Purchase Purchase
	}{
		Purchase: purchase,
	}

	w.Send(response)

}

func (a *api) CreatePayment(w *Responder, r *http.Request) {

	claims, _ := Claims(r)

	form := &createPaymentForm{}
	if err := ParseBody(r, &form); err != nil {
		a.BadRequestError(w, err)
		return
	}

	product, ok := productsCatalog[form.ProductId]
	if !ok {
		a.BadRequestError(w, errors.New("unknown product"))
		return
	}

	orderId := uuid.New()

	stripe.Key = a.cfg.StripePrivateKey
	params := &stripe.PaymentIntentParams{
		Amount:   stripe.Int64(product.Price),
		Currency: stripe.String(string(stripe.CurrencyUSD)),
		AutomaticPaymentMethods: &stripe.PaymentIntentAutomaticPaymentMethodsParams{
			Enabled: stripe.Bool(true),
		},
		Metadata: map[string]string{
			"orderId": orderId.String(),
		},
	}

	pi, err := paymentintent.New(params)
	if err != nil {
		a.InternalError(w, err)
		return
	}

	order := &Order{
		Id:             orderId,
		UserId:         claims.Id,
		Product:        product.Id,
		Price:          int(product.Price),
		StripeIntentId: pi.ID,
	}

	err = a.db.InsertOrder(r.Context(), order)

	if err != nil {
		a.DbError(w, err)
		return
	}

	response := struct {
		OrderId      string
		ClientSecret string
	}{
		OrderId:      orderId.String(),
		ClientSecret: pi.ClientSecret,
	}

	w.Send(response)
}

func (a *api) StripeWebhook(w http.ResponseWriter, r *http.Request) {
	const MaxBodyBytes = int64(65536)
	r.Body = http.MaxBytesReader(w, r.Body, MaxBodyBytes)

	payload, err := io.ReadAll(r.Body)
	if err != nil {
		w.WriteHeader(http.StatusServiceUnavailable)
		return
	}

	sigHeader := r.Header.Get("Stripe-Signature")
	event, err := webhook.ConstructEvent(payload, sigHeader, a.cfg.StripeSecret)
	if err != nil {
		w.WriteHeader(http.StatusBadRequest)
		return
	}

	switch event.Type {
	case "payment_intent.succeeded":
		var pi stripe.PaymentIntent
		if err := json.Unmarshal(event.Data.Raw, &pi); err != nil {
			LogError("API", "cannot unmarshall payment intent", err)
			w.WriteHeader(http.StatusBadRequest)
			return
		}
		orderId := uuid.MustParse(pi.Metadata["orderId"])

		order, err := a.db.UpdateOrder(r.Context(), orderId.String(), "paid")
		if err != nil {
			LogError("API", "cannot update order", err)
			w.WriteHeader(http.StatusOK)
			return
		}

		total := map[string]int{"pack10": 10, "pack25": 25}[order.Product]
		payload := GeneratePackPayload(total)

		marshalledPayload, err := json.Marshal(payload)
		if err != nil {
			LogError("API", "cannot update order", err)
			a.sseAgent.Emit(orderId.String(), "failed", map[string]any{"error": "cannot finish purchase"})
			w.WriteHeader(http.StatusOK)
			return
		}

		purchase := &Purchase{
			UserId:   order.UserId,
			OrderId:  &orderId,
			Product:  order.Product,
			Provider: "stripe",
			Payload:  marshalledPayload,
		}

		inserted, err := a.db.InsertPurchase(r.Context(), purchase)

		if err != nil {
			LogError("API", "cannot create purchase", err)
			a.sseAgent.Emit(orderId.String(), "failed", map[string]any{"error": "cannot finish purchase"})
		}

		a.sseAgent.Emit(
			orderId.String(),
			"confirmed",
			map[string]any{"status": "paid", "purchase": inserted},
		)

	case "payment_intent.payment_failed":
		var pi stripe.PaymentIntent
		if err := json.Unmarshal(event.Data.Raw, &pi); err != nil {
			w.WriteHeader(http.StatusBadRequest)
			return
		}

		orderId := pi.Metadata["orderId"]
		errorMessage := "payment failed"
		if pi.LastPaymentError != nil {
			errorMessage = pi.LastPaymentError.Msg
		}

		_, err = a.db.UpdateOrder(r.Context(), orderId, "failed")
		if err != nil {
			w.WriteHeader(http.StatusBadRequest)
			return
		}

		a.sseAgent.Emit(orderId, "failed", map[string]any{"error": errorMessage})
	}

	w.WriteHeader(http.StatusOK)
}

func (a *api) AnalyzeSpecimen(w *Responder, r *http.Request) {

	taskID := uuid.NewString()

	tasks.Store(taskID, &TaskStatus{
		Progress: 0,
		Done:     false,
	})

	time.AfterFunc(5*time.Minute, func() {
		tasks.Delete(taskID)
	})

	ctx := r.Context()
	claims, _ := Claims(r)

	selectedStone, err := a.db.SelectStone(ctx, r.FormValue("stone"), claims.Id)

	if err != nil {
		a.DbError(w, fmt.Errorf("cannot select stone %v", err))
		return
	}

	biome, err := CheckBiome(r.FormValue("biome"))
	if err != nil || biome == nil {
		a.BadRequestError(w, err)
		return
	}

	imgFile, _, err := r.FormFile("file")
	if err != nil {
		a.InternalError(w, err)
		return
	}
	defer imgFile.Close()

	imgBytes, err := io.ReadAll(imgFile)
	if err != nil {
		a.InternalError(w, err)
		return
	}

	// input metadata
	inputMime, inputWidth, inputHeight, inputSize, err := imageInfo(imgBytes)
	if err != nil {
		a.InternalError(w, err)
		return
	}

	resizedImg, err := resizeAndConvert(bytes.NewReader(imgBytes), 2000)
	if err != nil {
		a.InternalError(w, err)
		return
	}

	// processed metadata
	processedMime, processedWidth, processedHeight, processedSize, err := imageInfo(resizedImg)
	if err != nil {
		a.InternalError(w, err)
		return
	}

	experiment := &Experiment{
		UserId:          claims.Id,
		InputMime:       inputMime,
		InputWidth:      inputWidth,
		InputHeight:     inputHeight,
		InputSize:       inputSize,
		ProcessedMime:   processedMime,
		ProcessedWidth:  processedWidth,
		ProcessedHeight: processedHeight,
		ProcessedSize:   processedSize,
		ProcessedImage:  resizedImg,
		Stone:           StoneType(selectedStone.Type),
		Biome:           *biome,
		Created:         time.Now().UTC(),
	}
	insertedExperiment, err := a.db.InsertExperiment(r.Context(), experiment)
	if err != nil {
		a.DbError(w, fmt.Errorf("cannot insert experiment %v", err))
		return
	}

	go a.processImage(taskID, resizedImg, insertedExperiment)

	response := struct {
		Id string
	}{
		Id: taskID,
	}
	w.Send(response)
}

func (a *api) processImage(taskId string, imgBytes []byte, experiment *Experiment) {
	ctx, cancel := context.WithTimeout(context.Background(), time.Minute)
	defer cancel()

	ts := &TaskStatus{
		Progress: 0,
		Done:     false,
	}
	tasks.Store(taskId, ts)

	time.AfterFunc(5*time.Minute, func() {
		tasks.Delete(taskId)
	})

	fail := func(msg string, err error) {
		LogError("API", msg, err)
		cancel()
		a.sseAgent.Emit(taskId, "failed", map[string]any{"error": msg})
		ts.Progress = 100
		ts.Done = true
	}
	go a.simulateProgress(ctx, 1, 99, 20*time.Second, func(progress int) {
		ts.Progress = progress
		a.sseAgent.Emit(taskId, "progress", map[string]any{"progress": progress})
	})
	prompt := fmt.Sprintf(Prompts.PromptAnalyze[experiment.Biome], Prompts.PromptStone[experiment.Stone])
	requestBody := map[string]any{
		"model": "gpt-4o",
		"messages": []map[string]any{
			{
				"role": "system",
				"content": []any{
					map[string]any{
						"type": "text",
						"text": prompt,
					},
				},
			},
			{
				"role": "user",
				"content": []any{
					map[string]any{
						"type": "text",
						"text": "Here's an image",
					},
					map[string]any{
						"type": "image_url",
						"image_url": map[string]any{
							"url": "data:image/jpeg;base64," + encodeToBase64(imgBytes),
						},
					},
				},
			},
		},
		"max_tokens": 1000,
	}
	bodyBytes, err := json.Marshal(requestBody)
	if err != nil {
		fail("cannot marshal json", err)
		return
	}

	req, err := http.NewRequestWithContext(
		ctx,
		http.MethodPost,
		OPENAI_COMPLETION_URL,
		bytes.NewReader(bodyBytes),
	)
	if err != nil {
		fail("cannot create request", err)
		return
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+a.cfg.OpenAIToken)

	client := &http.Client{
		Timeout: 60 * time.Second,
	}

	resp, err := client.Do(req)

	if err != nil {
		fail("cannot make external request", err)
		return
	}
	defer resp.Body.Close()

	respBody, err := io.ReadAll(resp.Body)
	if err != nil {
		fail("cannot read OpenAI response body", err)
		return
	}

	if resp.StatusCode != http.StatusOK {
		fail(fmt.Sprintf("OpenAI API refused: %d", resp.StatusCode), nil)
		return
	}
	var rawResp struct {
		Choices []struct {
			Message struct {
				Content string `json:"content"`
			} `json:"message"`
		} `json:"choices"`
	}
	if err := json.Unmarshal(respBody, &rawResp); err != nil || len(rawResp.Choices) == 0 {
		fail("invalid OpenAI response", err)
		return
	}
	content := rawResp.Choices[0].Message.Content
	sanitizedJson, err := sanitizeJSON(content)
	if err != nil {
		fail(content, err)
		return
	}

	var parsed map[string]any
	if err := json.Unmarshal(sanitizedJson, &parsed); err != nil {
		fail("invalid JSON result", err)
		return
	}

	if maybeError, hasError := parsed["Error"]; hasError {
		fail(fmt.Sprint(maybeError), nil)
		return
	}

	analyzed := time.Now().UTC()
	experiment.Specimen = sanitizedJson
	experiment.Analyzed = &analyzed

	if _, err := a.db.AnalyzeExperiment(context.Background(), experiment); err != nil {
		fail("cannot continue experiment", err)
		return
	}

	nextTaskId := uuid.NewString()
	tasks.Store(nextTaskId, &TaskStatus{Progress: 0, Done: false})

	go a.generateImage(nextTaskId, parsed, *experiment)

	ts.Progress = 100
	ts.Done = true
	ts.Result = parsed
	ts.NextTaskId = nextTaskId
	a.sseAgent.Emit(taskId, "done", map[string]any{
		"result":   parsed,
		"nextTask": nextTaskId,
	})
}

func (a *api) simulateProgress(
	ctx context.Context,
	from, to int,
	duration time.Duration,
	onProgress func(progress int),
) {
	const tickInterval = 1 * time.Second

	ticks := int(duration / tickInterval)
	if ticks <= 0 {
		ticks = 1
	}

	total := to - from
	baseStep := float64(total) / float64(ticks)

	const variance = 5

	r := rand.New(rand.NewSource(time.Now().UnixNano()))
	ticker := time.NewTicker(tickInterval)
	defer ticker.Stop()

	current := from

	for i := 0; i < ticks; i++ {
		select {
		case <-ctx.Done():
			return

		case <-ticker.C:
			remaining := to - current
			if remaining <= 0 {
				return
			}

			jitter := (r.Float64()*2 - 1) * variance

			step := int(math.Round(baseStep + jitter))

			if step < 1 {
				step = 1
			}

			if step > remaining {
				step = remaining
			}

			current += step
			onProgress(current)
		}
	}
}

func (a *api) generateImage(taskId string, specimen map[string]any, experiment Experiment) {
	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Minute)
	defer cancel()

	ts := &TaskStatus{
		Progress: 0,
		Done:     false,
	}
	tasks.Store(taskId, ts)

	var cancelProgress context.CancelFunc = func() {}

	fail := func(msg string, err error) {
		LogError("API", msg, err)
		cancelProgress()
		cancel()
		a.sseAgent.Emit(taskId, "failed", map[string]any{"error": msg})
		ts.Progress = 100
		ts.Done = true
	}

	progressCtx, progressCancel := context.WithCancel(ctx)
	cancelProgress = progressCancel

	go a.simulateProgress(progressCtx, 1, 75, 40*time.Second, func(progress int) {
		ts.Progress = progress
		a.sseAgent.Emit(taskId, "progress", map[string]any{"progress": progress})
	})

	renderDirective, ok := specimen["RENDER_DIRECTIVE"]
	profile, ok2 := specimen["MONSTER_PROFILE"].(map[string]any)
	if !ok || !ok2 {
		fail("cannot parse specimen", fmt.Errorf("invalid specimen format"))
		return
	}

	getProfileField := func(profile map[string]any, key string) string {
		if value, ok := profile[key].(string); ok && value != "" {
			return value
		}

		fallbacks := map[string]string{
			"name":           "Unnamed Creature",
			"species":        "Mysterious Species",
			"lore":           "Its origins are lost to time",
			"movement_class": "Unknown Locomotion",
			"behaviour":      "Behavior undocumented",
			"personality":    "Enigmatic",
			"abilities":      "Abilities yet to be discovered",
			"habitat":        "Habitat unknown",
		}

		if fallback, ok := fallbacks[key]; ok {
			return fallback
		}
		return "Not specified"
	}

	name := getProfileField(profile, "name")
	species := getProfileField(profile, "species")
	lore := getProfileField(profile, "lore")
	movementClass := getProfileField(profile, "movement_class")
	behaviour := getProfileField(profile, "behaviour")
	personality := getProfileField(profile, "personality")
	abilities := getProfileField(profile, "abilities")
	habitat := getProfileField(profile, "habitat")

	prompt := fmt.Sprintf("%s. %s", renderDirective, Prompts.PromptGeneration[experiment.Biome])

	requestBody := map[string]any{
		"model":      "gpt-image-1.5",
		"n":          1,
		"size":       "1024x1024",
		"quality":    "medium",
		"prompt":     prompt,
		"moderation": "low",
	}

	bodyBytes, err := json.Marshal(requestBody)
	if err != nil {
		fail("cannot marshal json", err)
		return
	}

	req, err := http.NewRequestWithContext(
		ctx,
		http.MethodPost,
		OPENAI_GENERATION_URL,
		bytes.NewReader(bodyBytes),
	)
	if err != nil {
		fail("cannot create request", err)
		return
	}

	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+a.cfg.OpenAIToken)

	client := &http.Client{
		Timeout: 60 * time.Second,
	}

	resp, err := client.Do(req)
	if err != nil {
		fail("cannot make external request", err)
		return
	}
	defer resp.Body.Close()

	respBody, err := io.ReadAll(resp.Body)
	if err != nil || resp.StatusCode != http.StatusOK {
		fail("OpenAI generation failed", err)
		return
	}

	var parsed struct {
		Data []struct {
			B64JSON string `json:"b64_json"`
		} `json:"data"`
	}

	if err := json.Unmarshal(respBody, &parsed); err != nil || len(parsed.Data) == 0 {
		fail("invalid OpenAI image response", err)
		return
	}

	base64Image := parsed.Data[0].B64JSON
	generated := time.Now().UTC()

	cancelProgress()

	progressCtx, progressCancel = context.WithCancel(ctx)
	cancelProgress = progressCancel

	go a.simulateProgress(progressCtx, 76, 99, 15*time.Second, func(progress int) {
		ts.Progress = progress
		a.sseAgent.Emit(taskId, "progress", map[string]any{"progress": progress})
	})

	imageCid, err := uploadImageToPinata(a.cfg.Pinata.PinataToken, base64Image, name)
	if err != nil {
		fail("cannot upload image to ipfs", err)
		return
	}

	stats, err := a.db.SelectRarities(context.Background())
	if err != nil {
		fail("cannot select rarities", err)
		return
	}

	experiment.Rarity = stats.PickRarity(StoneAmazonite)

	metadataBody := map[string]any{
		"name":                    name,
		"symbol":                  "MON",
		"description":             "d",
		"image":                   fmt.Sprintf("ipfs://%s", imageCid),
		"external_url":            "https://borflab.com/cards",
		"seller_fee_basis_points": 0,
		"attributes": []any{
			map[string]string{
				"trait_type": "Biome",
				"value":      string(experiment.Biome),
			},
			map[string]string{
				"trait_type": "Rarity",
				"value":      string(experiment.Rarity),
			},
			map[string]string{
				"trait_type": "Stone",
				"value":      string(experiment.Stone),
			},
		},
		"properties": map[string]any{
			"category": "image",
			"files": []map[string]any{
				{
					"uri":  fmt.Sprintf("ipfs://%s", imageCid),
					"type": "image/png",
				},
			},
			"creators": []map[string]any{
				{
					"address":  "dghfghgfh",
					"share":    100,
					"verified": true,
				},
			},
			"species":        species,
			"lore":           lore,
			"movement_class": movementClass,
			"behaviour":      behaviour,
			"personality":    personality,
			"abilities":      abilities,
			"habitat":        habitat,
		},
	}

	metadataCid, err := uploadMetadataToPinata(a.cfg.Pinata.PinataToken, metadataBody)
	if err != nil {
		fail("cannot upload metadata", err)
		return
	}

	metadata, err := json.Marshal(metadataBody)
	if err != nil {
		fail("cannot marshal metadata", err)
		return
	}

	uploaded := time.Now().UTC()
	experiment.ImageCID = imageCid
	experiment.MetadataCID = metadataCid
	experiment.Metadata = metadata
	experiment.Generated = &generated
	experiment.Uploaded = &uploaded

	if _, err := a.db.FinishExperiment(context.Background(), &experiment); err != nil {
		fail("cannot update experiment", err)
		return
	}

	ts.Progress = 100
	ts.Done = true
	ts.Result = struct {
		Image        string `json:"image"`
		ExperimentId int    `json:"experimentId"`
	}{
		Image:        base64Image,
		ExperimentId: experiment.Id,
	}

	a.sseAgent.Emit(taskId, "done", map[string]any{
		"image":        base64Image,
		"experimentId": experiment.Id,
	})
}

func (a *api) PrepareMonsterMint(w *Responder, r *http.Request) {

	ctx := r.Context()
	claims, _ := Claims(r)
	experimentId := Param(r)

	form := &mintMonsterForm{}
	if err := ParseBody(r, &form); err != nil {
		a.BadRequestError(w, err)
		return
	}

	experiment, err := a.db.SelectExperiment(ctx, experimentId)
	if err != nil {
		a.DbError(w, fmt.Errorf("cannot select experiment %v", err))
		return
	}

	var parsed map[string]any

	if err := json.Unmarshal(experiment.Specimen, &parsed); err != nil {
		a.InternalError(w, fmt.Errorf("cannot unmarshal specimen: %v", err))
		return
	}

	uri := fmt.Sprintf("ipfs://%s", experiment.MetadataCID)
	user_id := 12345
	experiment_id := experiment.Id

	selectedStone, err := a.db.SelectSuitableStone(ctx, string(experiment.Stone), claims.Id)
	if err != nil {
		a.DbError(w, fmt.Errorf("cannot select experiment %v", err))
		return
	}
	programId := solana.MustPublicKeyFromBase58(a.cfg.Solana.ProgramId)
	userPubKey := solana.MustPublicKeyFromBase58(form.UserPubKey)
	cardCollectionPubKey := solana.MustPublicKeyFromBase58(a.cfg.Solana.CardCollectionPubKey)
	tokenMetadataProgramId := solana.MustPublicKeyFromBase58(TOKEN_METADATA_PROGRAM_ID)

	cardMintAdminPda, _, _ := solana.FindProgramAddress([][]byte{[]byte("card_mint_admin")}, programId)
	collectionAuthorityPda, _, _ := solana.FindProgramAddress([][]byte{[]byte("collection_authority")}, programId)

	adminPrivateKey := solana.PrivateKey(a.cfg.Solana.SecretKey)
	if err := adminPrivateKey.Validate(); err != nil {
		a.InternalError(w, fmt.Errorf("invalid admin key"))
		return
	}
	// 3. Admin verification
	adminAccount, err := a.rpcClient.GetAccountInfoWithOpts(
		ctx,
		cardMintAdminPda,
		&rpc.GetAccountInfoOpts{
			Commitment: rpc.CommitmentConfirmed,
		},
	)
	if err != nil {
		a.InternalError(w, fmt.Errorf("cannot get admin account: %v", err))
		return
	}

	if adminAccount == nil || adminAccount.Value == nil || len(adminAccount.Value.Data.GetBinary()) < 32 {
		a.InternalError(w, fmt.Errorf("cannot validate admin account: %v", err))
		return
	}

	registeredAdmin := solana.PublicKeyFromBytes(adminAccount.GetBinary()[8:40])

	if !registeredAdmin.Equals(adminPrivateKey.PublicKey()) {
		a.InternalError(w, fmt.Errorf("unauthorized admin keypair"))
		return
	}

	mint := solana.NewWallet()
	mintPubKey := mint.PublicKey()
	userNftPda, _, _ := solana.FindProgramAddress(
		[][]byte{[]byte("user_nft"), userPubKey.Bytes(), mintPubKey.Bytes()},
		programId,
	)

	metadata, _, _ := solana.FindProgramAddress(
		[][]byte{[]byte("metadata"), tokenMetadataProgramId.Bytes(), mintPubKey.Bytes()},
		tokenMetadataProgramId,
	)
	masterEdition, _, _ := solana.FindProgramAddress(
		[][]byte{[]byte("metadata"), tokenMetadataProgramId.Bytes(), mintPubKey.Bytes(), []byte("edition")},
		tokenMetadataProgramId,
	)

	collectionMetadata, _, _ := solana.FindProgramAddress(
		[][]byte{[]byte("metadata"), tokenMetadataProgramId.Bytes(), cardCollectionPubKey.Bytes()},
		tokenMetadataProgramId,
	)
	collectionMasterEdition, _, _ := solana.FindProgramAddress(
		[][]byte{[]byte("metadata"), tokenMetadataProgramId.Bytes(), cardCollectionPubKey.Bytes(), []byte("edition")},
		tokenMetadataProgramId,
	)

	borflabVaultPda, _, _ := solana.FindProgramAddress([][]byte{[]byte("borflab_vault")}, programId)
	borflabVaultAta, _, _ := solana.FindAssociatedTokenAddress(borflabVaultPda, mintPubKey)

	mintRent, err := a.rpcClient.GetMinimumBalanceForRentExemption(ctx, 82, rpc.CommitmentConfirmed)
	if err != nil {
		a.InternalError(w, err)
		return
	}

	var mintCardIx solana.Instruction

	switch selectedStone.Origin {
	case "crypto":
		{
			cardTypePda, _, err := solana.FindProgramAddress(
				[][]byte{[]byte("card_type")},
				programId,
			)
			if selectedStone.MintAddress == nil {
				a.InternalError(w, fmt.Errorf("selected stone has no mint address %v", selectedStone.Type))
				return
			}
			stonePubKey, err := solana.PublicKeyFromBase58(*selectedStone.MintAddress)
			if err != nil {
				a.InternalError(w, fmt.Errorf("cannot encode public key: %v", err))
				return
			}
			stoneStatePda, _, err := solana.FindProgramAddress(
				[][]byte{[]byte("stone_state"), stonePubKey.Bytes()},
				programId,
			)
			if err != nil {
				a.InternalError(w, fmt.Errorf("cannot find PDA: %v", err))
				return
			}
			// Stone state verification
			stoneStateAccount, err := a.rpcClient.GetAccountInfoWithOpts(
				ctx,
				stoneStatePda,
				&rpc.GetAccountInfoOpts{
					Commitment: rpc.CommitmentConfirmed,
				},
			)
			if err != nil {
				a.InternalError(w, fmt.Errorf("cannot get stone state account: %v", err))
				return
			}
			if stoneStateAccount == nil || stoneStateAccount.Value == nil {
				a.InternalError(w, fmt.Errorf("cannot validate stone state account: %v", err))
				return
			}
			stoneState := stoneStateAccount.Value.Data.GetBinary()
			if len(stoneState) < 2 {
				a.InternalError(w, fmt.Errorf("stone state data too short"))
				return
			}
			sparksRemaining := binary.LittleEndian.Uint16(stoneState[32:34])
			if sparksRemaining <= 0 {
				a.BadRequestError(w, fmt.Errorf("selected stone has no sparks"))
				return
			}

			// 5. Card verification
			cardTypeAccount, err := a.rpcClient.GetAccountInfoWithOpts(
				ctx,
				cardTypePda,
				&rpc.GetAccountInfoOpts{
					Commitment: rpc.CommitmentConfirmed,
				},
			)
			if err != nil {
				a.InternalError(w, fmt.Errorf("cannot get card type account: %v", err))
				return
			}

			if cardTypeAccount == nil || cardTypeAccount.Value == nil {
				a.InternalError(w, fmt.Errorf("cannot validate card type account: %v", err))
				return
			}
			cardTypeData := cardTypeAccount.Value.Data.GetBinary()
			if len(cardTypeData) < 8 {
				a.InternalError(w, fmt.Errorf("card type too short"))
				return
			}

			mintedCount := binary.LittleEndian.Uint32(cardTypeData[0:4])
			supplyCap := binary.LittleEndian.Uint32(cardTypeData[4:8])

			if mintedCount >= supplyCap {
				a.BadRequestError(w, fmt.Errorf("card supply cap reached"))
				return
			}

			cardStatePda, _, err := solana.FindProgramAddress(
				[][]byte{[]byte("card_state"), mintPubKey.Bytes()},
				programId,
			)
			if err != nil {
				a.InternalError(w, fmt.Errorf("cannot find PDA: %v", err))
				return
			}

			// 7. Find ATAs

			stoneUserNftPda, _, err := solana.FindProgramAddress(
				[][]byte{[]byte("user_nft"), userPubKey.Bytes(), stonePubKey.Bytes()},
				programId,
			)
			if err != nil {
				a.InternalError(w, fmt.Errorf("cannot find stone nft PDA: %v", err))
				return
			}

			mintCardIx = solana.NewInstruction(
				programId,
				[]*solana.AccountMeta{
					solana.NewAccountMeta(mintPubKey, true, true),                                  // 0. mint (writable: true)
					solana.NewAccountMeta(userPubKey, true, false),                                 // 1. owner (writable: true, signer: true)
					solana.NewAccountMeta(borflabVaultPda, true, false),                            // 2. borflab_vault (writable: true)
					solana.NewAccountMeta(borflabVaultAta, true, false),                            // 3. borflab_vault_ata (writable: true)
					solana.NewAccountMeta(adminPrivateKey.PublicKey(), false, true),                // 4. authority (signer: true)
					solana.NewAccountMeta(cardMintAdminPda, false, false),                          // 5. card_mint_admin
					solana.NewAccountMeta(stonePubKey, false, false),                               // 6. stone_mint
					solana.NewAccountMeta(stoneUserNftPda, false, false),                           // 7. stone_user_nft (PDA ["user_nft", owner, stone_mint])
					solana.NewAccountMeta(stoneStatePda, true, false),                              // 8. stone_state (writable: true)
					solana.NewAccountMeta(cardTypePda, true, false),                                // 9. card_type (writable: true)
					solana.NewAccountMeta(cardStatePda, true, false),                               // 10. card_state (writable: true)
					solana.NewAccountMeta(userNftPda, true, false),                                 // 11. user_nft (writable: true, PDA ["user_nft", owner, mint])
					solana.NewAccountMeta(cardCollectionPubKey, false, false),                      // 12. collection_mint
					solana.NewAccountMeta(collectionMetadata, true, false),                         // 13. collection_metadata (writable: true)
					solana.NewAccountMeta(collectionMasterEdition, true, false),                    // 14. collection_master_edition (writable: true)
					solana.NewAccountMeta(metadata, true, false),                                   // 15. metadata (writable: true)
					solana.NewAccountMeta(masterEdition, true, false),                              // 16. master_edition (writable: true)
					solana.NewAccountMeta(collectionAuthorityPda, true, false),                     // 17. collection_authority (writable: true)
					solana.NewAccountMeta(solana.TokenProgramID, false, false),                     // 18. token_program
					solana.NewAccountMeta(solana.SPLAssociatedTokenAccountProgramID, false, false), // 19. associated_token_program
					solana.NewAccountMeta(solana.SystemProgramID, false, false),                    // 20. system_program
					solana.NewAccountMeta(tokenMetadataProgramId, false, false),                    // 21. token_metadata_program
					solana.NewAccountMeta(solana.SysVarRentPubkey, false, false),                   // 22. rent
				},
				encodeMintCardInstructionData(uri, user_id, experiment_id),
			)

		}
	case "fiat":
		{
			cardTypePda, _, _ := solana.FindProgramAddress([][]byte{[]byte("spark_card_type")}, programId)
			sparkCardStatePda, _, _ := solana.FindProgramAddress(
				[][]byte{[]byte("spark_card_state"), mintPubKey.Bytes()},
				programId,
			)

			mintCardIx = solana.NewInstruction(
				programId,
				[]*solana.AccountMeta{
					solana.NewAccountMeta(mintPubKey, true, true),                                  // 0. mint
					solana.NewAccountMeta(userPubKey, true, false),                                 // 1. owner
					solana.NewAccountMeta(borflabVaultPda, true, false),                            // 2. borflab_vault
					solana.NewAccountMeta(borflabVaultAta, true, false),                            // 3. borflab_vault_ata
					solana.NewAccountMeta(adminPrivateKey.PublicKey(), false, true),                // 4. authority (signer)
					solana.NewAccountMeta(cardMintAdminPda, false, false),                          // 5. card_mint_admin
					solana.NewAccountMeta(cardTypePda, true, false),                                // 6. spark_card_type
					solana.NewAccountMeta(sparkCardStatePda, true, false),                          // 7. spark_card_state
					solana.NewAccountMeta(userNftPda, true, false),                                 // 8. user_nft
					solana.NewAccountMeta(cardCollectionPubKey, false, false),                      // 9. collection_mint
					solana.NewAccountMeta(collectionMetadata, true, false),                         // 10. collection_metadata
					solana.NewAccountMeta(collectionMasterEdition, true, false),                    // 11. collection_master_edition
					solana.NewAccountMeta(metadata, true, false),                                   // 12. metadata
					solana.NewAccountMeta(masterEdition, true, false),                              // 13. master_edition
					solana.NewAccountMeta(collectionAuthorityPda, true, false),                     // 14. collection_authority
					solana.NewAccountMeta(solana.TokenProgramID, false, false),                     // 15. token_program
					solana.NewAccountMeta(solana.SPLAssociatedTokenAccountProgramID, false, false), // 16. associated_token_program
					solana.NewAccountMeta(solana.SystemProgramID, false, false),                    // 17. system_program
					solana.NewAccountMeta(tokenMetadataProgramId, false, false),                    // 18. token_metadata_program
					solana.NewAccountMeta(solana.SysVarRentPubkey, false, false),                   // 19. rent
				},
				encodeMintSparkCardInstanceData(uri, user_id, experiment_id),
			)
		}
	default:
		{
			a.BadRequestError(w, fmt.Errorf("stone not found"))
			return
		}
	}

	createMintAccountIx := system.NewCreateAccountInstruction(
		mintRent,
		82,
		solana.TokenProgramID,
		userPubKey,
		mintPubKey,
	).Build()

	computeBudgetIx := computebudget.NewSetComputeUnitLimitInstruction(400000).Build()

	recent, err := a.rpcClient.GetLatestBlockhash(ctx, rpc.CommitmentFinalized)
	if err != nil {
		a.InternalError(w, fmt.Errorf("cannot get latest blockhash: %v", err))
		return
	}

	instructions := []solana.Instruction{
		computeBudgetIx,
		createMintAccountIx,
		mintCardIx,
	}

	tx, err := solana.NewTransaction(
		instructions,
		recent.Value.Blockhash,
		solana.TransactionPayer(adminPrivateKey.PublicKey()),
	)
	if err != nil {
		a.InternalError(w, fmt.Errorf("cannot create transaction: %v", err))
		return
	}

	_, err = tx.Sign(func(key solana.PublicKey) *solana.PrivateKey {
		if key.Equals(adminPrivateKey.PublicKey()) {
			return &adminPrivateKey
		}
		return nil
	})
	if err != nil {
		a.InternalError(w, fmt.Errorf("cannot sign transaction: %v", err))
		return
	}

	sig, err := a.rpcClient.SendTransaction(ctx, tx)
	if err != nil {
		a.InternalError(w, fmt.Errorf("failed to send transaction: %v", err))
		return
	}

	LogInfo("API", fmt.Sprintf("Transaction sent: %s", sig.String()))

	response := struct {
		Signature string `json:"signature"`
	}{
		Signature: sig.String(),
	}

	w.Send(response)

}

func (a *api) PrepareStoneMint(w *Responder, r *http.Request) {

	form := &mintStoneForm{}
	if err := ParseBody(r, &form); err != nil {
		a.BadRequestError(w, err)
		return
	}
	user_id := 12345
	// === SOLANA logic ===

	// 1. Prepare keys
	ctx := context.Background()
	programId, err := solana.PublicKeyFromBase58(a.cfg.Solana.ProgramId)
	if err != nil {
		a.InternalError(w, fmt.Errorf("cannot encode public key: %v", err))
		return
	}
	userPubKey, err := solana.PublicKeyFromBase58(form.UserPubKey)
	if err != nil {
		a.InternalError(w, fmt.Errorf("invalid wallet public key: %v", err))
		return
	}
	stoneCollectionPubKey, err := solana.PublicKeyFromBase58(a.cfg.Solana.StoneCollectionPubKey)
	if err != nil {
		a.InternalError(w, fmt.Errorf("cannot encode public key: %v", err))
		return
	}
	tokenMetadataProgramId, err := solana.PublicKeyFromBase58(TOKEN_METADATA_PROGRAM_ID)
	if err != nil {
		a.InternalError(w, fmt.Errorf("cannot encode public key: %v", err))
		return
	}

	// 2. Find PDAs

	collectionAuthorityPda, _, err := solana.FindProgramAddress(
		[][]byte{[]byte("collection_authority")},
		programId,
	)
	if err != nil {
		a.InternalError(w, fmt.Errorf("cannot find PDA: %v", err))
		return
	}
	treasury, _, err := solana.FindProgramAddress(
		[][]byte{[]byte("treasury")},
		programId,
	)
	if err != nil {
		a.InternalError(w, fmt.Errorf("cannot find PDA: %v", err))
		return
	}

	// 6. Generate new mint
	mint := solana.NewWallet()
	mintPubKey := mint.PublicKey()

	stoneStatePda, _, err := solana.FindProgramAddress(
		[][]byte{[]byte("stone_state"), mintPubKey.Bytes()},
		programId,
	)
	if err != nil {
		a.InternalError(w, fmt.Errorf("cannot find PDA: %v", err))
		return
	}

	// 7. Find ATAs

	borflabVaultPda, _, err := solana.FindProgramAddress(
		[][]byte{[]byte("borflab_vault")},
		programId,
	)
	if err != nil {
		a.InternalError(w, fmt.Errorf("cannot find borflab_vault PDA: %v", err))
		return
	}

	borflabVaultAta, _, err := solana.FindAssociatedTokenAddress(
		borflabVaultPda,
		mintPubKey,
	)
	if err != nil {
		a.InternalError(w, fmt.Errorf("cannot find borflab_vault ATA: %v", err))
		return
	}

	userNftPda, _, err := solana.FindProgramAddress(
		[][]byte{
			[]byte("user_nft"),
			userPubKey.Bytes(),
			mintPubKey.Bytes(),
		},
		programId,
	)
	if err != nil {
		a.InternalError(w, fmt.Errorf("cannot find user_nft PDA: %v", err))
		return
	}

	// 8. Find metaplex PDAs
	metadata, _, err := solana.FindProgramAddress(
		[][]byte{
			[]byte("metadata"),
			tokenMetadataProgramId.Bytes(),
			mintPubKey.Bytes(),
		},
		tokenMetadataProgramId,
	)
	if err != nil {
		a.InternalError(w, fmt.Errorf("cannot find PDA: %v", err))
		return
	}

	masterEdition, _, err := solana.FindProgramAddress(
		[][]byte{
			[]byte("metadata"),
			tokenMetadataProgramId.Bytes(),
			mintPubKey.Bytes(),
			[]byte("edition"),
		},
		tokenMetadataProgramId,
	)
	if err != nil {
		a.InternalError(w, fmt.Errorf("cannot find PDA: %v", err))
		return
	}

	collectionMetadata, _, err := solana.FindProgramAddress(
		[][]byte{
			[]byte("metadata"),
			tokenMetadataProgramId.Bytes(),
			stoneCollectionPubKey.Bytes()},
		tokenMetadataProgramId,
	)
	if err != nil {
		a.InternalError(w, fmt.Errorf("cannot find PDA: %v", err))
		return
	}

	collectionMasterEdition, _, err := solana.FindProgramAddress(
		[][]byte{
			[]byte("metadata"),
			tokenMetadataProgramId.Bytes(),
			stoneCollectionPubKey.Bytes(),
			[]byte("edition"),
		},
		tokenMetadataProgramId,
	)
	if err != nil {
		a.InternalError(w, fmt.Errorf("cannot find PDA: %v", err))
		return
	}

	mintRent, err := a.rpcClient.GetMinimumBalanceForRentExemption(
		ctx,
		82,
		rpc.CommitmentConfirmed,
	)
	if err != nil {
		a.InternalError(w, fmt.Errorf("cannot get mint rent: %v", err))
		return
	}

	createMintAccountIx := system.NewCreateAccountInstruction(
		mintRent,
		82,
		solana.TokenProgramID,
		userPubKey,
		mintPubKey,
	).Build()

	stoneTypes := []string{"Quartz", "Amazonite", "Ruby", "Agate", "Sapphire", "Topaz", "Jade"}
	stoneTypePdas := []solana.PublicKey{}
	for _, t := range stoneTypes {
		pda, _, err := solana.FindProgramAddress(
			[][]byte{
				[]byte("stone_type"),
				[]byte(t),
			},
			programId,
		)
		if err != nil {
			a.InternalError(w, fmt.Errorf("cannot find PDA for stone type %s: %v", t, err))
			return
		}
		stoneTypePdas = append(stoneTypePdas, pda)
	}

	accounts := []*solana.AccountMeta{
		// 1. mint (writable: true)
		solana.NewAccountMeta(mintPubKey, true, true),
		// 2. owner (writable: true, signer: true)
		solana.NewAccountMeta(userPubKey, true, true),
		// 3. borflab_vault (writable: true)
		solana.NewAccountMeta(borflabVaultPda, true, false),
		// 4. borflab_vault_ata (writable: true)
		solana.NewAccountMeta(borflabVaultAta, true, false),
		// 5. stone_state (writable: true)
		solana.NewAccountMeta(stoneStatePda, true, false),
		// 6. user_nft (writable: true)
		solana.NewAccountMeta(userNftPda, true, false),
		// 7. collection_mint (writable: false)
		solana.NewAccountMeta(stoneCollectionPubKey, false, false),
		// 8. collection_metadata (writable: true)
		solana.NewAccountMeta(collectionMetadata, true, false),
		// 9. collection_master_edition (writable: true)
		solana.NewAccountMeta(collectionMasterEdition, true, false),
		// 10. metadata (writable: true)
		solana.NewAccountMeta(metadata, true, false),
		// 11. master_edition (writable: true)
		solana.NewAccountMeta(masterEdition, true, false),
		// 12. collection_authority (writable: true)
		solana.NewAccountMeta(collectionAuthorityPda, true, false),
		// 13. treasury (writable: true)
		solana.NewAccountMeta(treasury, true, false),
		// 14. token_program
		solana.NewAccountMeta(solana.TokenProgramID, false, false),
		// 15. associated_token_program
		solana.NewAccountMeta(solana.SPLAssociatedTokenAccountProgramID, false, false),
		// 16. system_program
		solana.NewAccountMeta(solana.SystemProgramID, false, false),
		// 17. token_metadata_program
		solana.NewAccountMeta(tokenMetadataProgramId, false, false),
		// 18. rent
		solana.NewAccountMeta(solana.SysVarRentPubkey, false, false),
		// 19. recent_blockhashes
		solana.NewAccountMeta(solana.SysVarRecentBlockHashesPubkey, false, false),
	}

	for _, stonePda := range stoneTypePdas {
		accounts = append(
			accounts,
			solana.NewAccountMeta(stonePda, true, false),
		)
	}

	mintStoneIx := solana.NewInstruction(
		programId,
		accounts,
		encodeMintStoneInstructionData(user_id),
	)

	computeBudgetIx := computebudget.NewSetComputeUnitLimitInstruction(400000).Build()

	recent, err := a.rpcClient.GetLatestBlockhash(ctx, rpc.CommitmentFinalized)
	if err != nil {
		a.InternalError(w, fmt.Errorf("cannot get latest blockhash: %v", err))
		return
	}

	instructions := []solana.Instruction{
		computeBudgetIx,
		createMintAccountIx,
		mintStoneIx,
	}

	tx, err := solana.NewTransaction(
		instructions,
		recent.Value.Blockhash,
		solana.TransactionPayer(userPubKey),
	)

	if err != nil {
		a.InternalError(w, fmt.Errorf("cannot create transaction: %v", err))
		return
	}

	_, err = tx.PartialSign(func(key solana.PublicKey) *solana.PrivateKey {
		switch {
		case key.Equals(mintPubKey):
			privateKey := mint.PrivateKey
			return &privateKey
		default:
			return nil
		}
	})
	if err != nil {
		a.InternalError(w, fmt.Errorf("cannot sign transaction: %v", err))
		return
	}

	txBytes, err := tx.MarshalBinary()
	if err != nil {
		a.InternalError(w, fmt.Errorf("cannot marshal transaction: %v", err))
		return
	}

	txBase64 := base64.StdEncoding.EncodeToString(txBytes)

	response := struct {
		TxBase64 string
	}{
		TxBase64: txBase64,
	}

	w.Send(response)

}

func (a *api) PrepareMonsterSwap(w *Responder, r *http.Request) {

	ctx := r.Context()
	claims, _ := Claims(r)
	form := &swapMonsterForm{}
	if err := ParseBody(r, &form); err != nil {
		a.BadRequestError(w, err)
		return
	}

	programId, err := solana.PublicKeyFromBase58(a.cfg.Solana.ProgramId)
	if err != nil {
		a.InternalError(w, fmt.Errorf("cannot encode public key: %v", err))
		return
	}

	userPubKey, err := solana.PublicKeyFromBase58(form.UserPubKey)
	if err != nil {
		a.InternalError(w, fmt.Errorf("invalid wallet public key: %v", err))
		return
	}
	monster, err := a.db.SelectMonster(ctx, form.MonsterPubKey, claims.Id)
	if err != nil {
		a.DbError(w, err)
		return
	}

	monsterCardMint, err := solana.PublicKeyFromBase58(monster.MintAddress)
	if err != nil {
		a.InternalError(w, fmt.Errorf("invalid monster public key: %v", err))
		return
	}
	cardCollectionPubKey, err := solana.PublicKeyFromBase58(a.cfg.Solana.CardCollectionPubKey)
	if err != nil {
		a.InternalError(w, fmt.Errorf("cannot encode public key: %v", err))
		return
	}
	tokenMetadataProgramId, err := solana.PublicKeyFromBase58(TOKEN_METADATA_PROGRAM_ID)
	if err != nil {
		a.InternalError(w, fmt.Errorf("cannot encode public key: %v", err))
		return
	}

	adminPrivateKey := solana.PrivateKey(a.cfg.Solana.PoolKey)
	if err := adminPrivateKey.Validate(); err != nil {
		a.InternalError(w, fmt.Errorf("invalid admin key"))
		return
	}

	// free card lookup
	freeCardDiscriminator := []byte{41, 81, 131, 229, 27, 183, 171, 89}

	accounts, err := a.rpcClient.GetProgramAccountsWithOpts(ctx, programId, &rpc.GetProgramAccountsOpts{
		Filters: []rpc.RPCFilter{
			{
				Memcmp: &rpc.RPCFilterMemcmp{
					Offset: 0,
					Bytes:  freeCardDiscriminator,
				},
			},
			{
				DataSize: 49,
			},
		},
		Commitment: rpc.CommitmentConfirmed,
	})
	if err != nil {
		a.InternalError(w, fmt.Errorf("cannot fetch pool accounts: %v", err))
		return
	}
	if len(accounts) == 0 {
		a.InternalError(w, fmt.Errorf("swap pool is empty"))
		return
	}

	var poolMints []solana.PublicKey
	for _, acc := range accounts {
		data := acc.Account.Data.GetBinary()
		if len(data) >= 40 {
			mintInAccount := solana.PublicKeyFromBytes(data[8:40])
			poolMints = append(poolMints, mintInAccount)
		}
	}
	poolCardMint := poolMints[rand.Intn(len(poolMints))]

	fmt.Printf(">>> CARDS IN POOL: %v\n", len(poolMints))
	fmt.Printf(">>> SELECTED FOR SWAP: %s\n", poolCardMint.String())

	userUserNft, _, err := solana.FindProgramAddress(
		[][]byte{[]byte("user_nft"), userPubKey.Bytes(), monsterCardMint.Bytes()},
		programId,
	)
	if err != nil {
		a.InternalError(w, fmt.Errorf("cannot find userUserNft : %v", err))
		return
	}
	userFreeCard, _, err := solana.FindProgramAddress(
		[][]byte{[]byte("free_card"), monsterCardMint.Bytes()},
		programId,
	)
	if err != nil {
		a.InternalError(w, fmt.Errorf("cannot find user free card : %v", err))
		return
	}

	poolFreeCard, _, err := solana.FindProgramAddress(
		[][]byte{[]byte("free_card"), poolCardMint.Bytes()},
		programId,
	)
	if err != nil {
		a.InternalError(w, fmt.Errorf("cannot find user free card : %v", err))
		return
	}
	poolUserNft, _, err := solana.FindProgramAddress(
		[][]byte{[]byte("user_nft"), userPubKey.Bytes(), poolCardMint.Bytes()},
		programId,
	)
	if err != nil {
		a.InternalError(w, fmt.Errorf("cannot find user free card : %v", err))
		return
	}

	swapPoolAdmin, _, err := solana.FindProgramAddress(
		[][]byte{[]byte("swap_pool_admin")},
		programId,
	)
	if err != nil {
		a.InternalError(w, fmt.Errorf("cannot find user free card : %v", err))
		return
	}
	collAuth, _, err := solana.FindProgramAddress(
		[][]byte{[]byte("collection_authority")},
		programId,
	)
	if err != nil {
		a.InternalError(w, fmt.Errorf("cannot find user free card : %v", err))
		return
	}

	monsterMetadata, _, err := solana.FindProgramAddress(
		[][]byte{
			[]byte("metadata"),
			tokenMetadataProgramId.Bytes(),
			monsterCardMint.Bytes(),
		},
		tokenMetadataProgramId,
	)
	if err != nil {
		a.InternalError(w, fmt.Errorf("cannot find user free card : %v", err))
		return
	}
	poolMetadata, _, err := solana.FindProgramAddress(
		[][]byte{
			[]byte("metadata"),
			tokenMetadataProgramId.Bytes(),
			poolCardMint.Bytes(),
		},
		tokenMetadataProgramId,
	)
	if err != nil {
		a.InternalError(w, fmt.Errorf("cannot find poolMetadata : %v", err))
		return
	}

	poolMasterEdition, _, err := solana.FindProgramAddress(
		[][]byte{
			[]byte("metadata"),
			tokenMetadataProgramId.Bytes(),
			poolCardMint.Bytes(),
			[]byte("edition"),
		},
		tokenMetadataProgramId,
	)
	if err != nil {
		a.InternalError(w, fmt.Errorf("cannot find poolMasterEdition : %v", err))
		return
	}

	collectionMetadata, _, err := solana.FindProgramAddress(
		[][]byte{
			[]byte("metadata"),
			tokenMetadataProgramId.Bytes(),
			cardCollectionPubKey.Bytes()},
		tokenMetadataProgramId,
	)
	if err != nil {
		a.InternalError(w, fmt.Errorf("cannot find PDA: %v", err))
		return
	}

	collectionMasterEdition, _, err := solana.FindProgramAddress(
		[][]byte{
			[]byte("metadata"),
			tokenMetadataProgramId.Bytes(),
			cardCollectionPubKey.Bytes(),
			[]byte("edition"),
		},
		tokenMetadataProgramId,
	)
	if err != nil {
		a.InternalError(w, fmt.Errorf("cannot find PDA: %v", err))
		return
	}

	instruction := solana.NewInstruction(
		programId,
		[]*solana.AccountMeta{
			solana.NewAccountMeta(adminPrivateKey.PublicKey(), true, true),     // 1. authority (signer, writable)
			solana.NewAccountMeta(userPubKey, false, false),                    // 2. user (non-writable, non-signer)
			solana.NewAccountMeta(monsterCardMint, false, false),               // 3. user_card_mint (non-writable)
			solana.NewAccountMeta(userUserNft, true, false),                    // 4. user_user_nft (writable)
			solana.NewAccountMeta(userFreeCard, true, false),                   // 5. user_free_card (writable)
			solana.NewAccountMeta(poolCardMint, false, false),                  // 6. pool_card_mint (non-writable)
			solana.NewAccountMeta(poolFreeCard, true, false),                   // 7. pool_free_card (writable)
			solana.NewAccountMeta(poolUserNft, true, false),                    // 8. pool_user_nft (writable)
			solana.NewAccountMeta(cardCollectionPubKey, false, false),          // 9. collection_mint (non-writable)
			solana.NewAccountMeta(collectionMetadata, true, false),             // 10. collection_metadata (writable)
			solana.NewAccountMeta(collectionMasterEdition, true, false),        // 11. collection_master_edition (writable)
			solana.NewAccountMeta(monsterMetadata, true, false),                // 12. user_metadata (writable)
			solana.NewAccountMeta(poolMetadata, true, false),                   // 13. pool_metadata (writable)
			solana.NewAccountMeta(poolMasterEdition, true, false),              // 14. pool_master_edition (writable)
			solana.NewAccountMeta(collAuth, false, false),                      // 15. collection_authority (PDA, non-writable)
			solana.NewAccountMeta(swapPoolAdmin, false, false),                 // 16. swap_pool_admin (PDA, non-writable)
			solana.NewAccountMeta(solana.TokenMetadataProgramID, false, false), // 17. token_metadata_program (Program ID)
			solana.NewAccountMeta(solana.SystemProgramID, false, false),        // 18. system_program
		},
		encodeSwapCardInstructionData(),
	)

	recent, err := a.rpcClient.GetLatestBlockhash(ctx, rpc.CommitmentFinalized)
	if err != nil {
		a.InternalError(w, fmt.Errorf("cannot get latest blockhash: %v", err))
		return
	}
	tx, err := solana.NewTransaction(
		[]solana.Instruction{instruction},
		recent.Value.Blockhash,
		solana.TransactionPayer(adminPrivateKey.PublicKey()),
	)
	if err != nil {
		a.InternalError(w, fmt.Errorf("cannot create transaction: %v", err))
		return
	}

	_, err = tx.Sign(func(key solana.PublicKey) *solana.PrivateKey {
		if key.Equals(adminPrivateKey.PublicKey()) {
			return &adminPrivateKey
		}
		return nil
	})
	if err != nil {
		a.InternalError(w, fmt.Errorf("cannot sign transaction: %v", err))
		return
	}

	sig, err := a.rpcClient.SendTransaction(ctx, tx)
	if err != nil {
		a.InternalError(w, fmt.Errorf("failed to send transaction: %v", err))
		return
	}

	LogInfo("API", fmt.Sprintf("Transaction sent: %s", sig.String()))

	response := struct {
		Signature string `json:"signature"`
	}{
		Signature: sig.String(),
	}

	w.Send(response)

}

func (a *api) SubscribeSSE(w http.ResponseWriter, r *http.Request) {
	key := Param(r)

	if key == "" {
		http.Error(w, "key required", http.StatusBadRequest)
		return
	}
	w.Header().Set("Access-Control-Allow-Origin", "*")
	w.Header().Set("Content-Type", "text/event-stream")
	w.Header().Set("Cache-Control", "no-cache")
	w.Header().Set("Connection", "keep-alive")
	w.Header().Set("X-Accel-Buffering", "no")
	flusher, ok := w.(http.Flusher)
	if !ok {
		http.Error(w, "Streaming not supported", http.StatusInternalServerError)
		return
	}

	sub := a.sseAgent.Subscribe(key)
	defer a.sseAgent.Unsubscribe(sub)

	ctx := r.Context()

	sendSSE := func(event string, payload any) {
		data, err := json.Marshal(payload)
		if err != nil {
			data = []byte(`{"error":"failed to marshal data"}`)
		}

		if event != "" {
			fmt.Fprintf(w, "event: %s\n", event)
		}
		fmt.Fprintf(w, "data: %s\n\n", data)
		flusher.Flush()
	}

	for {
		select {
		case <-ctx.Done():
			return
		case msg := <-sub.conn:
			sendSSE(msg.Event, msg.Data)
		}
	}
}

func encodeSwapCardInstructionData() []byte {
	return []byte{143, 210, 95, 198, 96, 127, 195, 247}
}

func encodeMintCardInstructionData(uri string, user_id, experiment_id int) []byte {
	encodeAnchorString := func(s string) []byte {
		buf := make([]byte, 4+len(s))
		binary.LittleEndian.PutUint32(buf[0:4], uint32(len(s)))
		copy(buf[4:], []byte(s))
		return buf
	}
	encodeAnchorInt := func(i int) []byte {
		buf := make([]byte, 4)
		binary.LittleEndian.PutUint32(buf, uint32(i))
		return buf
	}

	discriminator := []byte{4, 182, 83, 217, 232, 35, 33, 64}

	data := make([]byte, 0)
	data = append(data, discriminator...)

	data = append(data, encodeAnchorString(uri)...)
	data = append(data, encodeAnchorInt(user_id)...)
	data = append(data, encodeAnchorInt(experiment_id)...)

	return data
}

func encodeMintSparkCardInstanceData(uri string, user_id, experiment_id int) []byte {
	encodeAnchorString := func(s string) []byte {
		buf := make([]byte, 4+len(s))
		binary.LittleEndian.PutUint32(buf[0:4], uint32(len(s)))
		copy(buf[4:], []byte(s))
		return buf
	}

	encodeAnchorInt := func(i int) []byte {
		buf := make([]byte, 4)
		binary.LittleEndian.PutUint32(buf, uint32(i))
		return buf
	}

	discriminator := []byte{155, 166, 147, 157, 177, 27, 102, 227}

	data := make([]byte, 0)
	data = append(data, discriminator...)

	data = append(data, encodeAnchorString(uri)...)
	data = append(data, encodeAnchorInt(user_id)...)
	data = append(data, encodeAnchorInt(experiment_id)...)

	return data
}

func encodeMintStoneInstructionData(user_id int) []byte {
	encodeAnchorInt := func(i int) []byte {
		buf := make([]byte, 4)
		binary.LittleEndian.PutUint32(buf, uint32(i))
		return buf
	}

	discriminator := []byte{3, 147, 97, 164, 139, 153, 105, 248}

	data := make([]byte, 0)
	data = append(data, discriminator...)
	data = append(data, encodeAnchorInt(user_id)...)

	return data
}

func (a *api) BadRequestError(w *Responder, err error) {
	LogError("API", "bad request", err)
	w.SendInternalError()
}

func (a *api) DbError(w *Responder, err error) {
	LogError("API", "cannot execute DB query", err)
	a.telegram.SendMessage(DevChannel, "cannot execute DB query %v", err.Error())
	w.SendInternalError()
}

func (a *api) InternalError(w *Responder, err error) {
	LogError("API", "Internal server error", err)
	a.telegram.SendMessage(DevChannel, "Internal server error: %v", err.Error())
	w.SendInternalError()
}

func ParseBody(r *http.Request, dst any) error {
	limited := io.LimitReader(r.Body, 5<<20)
	return json.NewDecoder(limited).Decode(dst)
}

func Param(r *http.Request) string {
	path := strings.Trim(r.URL.Path, "/")
	parts := strings.Split(path, "/")

	if len(parts) < 2 {
		return ""
	}

	return parts[2]
}

func uploadImageToPinata(pinataJWT string, base64Image string, fileName string) (string, error) {

	imageData, err := base64.StdEncoding.DecodeString(base64Image)
	if err != nil {
		return "", err
	}

	body := &bytes.Buffer{}
	writer := multipart.NewWriter(body)
	// TODO: bulletproof extension and filename
	part, err := writer.CreateFormFile("file", fmt.Sprintf("%s.png", fileName))
	if err != nil {
		return "", err
	}
	_, err = part.Write(imageData)
	if err != nil {
		return "", err
	}
	writer.Close()

	req, err := http.NewRequest("POST", PINATA_PIN_FILE_URL, body)
	if err != nil {
		return "", err
	}

	req.Header.Set("Content-Type", writer.FormDataContentType())
	req.Header.Set("Authorization", "Bearer "+pinataJWT)

	client := &http.Client{}
	resp, err := client.Do(req)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()

	respBody, err := io.ReadAll(resp.Body)
	if err != nil {
		return "", err
	}

	if resp.StatusCode != http.StatusOK {
		return "", fmt.Errorf("pinata API refused %d: %s", resp.StatusCode, string(respBody))
	}

	var parsed struct {
		IpfsHash  string `json:"IpfsHash"`
		PinSize   int    `json:"PinSize"`
		Timestamp string `json:"Timestamp"`
	}
	err = json.Unmarshal(respBody, &parsed)
	if err != nil {
		return "", err
	}

	return parsed.IpfsHash, nil
}

func uploadMetadataToPinata(pinataJWT string, metadata map[string]any) (string, error) {

	jsonBytes, err := json.Marshal(metadata)
	if err != nil {
		return "", err
	}

	body := &bytes.Buffer{}
	writer := multipart.NewWriter(body)

	part, err := writer.CreateFormFile("file", "metadata.json")
	if err != nil {
		return "", err
	}

	_, err = part.Write(jsonBytes)
	if err != nil {
		return "", err
	}

	writer.Close()

	req, err := http.NewRequest("POST", PINATA_PIN_FILE_URL, body)
	if err != nil {
		return "", err
	}

	req.Header.Set("Content-Type", writer.FormDataContentType())
	req.Header.Set("Authorization", "Bearer "+pinataJWT)

	client := &http.Client{}
	resp, err := client.Do(req)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()

	respBody, err := io.ReadAll(resp.Body)
	if err != nil {
		return "", err
	}

	if resp.StatusCode != http.StatusOK {
		return "", fmt.Errorf("pinata API refused %d: %s", resp.StatusCode, string(respBody))
	}

	var parsed struct {
		IpfsHash string `json:"IpfsHash"`
	}
	err = json.Unmarshal(respBody, &parsed)
	if err != nil {
		return "", err
	}

	return parsed.IpfsHash, nil
}
