package main

import (
	"context"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"
	"sync"
	"time"
)

type ChannelType int

const (
	DevChannel ChannelType = iota
	PubChannel
)

type Telegram struct {
	config TelegramConfig
	client *http.Client

	env string

	mu       sync.Mutex
	lastText string
	sentAt   time.Time
	cooldown time.Duration
}

func NewTelegram(cfg TelegramConfig, env string) *Telegram {
	if !cfg.Enabled {
		LogWarning("Telegram", "Notifications are disabled")
	}

	client := &http.Client{
		Timeout: 10 * time.Second,
	}

	return &Telegram{
		config:   cfg,
		client:   client,
		env:      env,
		cooldown: 5 * time.Second,
	}
}

func (t *Telegram) SendMessage(channelType ChannelType, format string, args ...any) {
	if !t.config.Enabled {
		return
	}

	messageText := fmt.Sprintf(format, args...)

	var chatID, fullText, parseMode string
	switch channelType {
	case DevChannel:
		chatID = t.config.DevChannel
		fullText = fmt.Sprintf("```server:%s\n%s```", t.env, messageText)
		parseMode = "Markdown"
	case PubChannel:
		chatID = t.config.DevChannel
		fullText = messageText
		parseMode = ""
	default:
		LogError("Telegram", "Cannot send message", fmt.Errorf("unknown channel type '%v'", channelType))
		return
	}

	t.mu.Lock()
	if t.lastText == fullText && time.Since(t.sentAt) < t.cooldown {
		t.mu.Unlock()
		LogWarning("Telegram", "message skipped due to cooldown")
		return
	}
	t.lastText = fullText
	t.sentAt = time.Now()
	t.mu.Unlock()

	go func(chatID, fullText, parseMode string) {
		defer func() {
			if r := recover(); r != nil {
				LogError("Telegram", "Panic recovered in goroutine", fmt.Errorf("%v", r))
			}
		}()

		ctx := context.Background()

		if err := t.sendRequest(ctx, chatID, fullText, parseMode); err != nil {
			LogError("Telegram", "Cannot send message", err)
		}
	}(chatID, fullText, parseMode)
}

func (t *Telegram) sendRequest(ctx context.Context, chatID, text, parseMode string) error {
	apiURL := fmt.Sprintf("https://api.telegram.org/bot%s/sendMessage", t.config.Token)

	form := url.Values{}
	form.Set("chat_id", chatID)
	form.Set("text", text)
	if parseMode != "" {
		form.Set("parse_mode", parseMode)
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, apiURL, strings.NewReader(form.Encode()))
	if err != nil {
		return err
	}
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")

	resp, err := t.client.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(resp.Body)
		return fmt.Errorf("telegram API error. Status: %s. Response: %s", resp.Status, string(body))
	}

	return nil
}
