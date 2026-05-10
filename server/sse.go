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
	mu sync.RWMutex

	progress   int
	done       bool
	failed     bool
	errMsg     string
	result     any
	nextTaskId string

	stageStarted  time.Time
	stageFrom     int
	stageTo       int
	stageDuration float64
}

func (ts *TaskStatus) SetStage(from, to int, duration float64) {
	ts.mu.Lock()
	defer ts.mu.Unlock()
	ts.stageFrom = from
	ts.stageTo = to
	ts.stageDuration = duration
	ts.stageStarted = time.Now()
}

func (ts *TaskStatus) SetProgress(p int) {
	ts.mu.Lock()
	defer ts.mu.Unlock()
	ts.progress = p
}

func (ts *TaskStatus) Finish(result any, nextTaskId string) {
	ts.mu.Lock()
	defer ts.mu.Unlock()
	ts.result = result
	ts.nextTaskId = nextTaskId
	ts.done = true
}

func (ts *TaskStatus) Fail(msg string) {
	ts.mu.Lock()
	defer ts.mu.Unlock()
	ts.failed = true
	ts.errMsg = msg
	ts.done = true
}

func (ts *TaskStatus) Snapshot() map[string]any {
	ts.mu.RLock()
	defer ts.mu.RUnlock()
	return map[string]any{
		"progress":   ts.computeProgressLocked(),
		"done":       ts.done,
		"failed":     ts.failed,
		"error":      ts.errMsg,
		"result":     ts.result,
		"nextTaskId": ts.nextTaskId,
	}
}

// вызывать только под RLock
func (ts *TaskStatus) computeProgressLocked() int {
	if ts.done {
		return ts.stageTo
	}
	elapsed := time.Since(ts.stageStarted).Seconds()
	from := float64(ts.stageFrom)
	to := float64(ts.stageTo)
	t := elapsed / ts.stageDuration
	raw := from + (to-from)*t
	capped := math.Min(raw, to-2)
	jitter := rand.Float64()
	result := int(capped + jitter)
	if result < ts.stageFrom {
		return ts.stageFrom
	}
	if result >= ts.stageTo {
		return ts.stageTo - 1
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
