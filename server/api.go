package main

import (
	"bytes"
	"context"
	"encoding/base64"
	"encoding/binary"
	"encoding/json"
	"errors"
	"fmt"
	_ "image/png"
	"io"
	"log"
	"math/rand"
	"mime/multipart"
	"net/http"
	"net/textproto"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/google/uuid"

	"github.com/gagliardetto/solana-go"
	computebudget "github.com/gagliardetto/solana-go/programs/compute-budget"
	"github.com/gagliardetto/solana-go/programs/system"
	"github.com/gagliardetto/solana-go/rpc"
	"github.com/stripe/stripe-go/v85"
	"github.com/stripe/stripe-go/v85/checkout/session"
	"github.com/stripe/stripe-go/v85/webhook"
)

const (
	OPENAI_COMPLETION_URL     = "https://api.openai.com/v1/chat/completions"
	OPENAI_EDITS_URL          = "https://api.openai.com/v1/images/edits"
	OPENAI_GENERATION_URL     = "https://api.openai.com/v1/images/generations"
	PINATA_PIN_FILE_URL       = "https://api.pinata.cloud/pinning/pinFileToIPFS"
	TOKEN_METADATA_PROGRAM_ID = "metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s"
	R2_ENDPOINT               = "https://62957615d09dddc1af2ae1c5423e6632.r2.cloudflarestorage.com"
	AVG_ANALYZE_TIME          = 13 // OpenAI vision call (gpt-4o)
	AVG_GENERATE_TIME         = 20 // OpenAI image generation (gpt-image-1.5)
	AVG_UPLOAD_TIME           = 7  // Pinata: image + metadata
	AVG_MINT_TIME             = 17 // Solana tx confirmation (используется как таймаут-хинт)
	spriteInlineMaxAttempts   = 3
	spriteInlineBackoffBase   = 3 * time.Second // attempt N waits base * N
)

var (
	tasks             sync.Map // taskId → *TaskStatus
	swapStatuses      sync.Map
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
type SwapStatus struct {
	Status      string `json:"status"` // pending | confirmed | failed
	MintAddress string `json:"mintAddress,omitempty"`
	Error       string `json:"error,omitempty"`
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

	w.Header().Set("Cache-Control", "no-cache, no-store, must-revalidate, max-age=0")
	w.Header().Set("Pragma", "no-cache")
	w.Header().Set("Expires", "0")

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
	email, ok := claims.Email()
	if !ok {
		a.BadRequestError(w, errors.New("Invalid email"))
		return
	}

	orderId := uuid.New()

	stripe.Key = a.cfg.StripePrivateKey
	params := &stripe.CheckoutSessionParams{
		UIMode:        stripe.String("elements"),
		CustomerEmail: stripe.String(email),
		Mode:          stripe.String("payment"),
		LineItems: []*stripe.CheckoutSessionLineItemParams{
			{
				PriceData: &stripe.CheckoutSessionLineItemPriceDataParams{
					Currency: stripe.String("usd"),
					ProductData: &stripe.CheckoutSessionLineItemPriceDataProductDataParams{
						Name: stripe.String(product.Id),
					},
					UnitAmount: stripe.Int64(product.Price),
				},
				Quantity: stripe.Int64(1),
			},
		},
		ReturnURL: stripe.String("https://borflab.com/shop"),
		PaymentIntentData: &stripe.CheckoutSessionPaymentIntentDataParams{
			Metadata: map[string]string{
				"orderId": orderId.String(),
			},
		},
	}

	cs, err := session.New(params)
	if err != nil {
		a.InternalError(w, err)
		return
	}

	order := &Order{
		Id:             orderId,
		UserId:         claims.Id,
		Product:        product.Id,
		Price:          int(product.Price),
		StripeIntentId: cs.ID, // теперь храним session ID
	}

	if err = a.db.InsertOrder(r.Context(), order); err != nil {
		a.DbError(w, err)
		return
	}

	w.Send(struct {
		OrderId      string
		ClientSecret string
	}{
		OrderId:      orderId.String(),
		ClientSecret: cs.ClientSecret,
	})
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
	event, err := webhook.ConstructEventWithOptions(payload, sigHeader, a.cfg.StripeSecret, webhook.ConstructEventOptions{
		IgnoreAPIVersionMismatch: true,
	})
	if err != nil {
		log.Printf("ConstructEvent error: %v", err)
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
		a.NotFoundError(w)
		return
	}

	ts := raw.(*TaskStatus)

	w.Header().Set("Cache-Control", "no-store")
	w.Send(ts.Snapshot())
}

func (a *api) GetMintStatus(w *Responder, r *http.Request) {
	expIdStr := Param(r)
	if expIdStr == "" {
		a.BadRequestError(w, fmt.Errorf("experiment id required"))
		return
	}

	expId, err := strconv.Atoi(expIdStr)
	if err != nil {
		a.BadRequestError(w, fmt.Errorf("invalid experiment id"))
		return
	}

	// Проверяем статус в БД
	status, err := a.db.SelectMonsterStatus(r.Context(), expId)
	if err != nil {
		a.InternalError(w, err)
		return
	}

	// Если в БД уже "active" - сразу отдаем confirmed
	if status == "active" {
		w.Send(&MintStatus{Status: "confirmed"})
		return
	}

	// Если "failed" - отдаем ошибку
	if status == "failed" {
		w.Send(&MintStatus{Status: "failed", Error: "mint failed"})
		return
	}

	// Если "pending" - проверяем mintStatuses
	raw, ok := mintStatuses.Load(expIdStr)
	if !ok {
		w.Send(&MintStatus{Status: "pending"})
		return
	}

	ms := raw.(*MintStatus)
	w.Send(ms)
}

func (a *api) GetSwapStatus(w *Responder, r *http.Request) {
	sig := Param(r)
	if sig == "" {
		a.BadRequestError(w, fmt.Errorf("signature required"))
		return
	}

	raw, ok := swapStatuses.Load(sig)
	if !ok {
		w.Send(&SwapStatus{Status: "pending"})
		return
	}

	w.Send(raw.(*SwapStatus))
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

	heartbeat := time.NewTicker(15 * time.Second)
	defer heartbeat.Stop()

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

		case <-heartbeat.C:
			fmt.Fprintf(w, ": heartbeat\n\n")
			flusher.Flush()
		}
	}
}

