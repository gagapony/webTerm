package main

import (
	"io"
	"log/slog"
	"net"
	"strconv"
	"strings"
	"sync"
	"sync/atomic"
	"time"

	"golang.org/x/crypto/ssh"
)

type SSHSession struct {
	client   *ssh.Client
	session  *ssh.Session
	stdin    io.WriteCloser
	writeMu  sync.Mutex
	handlers SessionHandlers

	connected  atomic.Bool
	closeOnce  sync.Once
	keepaliveC chan struct{}
}

const sshDialTimeout = 10 * time.Second

func DialSSH(opts SessionOptions, h SessionHandlers) (TerminalSession, error) {
	cfg := &ssh.ClientConfig{
		User:            opts.Username,
		HostKeyCallback: ssh.InsecureIgnoreHostKey(), // 对齐 Node ssh2 默认行为
		Timeout:         sshDialTimeout,
	}
	if opts.Password != "" {
		cfg.Auth = append(cfg.Auth, ssh.Password(opts.Password))
	}
	if opts.PrivateKey != "" {
		var signer ssh.Signer
		var err error
		if opts.Passphrase != "" {
			signer, err = ssh.ParsePrivateKeyWithPassphrase([]byte(opts.PrivateKey), []byte(opts.Passphrase))
		} else {
			signer, err = ssh.ParsePrivateKey([]byte(opts.PrivateKey))
		}
		if err != nil {
			return nil, err
		}
		cfg.Auth = append(cfg.Auth, ssh.PublicKeys(signer))
	}

	addr := net.JoinHostPort(opts.Host, strconv.Itoa(opts.Port))
	client, err := ssh.Dial("tcp", addr, cfg)
	if err != nil {
		return nil, err
	}

	sess, err := client.NewSession()
	if err != nil {
		client.Close()
		return nil, err
	}

	cols, rows := opts.Cols, opts.Rows
	if cols <= 0 {
		cols = 80
	}
	if rows <= 0 {
		rows = 24
	}
	// RequestPty(term, height, width, modes) — 高在前
	if err := sess.RequestPty("xterm-256color", rows, cols, ssh.TerminalModes{}); err != nil {
		sess.Close()
		client.Close()
		return nil, err
	}

	stdout, err := sess.StdoutPipe()
	if err != nil {
		sess.Close()
		client.Close()
		return nil, err
	}
	stderr, err := sess.StderrPipe()
	if err != nil {
		sess.Close()
		client.Close()
		return nil, err
	}
	stdin, err := sess.StdinPipe()
	if err != nil {
		sess.Close()
		client.Close()
		return nil, err
	}

	if err := sess.Shell(); err != nil {
		sess.Close()
		client.Close()
		return nil, err
	}

	s := &SSHSession{
		client:     client,
		session:    sess,
		stdin:      stdin,
		handlers:   h,
		keepaliveC: make(chan struct{}),
	}
	s.connected.Store(true)
	slog.Info("SSH connected", "host", opts.Host, "port", opts.Port)

	go s.pump(stdout)
	go s.pump(stderr)
	go s.wait()
	go s.keepalive()
	return s, nil
}

// pump 把流数据转发给 Data 回调（lossy UTF-8，对齐 Node toString）。
func (s *SSHSession) pump(r io.Reader) {
	buf := make([]byte, 32*1024)
	for {
		n, err := r.Read(buf)
		if n > 0 && s.handlers.Data != nil {
			s.handlers.Data(strings.ToValidUTF8(string(buf[:n]), "\uFFFD"))
		}
		if err != nil {
			return
		}
	}
}

func (s *SSHSession) wait() {
	s.session.Wait()
	s.doClose()
}

func (s *SSHSession) keepalive() {
	t := time.NewTicker(10 * time.Second)
	defer t.Stop()
	for {
		select {
		case <-s.keepaliveC:
			return
		case <-t.C:
			// *Client 没有公开的 SendGlobalRequest；用会话级 channel 请求作为存活探针。
			if _, err := s.session.SendRequest("keepalive@openssh.com", true, nil); err != nil {
				s.doClose()
				return
			}
		}
	}
}

func (s *SSHSession) doClose() {
	s.closeOnce.Do(func() {
		s.connected.Store(false)
		close(s.keepaliveC)
		s.session.Close()
		s.client.Close()
		if s.handlers.Close != nil {
			s.handlers.Close()
		}
	})
}

func (s *SSHSession) Write(data string) {
	s.writeMu.Lock()
	defer s.writeMu.Unlock()
	if s.connected.Load() {
		io.WriteString(s.stdin, data)
	}
}

func (s *SSHSession) Resize(cols, rows int) {
	if s.connected.Load() {
		s.session.WindowChange(rows, cols) // 高在前
	}
}

func (s *SSHSession) Close() {
	s.doClose()
}
