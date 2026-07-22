{ pkgs ? import <nixpkgs> {} }:

pkgs.mkShell {
  buildInputs = with pkgs; [
    nodejs
    go
    gnumake
    gcc
    gcc.cc.lib
    python3
    pkg-config
  ];
}