func (a *api) AnalyzeSpecimen(w *Responder, r *http.Request) {

	taskID := uuid.NewString()

	ts := &TaskStatus{}
	ts.SetStage(P.Started, P.Analyzed, AVG_ANALYZE_TIME)
	tasks.Store(taskID, ts)

	time.AfterFunc(10*time.Minute, func() {
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

	userPubKey := r.FormValue("userPubKey")
	if userPubKey == "" {
		a.BadRequestError(w, fmt.Errorf("userPubKey is required"))
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

	go a.processImage(taskID, analysisImg, insertedExperiment, userPubKey)

	w.Send(struct{ Id string }{Id: taskID})
}

func (a *api) processImage(taskId string, imgBytes []byte, experiment *Experiment, userPubKey string) {
	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Minute)
	defer cancel()

	raw, _ := tasks.Load(taskId)
	ts := raw.(*TaskStatus)

	defer func() {
		if r := recover(); r != nil {
			errStr := fmt.Sprintf("LAB FATAL ERROR: %v", r)
			LogError("API", "Panic recovery in processImage", fmt.Errorf("%v", r))
			ts.Fail(errStr)
		}
	}()

	time.AfterFunc(10*time.Minute, func() { tasks.Delete(taskId) })

	fail := func(msg string, err error) {
		LogError("API", msg, err)
		cancel()
		ts.Fail(msg)
	}

	// ── prompt assembly ───────────────────────────────────────────────────────

	p := GetActivePrompt()
	biomePrompt, ok1 := p.PromptAnalyze[experiment.Biome]
	stonePrompt, ok2 := p.PromptStone[experiment.Stone][experiment.Biome]
	if !ok1 || !ok2 {
		fail("Laboratory database error: missing prompts for biome or stone", nil)
		return
	}
	prompt := fmt.Sprintf(biomePrompt, stonePrompt)
	experiment.PromptAnalyzeUsed = prompt

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

	var usageResp struct {
		Usage struct {
			PromptTokens     int `json:"prompt_tokens"`
			CompletionTokens int `json:"completion_tokens"`
		} `json:"usage"`
	}
	if err := json.Unmarshal(respBody, &usageResp); err == nil {
		if experiment.TokensUsed == nil {
			experiment.TokensUsed = &TokensUsed{}
		}
		experiment.TokensUsed.AnalyzeTextIn = usageResp.Usage.PromptTokens
		experiment.TokensUsed.AnalyzeOut = usageResp.Usage.CompletionTokens
	}

	content := rawResp.Choices[0].Message.Content
	sanitizedJson, err := sanitizeJSON(content)
	if err != nil {
		fail(fmt.Sprintf("Cannot parse analyze report. Raw result: %v", content), err)
		return
	}

	var parsed map[string]any
	if err = json.Unmarshal(sanitizedJson, &parsed); err != nil {
		fail("Failed to parse specimen data", err)
		return
	}
	if maybeError, hasError := parsed["Error"]; hasError {
		fail(fmt.Sprint(maybeError), nil)
		return
	}

	ts.SetProgress(P.Analyzed)

	analyzed := time.Now().UTC()
	experiment.Specimen = sanitizedJson
	experiment.Analyzed = &analyzed

	stats, err := a.db.SelectRarities(context.Background())
	if err != nil {
		fail("cannot select rarities", err)
		return
	}
	experiment.Rarity = stats.PickRarity(experiment.Stone)

	if _, err := a.db.AnalyzeExperiment(context.Background(), experiment); err != nil {
		fail("Database failed to record specimen", err)
		return
	}

	nextTaskId := uuid.NewString()
	nextTs := &TaskStatus{}
	nextTs.SetProgress(50)
	tasks.Store(nextTaskId, nextTs)
	time.AfterFunc(10*time.Minute, func() { tasks.Delete(nextTaskId) })
	go a.generateImage(nextTaskId, parsed, *experiment, userPubKey)

	parsed["rarity"] = experiment.Rarity

	ts.Finish(parsed, nextTaskId)
}

func (a *api) generateImage(taskId string, specimen map[string]any, experiment Experiment, userPubKey string) {

	ctx, cancel := context.WithTimeout(context.Background(), 3*time.Minute)
	defer cancel()

	raw, _ := tasks.Load(taskId)
	ts := raw.(*TaskStatus)

	defer func() {
		if r := recover(); r != nil {
			ts.Fail(fmt.Sprintf("LAB FATAL ERROR: %v", r))
			LogError("API", "Panic in generateImage", fmt.Errorf("%v", r))
		}
	}()

	ts.SetStage(P.Analyzed, P.Generated, AVG_GENERATE_TIME)

	fail := func(msg string, err error) {
		LogError("API", msg, err)
		cancel()
		ts.Fail(msg)
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
	heightInt := h
	weightInt := w

	p := GetActivePrompt()
	prompt := fmt.Sprintf("%s.\n %s", renderDirective, p.PromptGeneration[experiment.Biome])
	experiment.PromptGenerationUsed = prompt

	// ── build OpenAI image request ────────────────────────────────────────────
	var quality string
	if a.cfg.Environment == "dev" {
		quality = "low"
	} else {
		quality = "medium"
	}

	requestBody := map[string]any{
		"model":      "gpt-image-1.5",
		"n":          1,
		"size":       "1024x1024",
		"quality":    quality,
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

	client := &http.Client{Timeout: 120 * time.Second}
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

	var parsedResp struct {
		Data []struct {
			B64JSON string `json:"b64_json"`
		} `json:"data"`
	}
	if err := json.Unmarshal(respBody, &parsedResp); err != nil || len(parsedResp.Data) == 0 {
		fail("invalid OpenAI image response", err)
		return
	}

	var usageResp struct {
		Usage struct {
			InputTokens        int `json:"input_tokens"`
			OutputTokens       int `json:"output_tokens"`
			InputTokensDetails struct {
				TextTokens  int `json:"text_tokens"`
				ImageTokens int `json:"image_tokens"`
			} `json:"input_tokens_details"`
		} `json:"usage"`
	}
	if err := json.Unmarshal(respBody, &usageResp); err == nil {
		if experiment.TokensUsed == nil {
			experiment.TokensUsed = &TokensUsed{}
		}
		experiment.TokensUsed.GenerateTextIn = usageResp.Usage.InputTokens
		experiment.TokensUsed.GenerateImgOut = usageResp.Usage.OutputTokens
	}

	base64Image := parsedResp.Data[0].B64JSON
	generated := time.Now().UTC()

	ts.SetProgress(P.Generated)
	ts.SetStage(P.Generated, P.Finished, AVG_UPLOAD_TIME)

	imageBytes, err := base64.StdEncoding.DecodeString(base64Image)
	if err != nil {
		fail("cannot decode base64 image", err)
		return
	}

	thumbBytes, err := ResizePNG(imageBytes, 400)
	if err != nil {
		fail("cannot resize thumb", err)
		return
	}

	imageKey := fmt.Sprintf("monsters/%s/image.png", experiment.UUID)
	thumbKey := fmt.Sprintf("monsters/%s/thumb.png", experiment.UUID)

	if err = a.r2.Upload(ctx, imageKey, "image/png", imageBytes); err != nil {
		fail("cannot upload image to r2", err)
		return
	}
	if err = a.r2.Upload(ctx, thumbKey, "image/png", thumbBytes); err != nil {
		fail("cannot upload thumb to r2", err)
		return
	}

	experiment.ImageUrl = a.r2.URL(imageKey)
	experiment.ThumbUrl = a.r2.URL(thumbKey)

	ts.SetProgress(P.Uploaded)

	uploaded := time.Now().UTC()
	experiment.Generated = &generated
	experiment.Uploaded = &uploaded

	// ── final cost ────────────────────────────────────────────────────────────
	if experiment.TokensUsed != nil {
		experiment.Cost = experiment.TokensUsed.TotalCost()
	}

	if _, err := a.db.UpdateExperiment(context.Background(), &experiment); err != nil {
		fail("cannot update experiment", err)
		return
	}

	// ── CREATE MONSTER IN DB & TRIGGER BACKGROUND WORKERS ─────────────────────
	txDB, err := a.db.Conn.BeginTx(ctx, nil)
	if err != nil {
		fail("cannot start db transaction", err)
		return
	}
	defer txDB.Rollback()

	globalSerial, byStoneSerial, byBiomeSerial, err := a.db.NextSerials(ctx, txDB, experiment.Stone, experiment.Biome)
	if err != nil {
		fail("cannot get serials", err)
		return
	}

	monster := &Monster{
		ExperimentId:  experiment.Id,
		UserId:        experiment.UserId,
		OwnerAddress:  &userPubKey,
		Name:          name,
		Species:       species,
		Lore:          lore,
		Height:        heightInt,
		Weight:        weightInt,
		MovementClass: movementClass,
		Behaviour:     behaviour,
		Personality:   personality,
		Abilities:     abilities,
		InputUrl:      &experiment.InputUrl,
		ImageUrl:      &experiment.ImageUrl,
		ThumbUrl:      &experiment.ThumbUrl,
		Habitat:       habitat,
		Biome:         experiment.Biome,
		Rarity:        experiment.Rarity,
		Stone:         experiment.Stone,
		SerialNumber:  globalSerial,
		SerialStone:   byStoneSerial,
		SerialBiome:   byBiomeSerial,
		Generation:    1,
		Status:        "active",
	}

	if err := a.db.DecreaseStoneSparksTx(ctx, txDB, monster); err != nil {
		fail("cannot decrease stone sparks", err)
		return
	}

	if err := a.db.InsertMonsterTx(ctx, txDB, monster); err != nil {
		fail("cannot save monster to database", err)
		return
	}

	if err := txDB.Commit(); err != nil {
		fail("cannot commit db transaction", err)
		return
	}

	a.telegram.SendMessage(
		PubChannel,
		"New monster %s has been created.\nBiome: %s\nRarity: %s\nStone: %s",
		monster.Name,
		monster.Biome,
		monster.Rarity,
		monster.Stone,
	)

	go a.mintNFT(monster.Id, base64Image)
	go a.generateSpritesheet(monster.Id, imageBytes)

	ts.Finish(map[string]any{
		"image":        experiment.ThumbUrl,
		"experimentId": experiment.Id,
		"monsterId":    monster.Id,
	}, "")
}

func (a *api) mintNFT(monsterId int, base64Image string) {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Minute)
	defer cancel()

	monster, err := a.db.SelectMonsterById(ctx, monsterId)
	if err != nil {
		LogError("API", fmt.Sprintf("cannot fetch monster %d from db", monsterId), err)
		_ = a.db.IncrementMintRetry(ctx, monsterId, "failed")
		return
	}

	if monster.OwnerAddress == nil || *monster.OwnerAddress == "" {
		LogError("API", fmt.Sprintf("monster %d has no owner address", monsterId), nil)
		_ = a.db.IncrementMintRetry(ctx, monsterId, "failed")
		return
	}

	experiment, err := a.db.SelectExperiment(ctx, strconv.Itoa(monster.ExperimentId))
	if err != nil {
		LogError("API", fmt.Sprintf("cannot fetch experiment for monster %d", monsterId), err)
		_ = a.db.IncrementMintRetry(ctx, monsterId, "failed")
		return
	}

	// 1. Upload image to Pinata
	imageCid, err := uploadImageToPinata(a.cfg.Pinata.PinataToken, base64Image, monster.Name)
	if err != nil {
		LogError("API", fmt.Sprintf("cannot upload image to ipfs for monster %d", monsterId), err)
		_ = a.db.IncrementMintRetry(ctx, monsterId, "failed")
		return
	}

	// 2. Build metadata & upload to Pinata
	metadataBody := map[string]any{
		"name":                    monster.Name,
		"symbol":                  "MON",
		"description":             "d",
		"image":                   fmt.Sprintf("ipfs://%s", imageCid),
		"external_url":            "https://borflab.com/library",
		"seller_fee_basis_points": 0,
		"attributes": []any{
			map[string]string{"trait_type": "Biome", "value": string(monster.Biome)},
			map[string]string{"trait_type": "Rarity", "value": string(monster.Rarity)},
			map[string]string{"trait_type": "Stone", "value": string(monster.Stone)},
		},
		"properties": map[string]any{
			"category":       "image",
			"files":          []map[string]any{{"uri": fmt.Sprintf("ipfs://%s", imageCid), "type": "image/png"}},
			"creators":       []map[string]any{{"address": "dghfghgfh", "share": 100, "verified": true}},
			"species":        monster.Species,
			"lore":           monster.Lore,
			"weight":         strconv.Itoa(monster.Weight),
			"height":         strconv.Itoa(monster.Height),
			"movement_class": monster.MovementClass,
			"behaviour":      monster.Behaviour,
			"personality":    monster.Personality,
			"abilities":      monster.Abilities,
			"habitat":        monster.Habitat,
		},
	}

	metadataCid, err := uploadMetadataToPinata(a.cfg.Pinata.PinataToken, metadataBody)
	if err != nil {
		LogError("API", fmt.Sprintf("cannot upload metadata for monster %d", monsterId), err)
		_ = a.db.IncrementMintRetry(ctx, monsterId, "failed")
		return
	}

	metadataBytes, err := json.Marshal(metadataBody)
	if err != nil {
		LogError("API", fmt.Sprintf("cannot marshal metadata for monster %d", monsterId), err)
		_ = a.db.IncrementMintRetry(ctx, monsterId, "failed")
		return
	}

	uri := fmt.Sprintf("ipfs://%s", metadataCid)

	// Update DB records with CIDs and Metadata
	monster.ImageCid = &imageCid
	monster.MetadataUri = &uri
	if err := a.db.UpdateMonsterCids(ctx, monster.Id, imageCid, uri); err != nil {
		LogError("API", fmt.Sprintf("cannot update monster CIDs in DB for %d", monsterId), err)
	}

	experiment.ImageCid = &imageCid
	experiment.MetadataCid = &metadataCid
	experiment.Metadata = metadataBytes
	if _, err := a.db.FinishExperiment(ctx, experiment); err != nil {
		LogError("API", fmt.Sprintf("cannot update experiment CIDs in DB for %d", monsterId), err)
	}

	// 3. Solana transaction construction
	programId := solana.MustPublicKeyFromBase58(a.cfg.Solana.ProgramId)
	userPubKey := solana.MustPublicKeyFromBase58(*monster.OwnerAddress)
	cardCollectionPubKey := solana.MustPublicKeyFromBase58(a.cfg.Solana.CardCollectionPubKey)
	tokenMetadataProgramId := solana.MustPublicKeyFromBase58(TOKEN_METADATA_PROGRAM_ID)

	cardMintAdminPda, _, _ := solana.FindProgramAddress([][]byte{[]byte("card_mint_admin")}, programId)
	collectionAuthorityPda, _, _ := solana.FindProgramAddress([][]byte{[]byte("collection_authority")}, programId)

	adminPrivateKey := solana.PrivateKey(a.cfg.Solana.SecretKey)
	if err := adminPrivateKey.Validate(); err != nil {
		LogError("API", "invalid admin key", err)
		_ = a.db.IncrementMintRetry(ctx, monsterId, "failed")
		return
	}

	adminAccount, err := a.rpcClient.GetAccountInfoWithOpts(ctx, cardMintAdminPda,
		&rpc.GetAccountInfoOpts{Commitment: rpc.CommitmentConfirmed})
	if err != nil || adminAccount == nil || adminAccount.Value == nil || len(adminAccount.Value.Data.GetBinary()) < 32 {
		LogError("API", fmt.Sprintf("cannot validate admin account for monster %d", monsterId), err)
		_ = a.db.IncrementMintRetry(ctx, monsterId, "failed")
		return
	}

	registeredAdmin := solana.PublicKeyFromBytes(adminAccount.GetBinary()[8:40])
	if !registeredAdmin.Equals(adminPrivateKey.PublicKey()) {
		LogError("API", "unauthorized admin keypair", nil)
		_ = a.db.IncrementMintRetry(ctx, monsterId, "failed")
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
		LogError("MintWorker", "cannot get rent exemption", err)
		_ = a.db.IncrementMintRetry(ctx, monsterId, "failed")
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
		encodeMintSparkCardInstanceData(uri, 12345, experiment.Id),
	)

	createMintAccountIx := system.NewCreateAccountInstruction(
		mintRent, 82, solana.TokenProgramID, adminPrivateKey.PublicKey(), mintPubKey).Build()
	computeBudgetIx := computebudget.NewSetComputeUnitLimitInstruction(400000).Build()

	recent, err := a.rpcClient.GetLatestBlockhash(ctx, rpc.CommitmentFinalized)
	if err != nil {
		LogError("API", "cannot get latest blockhash", err)
		_ = a.db.IncrementMintRetry(ctx, monsterId, "failed")
		return
	}

	tx, err := solana.NewTransaction(
		[]solana.Instruction{computeBudgetIx, createMintAccountIx, mintCardIx},
		recent.Value.Blockhash,
		solana.TransactionPayer(adminPrivateKey.PublicKey()),
	)
	if err != nil {
		LogError("API", "cannot create transaction", err)
		_ = a.db.IncrementMintRetry(ctx, monsterId, "failed")
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
		LogError("API", "cannot sign transaction", err)
		_ = a.db.IncrementMintRetry(ctx, monsterId, "failed")
		return
	}

	// 4. Send transaction to Solana
	sig, err := a.rpcClient.SendTransaction(ctx, tx)
	if err != nil {
		LogError("API", fmt.Sprintf("failed to send transaction for monster %d", monsterId), err)
		_ = a.db.IncrementMintRetry(ctx, monsterId, "failed")
		return
	}

	LogInfo("API", fmt.Sprintf("Transaction sent: %s", sig.String()))
}

func (a *api) generateSpritesheet(monsterId int, initialThumbBytes []byte) {

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Minute)
	defer cancel()

	if err := a.db.UpdateMonsterSpriteStatus(ctx, monsterId, "processing"); err != nil {
		LogError("SpriteWorker", fmt.Sprintf("cannot set processing status for monster %d", monsterId), err)
		return
	}

	monster, err := a.db.SelectMonsterById(ctx, monsterId)
	if err != nil {
		LogError("SpriteWorker", fmt.Sprintf("cannot fetch monster %d", monsterId), err)
		a.failSprite(ctx, monsterId)
		return
	}

	experiment, err := a.db.SelectExperiment(ctx, strconv.Itoa(monster.ExperimentId))
	if err != nil {
		LogError("SpriteWorker", fmt.Sprintf("cannot fetch experiment for monster %d", monsterId), err)
		a.failSprite(ctx, monsterId)
		return
	}

	thumbBytes := initialThumbBytes
	if len(thumbBytes) == 0 {
		if experiment.ThumbUrl == "" {
			LogError("SpriteWorker", fmt.Sprintf("monster %d has no thumb url", monsterId), nil)
			a.failSprite(ctx, monsterId)
			return
		}
		thumbBytes, err = downloadFile(ctx, experiment.ThumbUrl)
		if err != nil {
			LogError("SpriteWorker", "cannot download thumb image from r2", err)
			a.failSprite(ctx, monsterId)
			return
		}
	}

	spriteSheetBytes, err := a.requestSpriteSheetWithRetries(ctx, thumbBytes, monsterId)
	if err != nil {
		LogError("SpriteWorker", "openai generation failed after retries", err)
		a.failSprite(ctx, monsterId)
		return
	}

	debugDir := ""
	if a.cfg.Environment == "dev" {
		debugDir = filepath.Join(os.TempDir(), "sprite-debug", experiment.UUID)
		if err := os.MkdirAll(debugDir, 0755); err == nil {
			_ = os.WriteFile(filepath.Join(debugDir, "raw_sheet.png"), spriteSheetBytes, 0644)
		} else {
			LogError("SpriteWorker", "cannot create debug dir", err)
		}
	}

	sprites, err := processAndCropSprites(spriteSheetBytes, 128, debugDir)
	if err != nil {
		LogError("SpriteWorker", "cannot crop sprites", err)
		a.failSprite(ctx, monsterId)
		return
	}

	idleKey := fmt.Sprintf("monsters/%s/sprites/idle.png", experiment.UUID)
	walkKey := fmt.Sprintf("monsters/%s/sprites/walk.png", experiment.UUID)
	hitKey := fmt.Sprintf("monsters/%s/sprites/hit.png", experiment.UUID)
	avatarKey := fmt.Sprintf("monsters/%s/sprites/avatar.png", experiment.UUID)

	if err := a.r2.Upload(ctx, idleKey, "image/png", sprites.Idle); err != nil {
		LogError("SpriteWorker", "failed to upload idle sprite", err)
		a.failSprite(ctx, monsterId)
		return
	}
	if err := a.r2.Upload(ctx, walkKey, "image/png", sprites.Walk); err != nil {
		LogError("SpriteWorker", "failed to upload walk sprite", err)
		a.failSprite(ctx, monsterId)
		return
	}
	if err := a.r2.Upload(ctx, hitKey, "image/png", sprites.Hit); err != nil {
		LogError("SpriteWorker", "failed to upload hit sprite", err)
		a.failSprite(ctx, monsterId)
		return
	}
	if err := a.r2.Upload(ctx, avatarKey, "image/png", sprites.Avatar); err != nil {
		LogError("SpriteWorker", "failed to upload avatar sprite", err)
		a.failSprite(ctx, monsterId)
		return
	}

	idleUrl := a.r2.URL(idleKey)
	walkUrl := a.r2.URL(walkKey)
	hitUrl := a.r2.URL(hitKey)
	avatarUrl := a.r2.URL(avatarKey)

	// NOTE: UpdateMonsterSpritesSuccess's SET clause should include
	// `sprite_updated = now()` alongside sprite_status = 'ready'.
	if err := a.db.UpdateMonsterSpritesSuccess(ctx, monsterId, idleUrl, walkUrl, hitUrl, avatarUrl); err != nil {
		LogError("SpriteWorker", fmt.Sprintf("cannot update sprite status for monster %d", monsterId), err)
		return
	}

	LogInfo("SpriteWorker", fmt.Sprintf("Successfully processed sprites for monster %d", monsterId))
}

func (a *api) requestSpriteSheet(ctx context.Context, thumbBytes []byte) ([]byte, error) {
	prompt := `You job is to convert the monster in the supplied image into a retro 32-bit-style pixel art on a transparent background. Important is to stay true to the original monster so it is 100% recognisable. Do not add any features.
Preserve its appearance, anatomy, proportions, colours and distinctive features.
Output is a spritesheet containing exactly 3 frames of equal width, arranged left to right with no overlap between frames.
Left to right:
1-IDLE — front-facing, visibly crouched low, body lowered, feet spread wider, ready to dodge.
2-MOVE — the monster is jumping in the left direction.
3-HIT — sitting on the ground, knocked out, visibly dizzy.
 
Technical requirements:
- Do not add text labels, borders, or frame dividers.
- Background must be fully transparent (alpha channel), not white or checkered.
- Each frame's canvas third must contain nothing but the monster — no ground line, no shadow, no props, no scenery, no text labels.
- Center the monster within each frame's third, both horizontally and vertically, with roughly equal empty margin on all sides.
- Keep the monster at the same scale (same maximum height in pixels) across all 3 frames.
- Make each pose clearly distinguishable by silhouette, even at small size.
- No text, props, scenery or added anatomical features.
`

	body := &bytes.Buffer{}
	writer := multipart.NewWriter(body)

	fields := map[string]string{
		"model":         "gpt-image-1.5",
		"prompt":        prompt,
		"n":             "1",
		"size":          "1536x1024",
		"background":    "transparent",
		"output_format": "png",
	}
	for k, v := range fields {
		if err := writer.WriteField(k, v); err != nil {
			return nil, fmt.Errorf("cannot write %s field: %w", k, err)
		}
	}

	h := make(textproto.MIMEHeader)
	h.Set("Content-Disposition", `form-data; name="image"; filename="thumb.png"`)
	h.Set("Content-Type", "image/png")

	part, err := writer.CreatePart(h)
	if err != nil {
		return nil, fmt.Errorf("cannot create form part: %w", err)
	}
	if _, err := part.Write(thumbBytes); err != nil {
		return nil, fmt.Errorf("cannot write image bytes: %w", err)
	}
	if err := writer.Close(); err != nil {
		return nil, fmt.Errorf("cannot close multipart writer: %w", err)
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, OPENAI_EDITS_URL, body)
	if err != nil {
		return nil, fmt.Errorf("cannot create request: %w", err)
	}
	req.Header.Set("Content-Type", writer.FormDataContentType())
	req.Header.Set("Authorization", "Bearer "+a.cfg.OpenAIToken)

	client := &http.Client{Timeout: 120 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return nil, fmt.Errorf("openai request failed: %w", err)
	}
	defer resp.Body.Close()

	respBody, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("cannot read openai response: %w", err)
	}
	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("openai generation failed: status %d: %s", resp.StatusCode, string(respBody))
	}

	var parsedResp struct {
		Data []struct {
			B64JSON string `json:"b64_json"`
		} `json:"data"`
	}
	if err := json.Unmarshal(respBody, &parsedResp); err != nil || len(parsedResp.Data) == 0 {
		return nil, fmt.Errorf("invalid openai image response: %w", err)
	}

	return base64.StdEncoding.DecodeString(parsedResp.Data[0].B64JSON)
}

