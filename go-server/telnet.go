package main

import (
	"fmt"
	"log/slog"
	"net"
	"strings"
	"sync"
	"sync/atomic"
	"time"
)

// ---- 共用类型（ssh.go 也使用） ----

type SessionHandlers struct {
	Data  func(string)
	Close func()
	Error func(error)
}

type SessionOptions struct {
	Host       string
	Port       int
	Username   string
	Password   string
	PrivateKey string
	Passphrase string
	Cols       int
	Rows       int
}

type TerminalSession interface {
	Write(data string)
	Resize(cols, rows int)
	Close()
}

// ---- Telnet ----

type TelnetSession struct {
	conn      net.Conn
	writeMu   sync.Mutex
	handlers  SessionHandlers
	connected atomic.Bool
	closeOnce sync.Once
}

const telnetDialTimeout = 10 * time.Second

func DialTelnet(opts SessionOptions, h SessionHandlers) (TerminalSession, error) {
	conn, err := net.DialTimeout("tcp", net.JoinHostPort(opts.Host, fmt.Sprint(opts.Port)), telnetDialTimeout)
	if err != nil {
		return nil, err
	}
	s := &TelnetSession{conn: conn, handlers: h}
	s.connected.Store(true)
	slog.Info("Telnet connected", "host", opts.Host, "port", opts.Port)

	// 初始协商：WILL SGA, WILL ECHO, DO NAWS（对齐 Node 版）
	s.writeRaw([]byte{255, 251, 3, 255, 251, 1, 255, 253, 31})
	if opts.Cols > 0 && opts.Rows > 0 {
		s.Resize(opts.Cols, opts.Rows)
	}

	go s.readLoop()
	return s, nil
}

func (s *TelnetSession) readLoop() {
	buf := make([]byte, 32*1024)
	for {
		n, err := s.conn.Read(buf)
		if n > 0 {
			out := processTelnetData(buf[:n], s.writeRaw)
			if out != "" && s.handlers.Data != nil {
				s.handlers.Data(out)
			}
		}
		if err != nil {
			s.doClose()
			return
		}
	}
}

func (s *TelnetSession) doClose() {
	s.closeOnce.Do(func() {
		s.connected.Store(false)
		s.conn.Close()
		if s.handlers.Close != nil {
			s.handlers.Close()
		}
	})
}

func (s *TelnetSession) writeRaw(b []byte) {
	s.writeMu.Lock()
	defer s.writeMu.Unlock()
	if s.connected.Load() {
		s.conn.Write(b)
	}
}

func (s *TelnetSession) Write(data string) {
	s.writeRaw([]byte(data))
}

func (s *TelnetSession) Resize(cols, rows int) {
	s.writeRaw(nawsMessage(cols, rows))
}

func (s *TelnetSession) Close() {
	s.doClose()
}

func nawsMessage(cols, rows int) []byte {
	return []byte{
		255, 250, 31,
		byte(cols >> 8), byte(cols),
		byte(rows >> 8), byte(rows),
		255, 240,
	}
}

// processTelnetData 逐字节对齐 Node 版 processTelnetData 的 IAC 状态机。
// 注意：高位字节按 latin1 映射为 rune（对齐 Node 的 String.fromCharCode）。
func processTelnetData(data []byte, respond func([]byte)) string {
	var b strings.Builder
	i := 0
	for i < len(data) {
		if data[i] == 255 && i+2 < len(data) {
			cmd, opt := data[i+1], data[i+2]
			switch cmd {
			case 251: // WILL → DO
				respond([]byte{255, 253, opt})
				i += 3
			case 252: // WONT → DONT
				respond([]byte{255, 254, opt})
				i += 3
			case 253: // DO → WILL
				respond([]byte{255, 251, opt})
				i += 3
			case 254: // DONT → WONT
				respond([]byte{255, 252, opt})
				i += 3
			default: // SE(240) 及其他：跳过 2 字节
				i += 2
			}
		} else if data[i] == 255 && i+1 < len(data) && data[i+1] == 255 {
			b.WriteRune(255) // escaped IAC
			i += 2
		} else {
			b.WriteRune(rune(data[i]))
			i++
		}
	}
	return b.String()
}
