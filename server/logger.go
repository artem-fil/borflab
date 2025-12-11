package main

import (
	"fmt"
	"log"
	"path/filepath"
	"runtime"
	"strings"
	"time"
)

func LogError(module, context string, err error) {
	const maxDepth = 3

	type callerInfo struct {
		file, funcName string
		line           int
	}

	var callers []callerInfo

	for i := 1; i <= maxDepth; i++ {
		pc, file, line, ok := runtime.Caller(i)
		if !ok {
			break
		}

		funcName := runtime.FuncForPC(pc).Name()
		if idx := strings.LastIndex(funcName, "."); idx != -1 {
			funcName = funcName[idx+1:]
		}

		callers = append(callers, callerInfo{
			file:     filepath.Base(file),
			funcName: funcName,
			line:     line,
		})
	}

	if len(callers) == 0 {
		log.Printf("\033[31m[ERROR]\033[0m: %s | %s: %v", module, context, err)
		return
	}

	var sb strings.Builder
	fmt.Fprintf(&sb, "%s:%s:%d", callers[0].file, callers[0].funcName, callers[0].line)
	for _, c := range callers[1:] {
		fmt.Fprintf(&sb, " < %s:%s:%d", c.file, c.funcName, c.line)
	}

	log.Printf(
		"%s \033[31m[ERROR]\033[0m: %-8s | %s: %v\n Call stack: %s",
		time.Now().Format("02-01-2006 15:04:05"),
		module,
		context,
		err,
		sb.String(),
	)
}

func LogWarning(module, context string) {
	log.Printf(
		"%s \033[33m[WARN]\033[0m:  %-8s | %s",
		time.Now().Format("02-01-2006 15:04:05"),
		module,
		context,
	)
}

func LogInfo(module, context string) {
	log.Printf(
		"%s [INFO]:  %-8s | %s",
		time.Now().Format("02-01-2006 15:04:05"),
		module,
		context,
	)
}