// requestSpriteSheetWithRetries retries transient OpenAI failures inline
// (timeouts, 5xx, rate limits) before giving up for this invocation. A
// non-transient failure (e.g. bad thumb bytes) will just fail the same way
// on every attempt and burn through the budget quickly, which is fine.
func (a *api) requestSpriteSheetWithRetries(ctx context.Context, thumbBytes []byte, monsterId int) ([]byte, error) {
	var lastErr error
	for attempt := 1; attempt <= spriteInlineMaxAttempts; attempt++ {
		sheet, err := a.requestSpriteSheet(ctx, thumbBytes)
		if err == nil {
			return sheet, nil
		}
		lastErr = err
		LogError("SpriteWorker", fmt.Sprintf("attempt %d/%d failed for monster %d", attempt, spriteInlineMaxAttempts, monsterId), err)

		if attempt == spriteInlineMaxAttempts {
			break
		}
		select {
		case <-ctx.Done():
			return nil, ctx.Err()
		case <-time.After(spriteInlineBackoffBase * time.Duration(attempt)):
		}
	}
	return nil, lastErr
}

func (a *api) failSprite(ctx context.Context, monsterId int) {
	if err := a.db.IncrementSpriteRetry(ctx, monsterId, "failed"); err != nil {
		LogError("SpriteWorker", fmt.Sprintf("cannot record sprite failure for monster %d", monsterId), err)
		return
	}

	monster, err := a.db.SelectMonsterById(ctx, monsterId)
	if err != nil {
		LogError("SpriteWorker", fmt.Sprintf("cannot refetch monster %d after failure", monsterId), err)
		return
	}

	if monster.SpriteRetries >= MaxSpriteRetries {
		// InternalOpsChannel: new const alongside the existing PubChannel,
		// pointed at a private/ops Telegram chat — this alert is not for players.
		a.telegram.SendMessage(
			DevChannel,
			"Sprite generation permanently failed for monster %d after %d attempts. Needs manual look.",
			monsterId,
			monster.SpriteRetries,
		)
	}
}

