package main

import (
	"encoding/json"
	"sync"
)

type SSEMessage struct {
	Status string
	Data   map[string]any
}

type subscription struct {
	txid string
	conn chan SSEMessage
}

type SSEAgent struct {
	sync.RWMutex
	subscriptions map[string][]*subscription
}

func NewSSEAgent() *SSEAgent {
	return &SSEAgent{
		subscriptions: make(map[string][]*subscription),
	}
}

func (a *SSEAgent) AddSubscription(txid string, sub *subscription) {
	a.Lock()
	defer a.Unlock()
	a.subscriptions[txid] = append(a.subscriptions[txid], sub)
}

func (a *SSEAgent) RemoveSubscription(txid string, sub *subscription) {
	a.Lock()
	defer a.Unlock()
	subs := a.subscriptions[txid]
	for i, s := range subs {
		if s == sub {
			a.subscriptions[txid] = append(subs[:i], subs[i+1:]...)
			break
		}
	}
	if len(a.subscriptions[txid]) == 0 {
		delete(a.subscriptions, txid)
	}
}

func (a *SSEAgent) NotifySubscribers(txid string, msg SSEMessage) {
	a.RLock()
	subs := a.subscriptions[txid]
	a.RUnlock()

	for _, sub := range subs {
		select {
		case sub.conn <- msg:
		default:
		}
	}

	if msg.Status == "confirmed" || msg.Status == "failed" {
		a.Lock()
		delete(a.subscriptions, txid)
		a.Unlock()
	}
}

func (m SSEMessage) JSON() string {
	b, _ := json.Marshal(m)
	return string(b)
}
