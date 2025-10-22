package main

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"math/rand"
	"net/http"
	"strings"
	"sync"
	"time"

	"github.com/google/uuid"
)

const (
	OpenAICompletionURL = "https://api.openai.com/v1/chat/completions"
	OpenAIGenerationURL = "https://api.openai.com/v1/images/generations"
)

var (
	tasks = sync.Map{}
)

type TaskStatus struct {
	Progress   int    `json:"progress"`
	Done       bool   `json:"done"`
	Error      string `json:"error,omitempty"`
	Result     any    `json:"result,omitempty"`
	NextTaskId string `json:"nextTask,omitempty"`
}

type api struct {
	cfg      *Config
	db       *DB
	telegram *Telegram
}

func NewApi(cfg *Config, db *DB, telegram *Telegram) *api {
	return &api{cfg, db, telegram}
}

func (a *api) Ping(rw *Responder, r *http.Request) {

	fmt.Fprint(rw, "pong")
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
	if maybeWallet, ok := claims.Wallet(); ok {
		user.Wallet = maybeWallet
	}

	syncedUser, err := a.db.UpsertUser(ctx, &user)
	if err != nil {
		a.DbError(w, err)
		return
	}
	w.Send(syncedUser)
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

	claims, _ := Claims(r)
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
		Created:         time.Now().UTC(),
	}
	insertedExperiment, err := a.db.InsertExperiment(r.Context(), experiment)
	if err != nil {
		a.DbError(w, fmt.Errorf("cannot insert experiment %v", err))
		return
	}

	go a.processImage(taskID, resizedImg, insertedExperiment.Id)

	response := struct {
		Id string
	}{
		Id: taskID,
	}
	w.Send(response)
}