func (a *api) trackSwapConfirmation(sig solana.Signature, poolCardMintAddress string) {
	ctx, cancel := context.WithTimeout(context.Background(), 3*time.Minute)
	defer cancel()

	ticker := time.NewTicker(3 * time.Second)
	defer ticker.Stop()

	key := sig.String()

	for {
		select {
		case <-ctx.Done():
			swapStatuses.Store(key, &SwapStatus{
				Status: "failed",
				Error:  "confirmation timeout",
			})
			return

		case <-ticker.C:
			statuses, err := a.rpcClient.GetSignatureStatuses(ctx, false, sig)
			if err != nil || statuses == nil || len(statuses.Value) == 0 || statuses.Value[0] == nil {
				continue
			}

			result := statuses.Value[0]

			if result.Err != nil {
				swapStatuses.Store(key, &SwapStatus{
					Status: "failed",
					Error:  fmt.Sprintf("chain error: %v", result.Err),
				})
				return
			}

			confirmed := result.ConfirmationStatus == rpc.ConfirmationStatusConfirmed ||
				result.ConfirmationStatus == rpc.ConfirmationStatusFinalized

			if confirmed {
				swapStatuses.Store(key, &SwapStatus{
					Status:      "confirmed",
					MintAddress: poolCardMintAddress,
				})
				return
			}
		}
	}
}

