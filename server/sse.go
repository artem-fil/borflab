package main

import (
	"math"
	"math/rand"
	"sync"
	"time"
)

type SSEMessage struct {
	Event string `json:"event"`
	Data  any    `json:"data,omitempty"`
}

type subscription struct {
	key  string
	conn chan SSEMessage
}
type SSEAgent struct {
	sync.RWMutex
	subs map[string][]*subscription
}

type TaskStatus struct {
	Progress      int    `json:"progress"`
	Done          bool   `json:"done"`
	Failed        bool   `json:"failed"`
	Error         string `json:"error,omitempty"`
	Result        any    `json:"result,omitempty"`
	StageStarted  time.Time
	StageFrom     int
	StageTo       int
	StageDuration float64 // секунд
	NextTaskId    string  `json:"nextTaskId,omitempty"`
}

func (ts *TaskStatus) SetStage(from, to int, durationSec float64) {
	ts.StageFrom = from
	ts.StageTo = to
	ts.StageDuration = durationSec
	ts.StageStarted = time.Now()
}

func (ts *TaskStatus) ComputeProgress() int {
	if ts.Done {
		return ts.StageTo
	}

	elapsed := time.Since(ts.StageStarted).Seconds()

	from := float64(ts.StageFrom)
	to := float64(ts.StageTo)
	t := elapsed / ts.StageDuration

	raw := from + (to-from)*t

	capped := math.Min(raw, to-2)

	// ±1% jitter
	jitter := rand.Float64()

	result := int(capped + jitter)

	if result < ts.StageFrom {
		return ts.StageFrom
	}
	if result >= ts.StageTo {
		return ts.StageTo - 1
	}
	return result
}

type Task struct {
	Status *TaskStatus
}

func NewSSEAgent() *SSEAgent {
	return &SSEAgent{
		subs: make(map[string][]*subscription),
	}
}

func (a *SSEAgent) Subscribe(key string) *subscription {
	sub := &subscription{
		key:  key,
		conn: make(chan SSEMessage, 16),
	}

	a.Lock()
	a.subs[key] = append(a.subs[key], sub)
	a.Unlock()

	return sub
}

func (a *SSEAgent) Unsubscribe(sub *subscription) {
	a.Lock()
	defer a.Unlock()

	subs := a.subs[sub.key]
	for i, s := range subs {
		if s == sub {
			a.subs[sub.key] = append(subs[:i], subs[i+1:]...)
			break
		}
	}
	if len(a.subs[sub.key]) == 0 {
		delete(a.subs, sub.key)
	}
	close(sub.conn)
}

func (a *SSEAgent) Emit(key, event string, data any) {
	a.RLock()
	subs := a.subs[key]
	a.RUnlock()

	msg := SSEMessage{
		Event: event,
		Data:  data,
	}
	for _, sub := range subs {
		select {
		case sub.conn <- msg:
		default:
		}
	}
}
