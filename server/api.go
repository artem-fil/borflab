package main

import (
	"bytes"
	"context"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"io"
	"math/rand"
	"mime/multipart"
	"net/http"
	"strings"
	"sync"
	"time"

	"github.com/google/uuid"
)

const (
	OpenAICompletionURL = "https://api.openai.com/v1/chat/completions"
	OpenAIGenerationURL = "https://api.openai.com/v1/images/generations"
	PinataPinFileUrl    = "https://api.pinata.cloud/pinning/pinFileToIPFS"
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

	wallet, _ := claims.Wallet()

	go a.processImage(taskID, resizedImg, insertedExperiment.Id, wallet)

	response := struct {
		Id string
	}{
		Id: taskID,
	}
	w.Send(response)
}

func (a *api) processImage(taskID string, imgBytes []byte, experimentId int, wallet string) {

	update := func(p int) {
		if t, ok := tasks.Load(taskID); ok {
			t.(*TaskStatus).Progress = p
		}
	}
	fail := func(msg string, err error) {
		if task, ok := tasks.Load(taskID); ok {
			LogError("API", msg, err)
			if t, ok := task.(*TaskStatus); ok {
				t.Error = msg
				t.Done = true
				t.Progress = 100
			} else {
				LogError("API", "cannot cast TaskStatus", err)
			}
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

		_, err = a.db.AnalyzeExperiment(context.Background(), &experiment)
		if err != nil {
			fail("cannot continue experiment", err)
			return
		}

		t.(*TaskStatus).Progress = 100
		t.(*TaskStatus).Result = parsed

		prompt, promptOk := parsed["RENDER_DIRECTIVE"]
		profile, profileOk := parsed["MONSTER_PROFILE"].(map[string]any)
		name, nameOk := profile["name"]

		if promptOk && profileOk && nameOk {
			nextTask := uuid.NewString()
			tasks.Store(nextTask, &TaskStatus{
				Progress: 0,
				Done:     false,
			})
			t.(*TaskStatus).NextTaskId = nextTask
			go a.generateImage(nextTask, prompt.(string), name.(string), experimentId, wallet)
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

func (a *api) Mint(w *Responder, r *http.Request) {
	taskId := Param(r)

	if t, ok := tasks.Load(taskId); ok {
		if task, ok := t.(*TaskStatus); ok {
			if task.Done != true {
				a.InternalError(w, fmt.Errorf("task %v is not done", taskId))
				return
			}

			if base64Image, ok := task.Result.(string); ok && base64Image != "" {
				imageCid, err := uploadImageToPinata(a.cfg.Api.PinataToken, base64Image, name)
				if err != nil {
					a.InternalError(w, fmt.Errorf("cannot upload image to ipfs", err))
					return
				}
				metadata := map[string]any{
					"name":   name,
					"symbol": "MON",
					"image":  fmt.Sprintf("ipfs://%s", imageCid),
					"properties": map[string]any{
						"creators": []map[string]any{
							{
								"address":  a.cfg.Privy.Wallet,
								"share":    90,
								"verified": true,
							},
							{
								"address":  userWallet,
								"share":    10,
								"verified": false,
							},
						},
						"files": []map[string]any{
							{
								"uri":  fmt.Sprintf("ipfs://%s", imageCid),
								"type": "image/png",
							},
						},
					},
				}

				metadataCid, err := uploadMetadataToPinata(a.cfg.Api.PinataToken, metadata)
				if err != nil {
					a.InternalError(w, fmt.Errorf("cannot upload metadata to ipfs", err))
					return
				}

				uploaded := time.Now().UTC()
				experiment := Experiment{
					Id:                experimentId,
					OutputImageCid:    imageCid,
					OutputMetadataCid: metadataCid,
					Uploaded:          &uploaded,
				}

				_, err = a.db.UploadExperiment(context.Background(), &experiment)
				if err != nil {
					a.DbError(w, fmt.Errorf("cannot update experiment", err))
					return
				}
			} else {
				a.InternalError(w, fmt.Errorf("task %v result is invalid", taskId))
				return
			}

		} else {
			a.InternalError(w, fmt.Errorf("cannot cast %v into TaskStatus", taskId))
			return
		}
	} else {
		a.InternalError(w, fmt.Errorf("cannot find task %v", taskId))
	}
}

func (a *api) generateImage(taskID string, prompt string, name string, experimentId int) {

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
		"model":      "gpt-image-1",
		"n":          1,
		"size":       "1024x1536",
		"quality":    "medium",
		"prompt":     prompt,
		"moderation": "low",
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
	go simulateProgress(taskID, 2, 99, 50*time.Second, doneChan)

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

	if t, ok := tasks.Load(taskID); ok {

		var parsed struct {
			Data []struct {
				B64JSON string `json:"b64_json"`
			} `json:"data"`
		}

		err := json.Unmarshal(respBody, &parsed)
		if err != nil {
			t.(*TaskStatus).Error = "invalid json result"
			return
		}

		if len(parsed.Data) > 0 {
			base64Image := parsed.Data[0].B64JSON

			generated := time.Now().UTC()
			experiment := Experiment{
				Id:        experimentId,
				Generated: &generated,
			}

			_, err = a.db.GenerateExperiment(context.Background(), &experiment)
			if err != nil {
				fail("cannot generate experiment", err)
				return
			}

			t.(*TaskStatus).Result = base64Image
			t.(*TaskStatus).Progress = 100
		} else {
			fail("cannot render result", nil)
			return
		}
		t.(*TaskStatus).Done = true
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

	req, err := http.NewRequest("POST", PinataPinFileUrl, body)
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
		return "", fmt.Errorf("Pinata API refused %d: %s", resp.StatusCode, string(respBody))
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

	req, err := http.NewRequest("POST", PinataPinFileUrl, body)
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
		return "", fmt.Errorf("Pinata API refused %d: %s", resp.StatusCode, string(respBody))
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