func (a *api) SwapMonster(w *Responder, r *http.Request) {

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
	monsterCardMint, err := solana.PublicKeyFromBase58(*monster.MintAddress)
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

	swapStatuses.Store(sig.String(), &SwapStatus{
		Status: "pending",
	})

	go a.trackSwapConfirmation(sig, poolCardMint.String())

	response := struct {
		Signature string `json:"signature"`
	}{
		Signature: sig.String(),
	}

	w.Send(response)

}

func (a *api) DebugLog(w *Responder, r *http.Request) {
	type debugLogPayload struct {
		Summary string           `json:"summary"`
		UA      string           `json:"ua"`
		Meta    map[string]any   `json:"meta"`
		Entries []map[string]any `json:"entries"`
	}

	var payload debugLogPayload
	if err := ParseBody(r, &payload); err != nil {
		a.BadRequestError(w, err)
		return
	}

	lines := make([]string, 0, len(payload.Entries))
	for _, e := range payload.Entries {
		t, _ := e["t"].(float64)
		event, _ := e["event"].(string)
		level, _ := e["level"].(string)

		icon := "·"
		if level == "error" {
			icon = "🔴"
		} else if level == "warn" {
			icon = "🟡"
		}

		ts := ""
		if t > 0 {
			ts = time.UnixMilli(int64(t)).UTC().Format("15:04:05")
		}

		rest := make(map[string]any)
		for k, v := range e {
			if k != "t" && k != "event" && k != "level" {
				rest[k] = v
			}
		}

		extra := ""
		if len(rest) > 0 {
			if b, err := json.Marshal(rest); err == nil {
				extra = " " + string(b)
			}
		}

		lines = append(lines, fmt.Sprintf("%s %s %s%s", icon, ts, event, extra))
	}

	durationSec := 0.0
	if ms, ok := payload.Meta["duration_ms"].(float64); ok {
		durationSec = ms / 1000
	}

	logText := strings.Join(lines, "\n")
	if len(lines) == 0 {
		logText = "No errors"
	}

	a.telegram.SendMessage(PubChannel, "🐛 %s\nevents: %v\nduration: %.1fs\nUA: %s\n\n%s\n",
		payload.Summary,
		payload.Meta["total_events"],
		durationSec,
		payload.UA,
		logText)

	w.Send(struct{ Ok bool }{Ok: true})
}

