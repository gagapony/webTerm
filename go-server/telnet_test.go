package main

import (
	"testing"
)

func TestProcessTelnetDataPlainText(t *testing.T) {
	var responses [][]byte
	respond := func(b []byte) { responses = append(responses, b) }
	out := processTelnetData([]byte("hello world"), respond)
	if out != "hello world" {
		t.Errorf("out = %q", out)
	}
	if len(responses) != 0 {
		t.Errorf("responses = %v", responses)
	}
}

func TestProcessTelnetDataWillWont(t *testing.T) {
	var responses [][]byte
	respond := func(b []byte) { responses = append(responses, b) }
	// IAC WILL ECHO(1) → 回复 IAC DO ECHO；IAC WONT SGA(3) → 回复 IAC DONT SGA
	out := processTelnetData([]byte{255, 251, 1, 255, 252, 3}, respond)
	if out != "" {
		t.Errorf("out = %q, want empty", out)
	}
	if len(responses) != 2 {
		t.Fatalf("responses = %v", responses)
	}
	if responses[0][0] != 255 || responses[0][1] != 253 || responses[0][2] != 1 {
		t.Errorf("WILL should be answered with DO: %v", responses[0])
	}
	if responses[1][0] != 255 || responses[1][1] != 254 || responses[1][2] != 3 {
		t.Errorf("WONT should be answered with DONT: %v", responses[1])
	}
}

func TestProcessTelnetDataDoDont(t *testing.T) {
	var responses [][]byte
	respond := func(b []byte) { responses = append(responses, b) }
	// IAC DO NAWS(31) → IAC WILL NAWS；IAC DONT ECHO(1) → IAC WONT ECHO
	out := processTelnetData([]byte{255, 253, 31, 255, 254, 1}, respond)
	if out != "" {
		t.Errorf("out = %q, want empty", out)
	}
	if responses[0][1] != 251 || responses[0][2] != 31 {
		t.Errorf("DO should be answered with WILL: %v", responses[0])
	}
	if responses[1][1] != 252 || responses[1][2] != 1 {
		t.Errorf("DONT should be answered with WONT: %v", responses[1])
	}
}

func TestProcessTelnetDataEscapedIAC(t *testing.T) {
	// 对齐 Node 版：仅在 255,255 位于缓冲末尾时 escaped-IAC 分支可达（i+2<len 不成立）。
	// Node 在此输入下输出 "aÿ"。注意：{'a',255,255,'b'} 在 Node 下输出 "ab"（首分支吞掉两字节）。
	out := processTelnetData([]byte{'a', 255, 255}, func([]byte) {})
	if out != "aÿ" {
		t.Errorf("out = %q, want aÿ", out)
	}
}

func TestProcessTelnetDataSubnegotiation(t *testing.T) {
	// SE(240) 及其他命令：跳过 2 字节
	out := processTelnetData([]byte{255, 240, 'x'}, func([]byte) {})
	if out != "x" {
		t.Errorf("out = %q, want x", out)
	}
}

func TestProcessTelnetDataHighBytesLatin1(t *testing.T) {
	// Node String.fromCharCode(0xE9) → U+00E9 "é"
	out := processTelnetData([]byte{0xE9}, func([]byte) {})
	if out != "é" {
		t.Errorf("out = %q, want é", out)
	}
}

func TestProcessTelnetDataMixed(t *testing.T) {
	var responses [][]byte
	respond := func(b []byte) { responses = append(responses, b) }
	out := processTelnetData([]byte{'h', 'i', 255, 251, 1, '!'}, respond)
	if out != "hi!" {
		t.Errorf("out = %q, want hi!", out)
	}
	if len(responses) != 1 {
		t.Errorf("responses = %v", responses)
	}
}

func TestNAWSBytes(t *testing.T) {
	got := nawsMessage(132, 43)
	want := []byte{255, 250, 31, 0, 132, 0, 43, 255, 240}
	if len(got) != len(want) {
		t.Fatalf("len = %d, want %d", len(got), len(want))
	}
	for i := range want {
		if got[i] != want[i] {
			t.Fatalf("byte %d = %d, want %d", i, got[i], want[i])
		}
	}
}