func (a *api) processImage(taskID string, imgBytes []byte, experimentId int) {

	update := func(p int) {
		if t, ok := tasks.Load(taskID); ok {
			t.(*TaskStatus).Progress = p
		}
	}
	fail := func(msg string, err error) {
		if t, ok := tasks.Load(taskID); ok {
			LogError("API", msg, err)
			t.(*TaskStatus).Error = msg
			t.(*TaskStatus).Done = true
			t.(*TaskStatus).Progress = 100
		}
	}

	requestBody := map[string]any{
		"model": "gpt-4o",
		"messages": []map[string]any{
			{
				"role": "system",
				"content": []any{
					map[string]any{
						"type": "text",
						"text": Prompts[AnalyzeSpecimen],
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

	update(1)

	req, err := http.NewRequest(
		http.MethodPost,
		OpenAICompletionURL,
		bytes.NewReader(bodyBytes),
	)
	if err != nil {
		fail("cannot create request", err)
		return
	}

	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+a.cfg.OpenAIToken)

	doneChan := make(chan struct{})
	go simulateProgress(taskID, 2, 98, 40*time.Second, doneChan)

	client := &http.Client{}
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
		fail("OpenAI API refused", fmt.Errorf("status %d: %s", resp.StatusCode, string(respBody)))
		return
	}
	close(doneChan)
	update(99)

	var rawResp struct {
		Choices []struct {
			Message struct {
				Content string `json:"content"`
			} `json:"message"`
		} `json:"choices"`
	}

	err = json.Unmarshal(respBody, &rawResp)
	if err != nil {
		fail("cannot parse OpenAI response", err)
		return
	}

	sanitizedJson, err := sanitizeJSON(rawResp.Choices[0].Message.Content)
	if err != nil {
		fail("malformed json response", err)
		return
	}

	if t, ok := tasks.Load(taskID); ok {
		t.(*TaskStatus).Done = true
		var parsed map[string]any
		err := json.Unmarshal(sanitizedJson, &parsed)
		if err != nil {
			t.(*TaskStatus).Error = "invalid json result"
			return
		}

		maybeError, hasError := parsed["Error"]
		if hasError {
			t.(*TaskStatus).Error = maybeError.(string)
			return
		}

		analyzed := time.Now().UTC()
		experiment := Experiment{
			Id:       experimentId,
			Specimen: sanitizedJson,
			Analyzed: &analyzed,
		}

		_, err = a.db.UpdateExperiment(context.Background(), &experiment)
		if err != nil {
			fail("cannot continue experiment", nil)
			return
		}

		t.(*TaskStatus).Progress = 100
		t.(*TaskStatus).Result = parsed

		if prompt, ok := parsed["RENDER_DIRECTIVE"]; ok {
			t.(*TaskStatus).NextTaskId = uuid.NewString()
			go a.generateImage(taskID, prompt.(string), experimentId)
		} else {
			fail("cannot get render directive", nil)
			return
		}
	}
}

func (a *api) Progress(w *Responder, r *http.Request) {
	taskId := Param(r)

	if task, ok := tasks.Load(taskId); ok {
		w.Send(task)
	} else {
		a.InternalError(w, fmt.Errorf("cannot find task %v", taskId))
	}
}

func (a *api) generateImage(taskID string, prompt string, experimentId int) {

	update := func(p int) {
		if t, ok := tasks.Load(taskID); ok {
			t.(*TaskStatus).Progress = p
		}
	}
	fail := func(msg string, err error) {
		if t, ok := tasks.Load(taskID); ok {
			LogError("API", msg, err)
			t.(*TaskStatus).Error = msg
			t.(*TaskStatus).Done = true
			t.(*TaskStatus).Progress = 100
		}
	}

	requestBody := map[string]any{
		"model":           "gpt-image-1",
		"n":               1,
		"size":            "1024x1536",
		"quality":         "medium",
		"prompt":          prompt,
		"response_format": "url",
	}

	bodyBytes, err := json.Marshal(requestBody)
	if err != nil {
		fail("cannot marshal json", err)
		return
	}

	update(1)

	req, err := http.NewRequest(
		http.MethodPost,
		OpenAIGenerationURL,
		bytes.NewReader(bodyBytes),
	)
	if err != nil {
		fail("cannot create request", err)
		return
	}

	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+a.cfg.OpenAIToken)

	doneChan := make(chan struct{})
	go simulateProgress(taskID, 2, 98, 60*time.Second, doneChan)

	client := &http.Client{}
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
		fail("OpenAI API refused", fmt.Errorf("status %d: %s", resp.StatusCode, string(respBody)))
		return
	}
	close(doneChan)
	update(99)

	if t, ok := tasks.Load(taskID); ok {
		t.(*TaskStatus).Done = true

		var parsed struct {
			Data []struct {
				URL string `json:"url"`
			} `json:"data"`
		}

		err := json.Unmarshal(respBody, &parsed)
		if err != nil {
			t.(*TaskStatus).Error = "invalid json result"
			return
		}

		t.(*TaskStatus).Progress = 100
		if len(parsed.Data) > 0 {
			imageURL := parsed.Data[0].URL

			finished := time.Now().UTC()
			experiment := Experiment{
				Id:          experimentId,
				OutputImage: imageURL,
				Finished:    &finished,
			}
			_, err = a.db.UpdateExperiment(context.Background(), &experiment)
			if err != nil {
				fail("cannot finish experiment", nil)
				return
			}
			t.(*TaskStatus).Result = imageURL
		} else {
			fail("cannot get render directive", nil)
			return
		}
	}
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

	return parts[1]
}

func simulateProgress(taskID string, from, to int, duration time.Duration, done <-chan struct{}) {
	totalSteps := to - from
	if totalSteps <= 0 {
		return
	}

	stepInterval := duration / time.Duration(totalSteps)

	current := from
	r := rand.New(rand.NewSource(time.Now().UnixNano()))

	for current < to {
		select {
		case <-done:
			return
		case <-time.After(stepInterval + time.Duration(r.Intn(500)-100)*time.Millisecond):
			current += r.Intn(4) + 1
			if current > to {
				current = to
			}

			if t, ok := tasks.Load(taskID); ok {
				t.(*TaskStatus).Progress = current
			}
		}
	}
}