// ── helpers ───────────────────────────────────────────────────────────────────

func parseSlotN(r *http.Request) (int, bool) {
	n, err := strconv.Atoi(Params(r)["n"])
	if err != nil || n < 1 || n > 5 {
		return 0, false
	}
	return n, true
}

// ── GET /api/dashboard/prompts ────────────────────────────────────────────────

func (a *api) GetAdminPrompts(w *Responder, r *http.Request) {
	ctx := r.Context()

	slots, err := a.db.SelectPrompts(ctx)
	if err != nil {
		a.DbError(w, err)
		return
	}

	// активный — слот 0, остальные — пресеты 1-5
	var active *Prompt
	var presets []Prompt
	for _, s := range slots {
		s := s
		if s.Slot == 0 {
			active = &s
		} else {
			presets = append(presets, s)
		}
	}

	w.Send(struct {
		Active  *Prompt
		Presets []Prompt
	}{
		Active:  active,
		Presets: presets,
	})
}

// ── PUT /api/dashboard/prompts/active ────────────────────────────────────────

func (a *api) SaveActivePrompt(w *Responder, r *http.Request) {
	ctx := r.Context()

	var form savePromptSlotForm
	if err := ParseBody(r, &form); err != nil {
		a.BadRequestError(w, err)
		return
	}

	if err := a.db.UpsertPrompt(ctx, 0, form.Name, form.Payload); err != nil {
		a.DbError(w, err)
		return
	}

	if err := ReloadActivePrompt(ctx, a.db); err != nil {
		a.InternalError(w, err)
		return
	}

	w.Send(struct{ Ok bool }{Ok: true})
}

