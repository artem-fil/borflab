package main

import (
	"fmt"
	"time"

	"github.com/gorilla/websocket"
)

type SolanaListener struct {
	ProgramID string
	callback  func(msg string)
	ws        *websocket.Conn
}

func NewSolanaListener(programID string, callback func(msg string)) *SolanaListener {
	sl := &SolanaListener{
		ProgramID: programID,
		callback:  callback,
	}
	go sl.listenLogs()
	return sl
}

func (sl *SolanaListener) listenLogs() {
	cluster := "wss://api.devnet.solana.com/"
	backoff := 1 * time.Second
	for {
		if err := sl.connectAndListen(cluster); err != nil {
			LogError("Solana", "connection error", err)
			time.Sleep(backoff)
			if backoff < 30*time.Second {
				backoff *= 2
			}
		} else {
			backoff = 1 * time.Second
		}
	}
}

func (sl *SolanaListener) connectAndListen(cluster string) error {
	c, _, err := websocket.DefaultDialer.Dial(cluster, nil)
	if err != nil {
		return err
	}
	sl.ws = c
	defer sl.ws.Close()

	subMsg := map[string]any{
		"jsonrpc": "2.0",
		"id":      1,
		"method":  "logsSubscribe",
		"params": []any{
			map[string]any{
				"mentions": []string{sl.ProgramID},
			},
			map[string]any{
				"commitment": "confirmed",
			},
		},
	}

	if err := sl.ws.WriteJSON(subMsg); err != nil {
		return err
	}

	LogInfo("Solana", fmt.Sprintf("Subscribed to logs for program %s", sl.ProgramID))

	pingTicker := time.NewTicker(19 * time.Second)
	defer pingTicker.Stop()

	go func() {
		for range pingTicker.C {
			if err := sl.ws.WriteMessage(websocket.PingMessage, []byte{}); err != nil {
				LogError("Solana", "ping error", err)
				return
			}
		}
	}()

	for {
		_, message, err := sl.ws.ReadMessage()
		if err != nil {
			return err
		}

		msgStr := string(message)
		if sl.callback != nil {
			sl.callback(msgStr)
		} else {
			LogInfo("Solana", msgStr)
		}
	}
}
