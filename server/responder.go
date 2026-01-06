package main

import (
	"bytes"
	"encoding/json"
	"net/http"
)

type Responder struct {
	http.ResponseWriter
	StatusCode int
	UserId     string
}

type ResponseError struct {
	Error string `json:"error"`
}

func (rw *Responder) JSON(v any, status int) {
	var buf bytes.Buffer
	if err := json.NewEncoder(&buf).Encode(v); err != nil {
		LogError("Responder", "JSON encoding failed", err)
		rw.Header().Set("Content-Type", "application/json")
		rw.WriteHeader(http.StatusInternalServerError)
		_, _ = rw.Write([]byte(`{"error":"Internal server error"}`))
		return
	}

	rw.Header().Set("Content-Type", "application/json")
	rw.WriteHeader(status)
	if _, err := buf.WriteTo(rw); err != nil {
		LogError("Responder", "Failed to write JSON to client", err)
	}
}

func (rw *Responder) Flush() {
	if f, ok := rw.ResponseWriter.(http.Flusher); ok {
		f.Flush()
	}
}

func (rw *Responder) Send(data any) {
	rw.JSON(data, http.StatusOK)
}

func (rw *Responder) SendCreated(data any) {
	rw.JSON(data, http.StatusCreated)
}

func (rw *Responder) SendNoContent() {
	rw.Header().Del("Content-Type")
	rw.StatusCode = http.StatusNoContent
	rw.WriteHeader(http.StatusNoContent)
}

func (rw *Responder) sendError(code int, msg ...string) {
	text := http.StatusText(code)
	if len(msg) > 0 && msg[0] != "" {
		text = msg[0]
	}
	rw.StatusCode = code
	rw.JSON(ResponseError{Error: text}, code)
}

func (rw *Responder) SendInternalError(msg ...string) {
	rw.sendError(http.StatusInternalServerError, msg...)
}
func (rw *Responder) SendBadRequest(msg ...string) {
	rw.sendError(http.StatusBadRequest, msg...)
}
func (rw *Responder) SendUnauthorized(msg ...string) {
	rw.sendError(http.StatusUnauthorized, msg...)
}
func (rw *Responder) SendForbidden(msg ...string) {
	rw.sendError(http.StatusForbidden, msg...)
}
func (rw *Responder) SendNotFound(msg ...string) {
	rw.sendError(http.StatusNotFound, msg...)
}

func (rw *Responder) InitSSE() {
	h := rw.Header()

	h.Set("Content-Type", "text/event-stream")
	h.Set("Cache-Control", "no-cache")
	h.Set("Connection", "keep-alive")
	h.Set("X-Accel-Buffering", "no")

	rw.WriteHeader(http.StatusOK)

	if _, ok := rw.ResponseWriter.(http.Flusher); !ok {
		LogError("Responder", "response writer does not support flushing", nil)
	}
}

func (rw *Responder) SendSSE(event string, data any) error {
	var payload []byte

	switch v := data.(type) {
	case []byte:
		payload = v
	default:
		var err error
		payload, err = json.Marshal(v)
		if err != nil {
			return err
		}
	}

	if event != "" {
		if _, err := rw.Write([]byte("event: " + event + "\n")); err != nil {
			return err
		}
	}

	if _, err := rw.Write([]byte("data: ")); err != nil {
		return err
	}
	if _, err := rw.Write(payload); err != nil {
		return err
	}
	if _, err := rw.Write([]byte("\n\n")); err != nil {
		return err
	}

	rw.Flush()
	return nil
}