// ── PUT /api/dashboard/prompts/slots/:n ──────────────────────────────────────

type savePromptSlotForm struct {
	Name    string
	Payload PromptPayload
}

func (a *api) SavePrompt(w *Responder, r *http.Request) {
	ctx := r.Context()

	n, ok := parseSlotN(r)
	if !ok {
		a.BadRequestError(w, fmt.Errorf("slot must be 1-5"))
		return
	}

	var form savePromptSlotForm
	if err := ParseBody(r, &form); err != nil {
		a.BadRequestError(w, err)
		return
	}

	if err := a.db.UpsertPrompt(ctx, n, form.Name, form.Payload); err != nil {
		a.DbError(w, err)
		return
	}

	w.Send(struct{ Ok bool }{Ok: true})
}

// ── POST /api/dashboard/prompts/slots/:n/activate ────────────────────────────

func (a *api) ActivatePrompt(w *Responder, r *http.Request) {
	ctx := r.Context()

	n, ok := parseSlotN(r)
	if !ok {
		a.BadRequestError(w, fmt.Errorf("slot must be 1-5"))
		return
	}

	if err := a.db.ActivatePrompt(ctx, n); err != nil {
		a.DbError(w, err)
		return
	}

	if err := ReloadActivePrompt(ctx, a.db); err != nil {
		a.InternalError(w, err)
		return
	}

	w.Send(struct{ Ok bool }{Ok: true})
}

