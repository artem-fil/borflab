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
	R2_ENDPOINT               = "https://62957615d09dddc1af2ae1c5423e6632.r2.cloudflarestorage.com"
	AVG_ANALYZE_TIME          = 15 // OpenAI vision call (gpt-4o)
	AVG_GENERATE_TIME         = 40 // OpenAI image generation (gpt-image-1.5)
	AVG_UPLOAD_TIME           = 8  // Pinata: image + metadata
	AVG_MINT_TIME             = 20 // Solana tx confirmation (используется как таймаут-хинт)
)

var (
	tasks             sync.Map // taskId → *TaskStatus
	mintStatuses      sync.Map // experimentId (string) → *MintStatus
	totalPipelineTime = AVG_ANALYZE_TIME + AVG_GENERATE_TIME + AVG_UPLOAD_TIME
	P                 = struct {
		Started   int // промпты собраны, запрос строится
		Analyzed  int // записано в БД, nextTask создан
		Generated int // картинка получена
		Uploaded  int // картинка и метадата загружены на Pinata
		Finished  int // всё сохранено в БД
	}{
		Started:   pct(1),
		Analyzed:  pct(AVG_ANALYZE_TIME),
		Generated: pct(AVG_ANALYZE_TIME + AVG_GENERATE_TIME - 1),
		Uploaded:  pct(AVG_ANALYZE_TIME + AVG_GENERATE_TIME + AVG_UPLOAD_TIME),
		Finished:  100,
	}
)

type api struct {
	cfg       *Config
	db        *DB
	r2        *R2Client
	telegram  *Telegram
	rpcClient *rpc.Client
	sseAgent  *SSEAgent
}