// ── DELETE /api/dashboard/prompts/slots/:n ───────────────────────────────────

func (a *api) ClearPrompt(w *Responder, r *http.Request) {
	ctx := r.Context()

	n, ok := parseSlotN(r)
	if !ok {
		a.BadRequestError(w, fmt.Errorf("slot must be 1-5"))
		return
	}

	if err := a.db.ClearPrompt(ctx, n); err != nil {
		a.DbError(w, err)
		return
	}

	w.Send(struct{ Ok bool }{Ok: true})
}

func (a *api) GenerateTest(w *Responder, r *http.Request) {
	ctx := r.Context()
	claims, _ := Claims(r)
	taskID := uuid.NewString()

	ts := &TaskStatus{}
	ts.SetStage(P.Started, P.Analyzed, AVG_ANALYZE_TIME)
	tasks.Store(taskID, ts)
	time.AfterFunc(10*time.Minute, func() { tasks.Delete(taskID) })

	stoneType := StoneType(r.FormValue("stone"))
	if stoneType == "" {
		a.BadRequestError(w, fmt.Errorf("stone is required"))
		return
	}

	biome, err := CheckBiome(r.FormValue("biome"))
	if err != nil || biome == nil {
		a.BadRequestError(w, err)
		return
	}

	quality := r.FormValue("quality")
	if quality == "" {
		quality = "low"
	}

	size := r.FormValue("size")
	if size == "" {
		size = "1024x1024"
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

	analysisImg, err := ResizeJPEG(imgBytes, 1024)
	if err != nil {
		a.InternalError(w, err)
		return
	}

	expUUID := uuid.NewString()
	inputKey := fmt.Sprintf("test/%s/input.jpg", expUUID)

	if err := a.r2.Upload(ctx, inputKey, "image/jpeg", storageImg); err != nil {
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
		Stone:       stoneType,
		Biome:       *biome,
		IsTest:      true,
		Quality:     quality,
		Size:        size,
	}

	insertedExperiment, err := a.db.InsertExperiment(ctx, experiment)
	if err != nil {
		a.DbError(w, fmt.Errorf("cannot insert experiment: %v", err))
		return
	}

	go a.processImage(taskID, analysisImg, insertedExperiment, "dfgdfg")

	w.Send(struct{ Id string }{Id: taskID})
}

// ── GET /api/dashboard/experiments ───────────────────────────────────────────

func (a *api) GetAdminExperiments(w *Responder, r *http.Request) {
	ctx := r.Context()
	query := r.URL.Query()

	page := ParseInt(query.Get("page"), 1, 1, 1000)
	limit := ParseInt(query.Get("limit"), 24, 1, 100)
	offset := (page - 1) * limit

	parseList := func(key string) []string {
		v := query.Get(key)
		if v == "" {
			return nil
		}
		var result []string
		for _, s := range strings.Split(v, ",") {
			s = strings.TrimSpace(s)
			if s != "" {
				result = append(result, s)
			}
		}
		return result
	}

	opts := ExperimentFilter{
		OnlyTest:  query.Get("only_test") != "false",
		Stones:    parseList("stones"),
		Biomes:    parseList("biomes"),
		Qualities: parseList("qualities"),
		Rarities:  parseList("rarities"),
		Sort:      query.Get("sort"),
		Order:     query.Get("order"),
		Limit:     limit,
		Offset:    offset,
	}

	experiments, total, err := a.db.SelectAdminExperiments(ctx, opts)
	if err != nil {
		a.DbError(w, err)
		return
	}

	pages := 0
	if total > 0 {
		pages = (total + limit - 1) / limit
	}

	w.Send(struct {
		Experiments []Experiment
		Total       int
		Pages       int
	}{
		Experiments: experiments,
		Total:       total,
		Pages:       pages,
	})
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

func (a *api) NotFoundError(w *Responder) {
	w.SendNotFound()
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