type mintMonsterForm struct {
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

type MintStatus struct {
	Status    string `json:"status"` // pending | confirmed | failed
	Signature string `json:"signature,omitempty"`
	Error     string `json:"error,omitempty"`
}

func NewApi(cfg *Config, db *DB, r2 *R2Client, telegram *Telegram, rpcClient *rpc.Client, sseAgent *SSEAgent) *api {

	return &api{cfg, db, r2, telegram, rpcClient, sseAgent}
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

func (a *api) GetSwapomat(w *Responder, r *http.Request) {
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

	swapPool, err := a.db.SelectSwapPool(ctx, 30)
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
		SwapPool []Monster
		Total    int
		Pages    int
	}{
		Monsters: monsters,
		SwapPool: swapPool,
		Total:    total,
		Pages:    pages,
	}
	w.Send(response)
}

func (a *api) GetMonster(w *Responder, r *http.Request) {

	ctx := r.Context()
	claims, _ := Claims(r)

	monsterId := Param(r)

	monster, err := a.db.SelectMonster(ctx, monsterId, claims.Id)
	if err != nil {
		a.DbError(w, err)
		return
	}

	response := struct {
		Monster Monster
	}{
		Monster: monster,
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

func (a *api) GetTaskStatus(w *Responder, r *http.Request) {
	taskId := Param(r)
	if taskId == "" {
		a.BadRequestError(w, fmt.Errorf("task id required"))
		return
	}

	raw, ok := tasks.Load(taskId)
	if !ok {
		a.BadRequestError(w, fmt.Errorf("task not found"))
		return
	}

	ts := raw.(*TaskStatus)

	w.Send(map[string]any{
		"progress":   ts.ComputeProgress(),
		"done":       ts.Done,
		"failed":     ts.Failed,
		"error":      ts.Error,
		"result":     ts.Result,
		"nextTaskId": ts.NextTaskId,
	})
}

func (a *api) GetMintStatus(w *Responder, r *http.Request) {
	expId := Param(r)
	if expId == "" {
		a.BadRequestError(w, fmt.Errorf("experiment id required"))
		return
	}

	raw, ok := mintStatuses.Load(expId)
	if !ok {
		// not yet stored – transaction not sent yet or expId wrong
		w.Send(&MintStatus{Status: "pending"})
		return
	}

	w.Send(raw.(*MintStatus))
}

func (a *api) AnalyzeSpecimen(w *Responder, r *http.Request) {

	taskID := uuid.NewString()

	ts := &TaskStatus{Progress: 0, Done: false}
	ts.SetStage(P.Started, P.Analyzed, AVG_ANALYZE_TIME)
	tasks.Store(taskID, ts)
	tasks.Store(taskID, ts)

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

	storageImg, err := ResizeJPEG(imgBytes, 400)
	if err != nil {
		a.InternalError(w, err)
		return
	}
	// 1024px для OpenAI — лучше качество анализа
	analysisImg, err := ResizeJPEG(imgBytes, 1024)
	if err != nil {
		a.InternalError(w, err)
		return
	}

	expUUID := uuid.NewString()
	inputKey := fmt.Sprintf("monsters/%s/input.jpg", expUUID)

	if err := a.r2.Upload(r.Context(), inputKey, "image/jpeg", storageImg); err != nil {
		a.InternalError(w, fmt.Errorf("cannot upload input to r2: %w", err))
		return
	}

	experiment := &Experiment{
		UUID:        expUUID,
		UserId:      claims.Id,
		InputMime:   inputMime,
		InputWidth:  inputWidth,
		InputHeight: inputHeight,
		InputSize:   inputSize,
		InputUrl:    a.r2.URL(inputKey),
		Stone:       StoneType(selectedStone.Type),
		Biome:       *biome,
	}
	insertedExperiment, err := a.db.InsertExperiment(r.Context(), experiment)
	if err != nil {
		a.DbError(w, fmt.Errorf("cannot insert experiment %v", err))
		return
	}

	go a.processImage(taskID, analysisImg, insertedExperiment)

	w.Send(struct{ Id string }{Id: taskID})
}

func (a *api) processImage(taskId string, imgBytes []byte, experiment *Experiment) {
	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Minute)
	defer cancel()

	defer func() {
		if r := recover(); r != nil {
			errStr := fmt.Sprintf("LAB FATAL ERROR: %v", r)
			LogError("API", "Panic recovery in processImage", fmt.Errorf("%v", r))
			raw, ok := tasks.Load(taskId)
			if !ok {
				return
			}
			ts := raw.(*TaskStatus)
			ts.Failed = true
			ts.Error = errStr
			ts.Done = true
		}
	}()

	raw, _ := tasks.Load(taskId)
	ts := raw.(*TaskStatus)
	time.AfterFunc(10*time.Minute, func() { tasks.Delete(taskId) })

	setProgress := func(p int) { ts.Progress = p }
	fail := func(msg string, err error) {
		LogError("API", msg, err)
		cancel()
		ts.Failed = true
		ts.Error = msg
		ts.Done = true
	}

	// ── prompt assembly ───────────────────────────────────────────────────────

	biomePrompt, ok1 := Prompts.PromptAnalyze[experiment.Biome]
	stonePrompt, ok2 := Prompts.PromptStone[experiment.Stone][experiment.Biome]
	if !ok1 || !ok2 {
		fail("Laboratory database error: missing prompts for biome or stone", nil)
		return
	}
	prompt := fmt.Sprintf(biomePrompt, stonePrompt)

	setProgress(P.Analyzed)
	// ── build OpenAI request ──────────────────────────────────────────────────

	requestBody := map[string]any{
		"model":           "gpt-4o",
		"max_tokens":      2048,
		"temperature":     0.3,
		"top_p":           1.0,
		"response_format": map[string]any{"type": "json_object"},
		"messages": []any{
			map[string]any{
				"role":    "system",
				"content": prompt,
			},
			map[string]any{
				"role": "user",
				"content": []any{
					map[string]any{"type": "text", "text": "Here's an image"},
					map[string]any{
						"type": "image_url",
						"image_url": map[string]any{
							"url": "data:image/jpeg;base64," + encodeToBase64(imgBytes),
						},
					},
				},
			},
		},
	}

	bodyBytes, err := json.Marshal(requestBody)
	if err != nil {
		fail("Internal error: cannot marshal request", err)
		return
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, OPENAI_COMPLETION_URL, bytes.NewReader(bodyBytes))
	if err != nil {
		fail("Internal error: cannot create request", err)
		return
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+a.cfg.OpenAIToken)

	client := &http.Client{Timeout: 100 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		fail("Laboratory connection lost: OpenAI unreachable", err)
		return
	}
	defer resp.Body.Close()

	respBody, err := io.ReadAll(resp.Body)
	if err != nil {
		fail("Failed to read laboratory report", err)
		return
	}
	if resp.StatusCode != http.StatusOK {
		fail(fmt.Sprintf("OpenAI API refused: %d. Response: %s", resp.StatusCode, string(respBody)), nil)
		return
	}

	var rawResp struct {
		Choices []struct {
			Message struct {
				Content string `json:"content"`
			} `json:"message"`
		} `json:"choices"`
	}
	if err = json.Unmarshal(respBody, &rawResp); err != nil || len(rawResp.Choices) == 0 {
		fail("Laboratory analyzer returned corrupted data", err)
		return
	}

	content := rawResp.Choices[0].Message.Content
	sanitizedJson, err := sanitizeJSON(content)
	if err != nil {
		fail(fmt.Sprintf("Cannot parse analyze report. Raw result: %v", content), err)
		return
	}

	var parsed map[string]any
	if err := json.Unmarshal(sanitizedJson, &parsed); err != nil {
		fail("Failed to parse specimen data", err)
		return
	}
	if maybeError, hasError := parsed["Error"]; hasError {
		fail(fmt.Sprint(maybeError), nil)
		return
	}

	setProgress(P.Analyzed)
	analyzed := time.Now().UTC()
	experiment.Specimen = sanitizedJson
	experiment.Analyzed = &analyzed
	if _, err := a.db.AnalyzeExperiment(context.Background(), experiment); err != nil {
		fail("Database failed to record specimen", err)
		return
	}

	nextTaskId := uuid.NewString()
	tasks.Store(nextTaskId, &TaskStatus{Progress: 50, Done: false})
	go a.generateImage(nextTaskId, parsed, *experiment)

	ts.Done = true
	ts.Result = parsed
	ts.NextTaskId = nextTaskId
}

func (a *api) generateImage(taskId string, specimen map[string]any, experiment Experiment) {
	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Minute)
	defer cancel()

	ts := &TaskStatus{Done: false}
	ts.SetStage(P.Analyzed, P.Generated, AVG_GENERATE_TIME)
	tasks.Store(taskId, ts)

	setProgress := func(p int) { ts.Progress = p }
	fail := func(msg string, err error) {
		LogError("API", msg, err)
		cancel()
		ts.Failed = true
		ts.Error = msg
		ts.Done = true
	}

	// ── parse specimen ────────────────────────────────────────────────────────
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
			"name": "Unnamed Creature", "species": "Mysterious Species",
			"lore": "Its origins are lost to time", "height": "50", "weight": "7",
			"movement_class": "Unknown Locomotion", "behaviour": "Behavior undocumented",
			"personality": "Enigmatic", "abilities": "Abilities yet to be discovered",
			"habitat": "Habitat unknown",
		}
		if fb, ok := fallbacks[key]; ok {
			return fb
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
	h, w := randomSize(experiment.Stone, experiment.Biome)
	height := strconv.Itoa(h)
	weight := strconv.Itoa(w)

	prompt := fmt.Sprintf("%s.\n %s", renderDirective, Prompts.PromptGeneration[experiment.Biome])

	// ── build OpenAI image request ────────────────────────────────────────────

	requestBody := map[string]any{
		"model":      "gpt-image-1.5",
		"n":          1,
		"size":       "1024x1024",
		"quality":    "high",
		"prompt":     prompt,
		"moderation": "low",
	}
	bodyBytes, err := json.Marshal(requestBody)
	if err != nil {
		fail("cannot marshal json", err)
		return
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, OPENAI_GENERATION_URL, bytes.NewReader(bodyBytes))
	if err != nil {
		fail("cannot create request", err)
		return
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+a.cfg.OpenAIToken)

	client := &http.Client{Timeout: 60 * time.Second}
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

	setProgress(P.Generated)
	ts.SetStage(P.Generated, P.Finished, AVG_UPLOAD_TIME)

	imageBytes, err := base64.StdEncoding.DecodeString(base64Image)
	if err != nil {
		fail("cannot decode base64 image", err)
		return
	}
	// тумб 400px
	thumbBytes, err := ResizePNG(imageBytes, 400)
	if err != nil {
		fail("cannot resize thumb", err)
		return
	}

	type pinataResult struct {
		cid string
		err error
	}
	pinataCh := make(chan pinataResult, 1)
	go func() {
		cid, err := uploadImageToPinata(a.cfg.Pinata.PinataToken, base64Image, name)
		pinataCh <- pinataResult{cid, err}
	}()

	imageKey := fmt.Sprintf("monsters/%s/image.png", experiment.UUID)
	thumbKey := fmt.Sprintf("monsters/%s/thumb.png", experiment.UUID)

	if err := a.r2.Upload(ctx, imageKey, "image/png", imageBytes); err != nil {
		fail("cannot upload image to r2", err)
		return
	}
	if err := a.r2.Upload(ctx, thumbKey, "image/png", thumbBytes); err != nil {
		fail("cannot upload thumb to r2", err)
		return
	}

	experiment.ImageUrl = a.r2.URL(imageKey)
	experiment.ThumbUrl = a.r2.URL(thumbKey)

	// ждём Pinata
	pr := <-pinataCh
	if pr.err != nil {
		fail("cannot upload image to ipfs", pr.err)
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
		"image":                   fmt.Sprintf("ipfs://%s", pr.cid),
		"external_url":            "https://borflab.com/library",
		"seller_fee_basis_points": 0,
		"attributes": []any{
			map[string]string{"trait_type": "Biome", "value": string(experiment.Biome)},
			map[string]string{"trait_type": "Rarity", "value": string(experiment.Rarity)},
			map[string]string{"trait_type": "Stone", "value": string(experiment.Stone)},
		},
		"properties": map[string]any{
			"category":       "image",
			"files":          []map[string]any{{"uri": fmt.Sprintf("ipfs://%s", pr.cid), "type": "image/png"}},
			"creators":       []map[string]any{{"address": "dghfghgfh", "share": 100, "verified": true}},
			"species":        species,
			"lore":           lore,
			"weight":         weight,
			"height":         height,
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

	setProgress(P.Uploaded)

	uploaded := time.Now().UTC()
	experiment.ImageCID = pr.cid
	experiment.MetadataCID = metadataCid
	experiment.Metadata = metadata
	experiment.Generated = &generated
	experiment.Uploaded = &uploaded

	if _, err := a.db.FinishExperiment(context.Background(), &experiment); err != nil {
		fail("cannot update experiment", err)
		return
	}

	setProgress(P.Finished)
	ts.Done = true
	ts.Result = map[string]any{
		"image":        base64Image,
		"experimentId": experiment.Id,
	}
}

func (a *api) PrepareMonsterMint(w *Responder, r *http.Request) {
	ctx := r.Context()
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

	rpcCtx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()

	adminAccount, err := a.rpcClient.GetAccountInfoWithOpts(rpcCtx, cardMintAdminPda,
		&rpc.GetAccountInfoOpts{Commitment: rpc.CommitmentConfirmed})
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
		[][]byte{[]byte("user_nft"), userPubKey.Bytes(), mintPubKey.Bytes()}, programId)
	metadata, _, _ := solana.FindProgramAddress(
		[][]byte{[]byte("metadata"), tokenMetadataProgramId.Bytes(), mintPubKey.Bytes()}, tokenMetadataProgramId)
	masterEdition, _, _ := solana.FindProgramAddress(
		[][]byte{[]byte("metadata"), tokenMetadataProgramId.Bytes(), mintPubKey.Bytes(), []byte("edition")}, tokenMetadataProgramId)
	collectionMetadata, _, _ := solana.FindProgramAddress(
		[][]byte{[]byte("metadata"), tokenMetadataProgramId.Bytes(), cardCollectionPubKey.Bytes()}, tokenMetadataProgramId)
	collectionMasterEdition, _, _ := solana.FindProgramAddress(
		[][]byte{[]byte("metadata"), tokenMetadataProgramId.Bytes(), cardCollectionPubKey.Bytes(), []byte("edition")}, tokenMetadataProgramId)
	borflabVaultPda, _, _ := solana.FindProgramAddress([][]byte{[]byte("borflab_vault")}, programId)
	borflabVaultAta, _, _ := solana.FindAssociatedTokenAddress(borflabVaultPda, mintPubKey)

	mintRent, err := a.rpcClient.GetMinimumBalanceForRentExemption(ctx, 82, rpc.CommitmentConfirmed)
	if err != nil {
		a.InternalError(w, err)
		return
	}

	cardTypePda, _, _ := solana.FindProgramAddress([][]byte{[]byte("spark_card_type")}, programId)
	sparkCardStatePda, _, _ := solana.FindProgramAddress(
		[][]byte{[]byte("spark_card_state"), mintPubKey.Bytes()}, programId)

	mintCardIx := solana.NewInstruction(
		programId,
		[]*solana.AccountMeta{
			solana.NewAccountMeta(mintPubKey, true, false),
			solana.NewAccountMeta(userPubKey, true, false),
			solana.NewAccountMeta(borflabVaultPda, true, false),
			solana.NewAccountMeta(borflabVaultAta, true, false),
			solana.NewAccountMeta(adminPrivateKey.PublicKey(), true, true),
			solana.NewAccountMeta(cardMintAdminPda, false, false),
			solana.NewAccountMeta(cardTypePda, true, false),
			solana.NewAccountMeta(sparkCardStatePda, true, false),
			solana.NewAccountMeta(userNftPda, true, false),
			solana.NewAccountMeta(cardCollectionPubKey, false, false),
			solana.NewAccountMeta(collectionMetadata, true, false),
			solana.NewAccountMeta(collectionMasterEdition, true, false),
			solana.NewAccountMeta(metadata, true, false),
			solana.NewAccountMeta(masterEdition, true, false),
			solana.NewAccountMeta(collectionAuthorityPda, true, false),
			solana.NewAccountMeta(solana.TokenProgramID, false, false),
			solana.NewAccountMeta(solana.SPLAssociatedTokenAccountProgramID, false, false),
			solana.NewAccountMeta(solana.SystemProgramID, false, false),
			solana.NewAccountMeta(tokenMetadataProgramId, false, false),
			solana.NewAccountMeta(solana.SysVarRentPubkey, false, false),
		},
		encodeMintSparkCardInstanceData(uri, user_id, experiment_id),
	)

	createMintAccountIx := system.NewCreateAccountInstruction(
		mintRent, 82, solana.TokenProgramID, adminPrivateKey.PublicKey(), mintPubKey).Build()
	computeBudgetIx := computebudget.NewSetComputeUnitLimitInstruction(400000).Build()

	recent, err := a.rpcClient.GetLatestBlockhash(ctx, rpc.CommitmentFinalized)
	if err != nil {
		a.InternalError(w, fmt.Errorf("cannot get latest blockhash: %v", err))
		return
	}

	tx, err := solana.NewTransaction(
		[]solana.Instruction{computeBudgetIx, createMintAccountIx, mintCardIx},
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
		if key.Equals(mint.PublicKey()) {
			priv := mint.PrivateKey
			return &priv
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

	// Mark pending immediately so the first client poll doesn't get a 404.
	expIdStr := strconv.Itoa(experiment.Id)
	mintStatuses.Store(expIdStr, &MintStatus{Status: "pending", Signature: sig.String()})

	// Track confirmation in the background; client polls /mint/{expId}/status.
	go a.trackMintConfirmation(expIdStr, sig)

	w.Send(struct {
		Signature string `json:"signature"`
	}{Signature: sig.String()})
}

func (a *api) trackMintConfirmation(experimentId string, sig solana.Signature) {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Minute)
	defer cancel()

	ticker := time.NewTicker(3 * time.Second)
	defer ticker.Stop()

	for {
		select {
		case <-ctx.Done():
			mintStatuses.Store(experimentId, &MintStatus{
				Status: "failed",
				Error:  "confirmation timeout",
			})
			return

		case <-ticker.C:
			statuses, err := a.rpcClient.GetSignatureStatuses(ctx, false, sig)
			if err != nil || statuses == nil || len(statuses.Value) == 0 || statuses.Value[0] == nil {
				// transient RPC hiccup – just wait for next tick
				continue
			}

			result := statuses.Value[0]

			if result.Err != nil {
				mintStatuses.Store(experimentId, &MintStatus{
					Status: "failed",
					Error:  fmt.Sprintf("chain error: %v", result.Err),
				})
				return
			}

			confirmed := result.ConfirmationStatus == rpc.ConfirmationStatusConfirmed ||
				result.ConfirmationStatus == rpc.ConfirmationStatusFinalized

			if confirmed {
				mintStatuses.Store(experimentId, &MintStatus{
					Status:    "confirmed",
					Signature: sig.String(),
				})
				return
			}
			// still processing (processed / nil) – next tick
		}
	}
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

func encodeSwapCardInstructionData() []byte {
	return []byte{143, 210, 95, 198, 96, 127, 195, 247}
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

func pct(elapsedSeconds int) int {
	v := int(float64(elapsedSeconds) / float64(totalPipelineTime) * 100)
	if v < 0 {
		return 0
	}
	if v > 100 {
		return 100
	}
	return v
}
