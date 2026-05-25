# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Security

- Bump `ws` to 8.21.0 to pick up the remote memory exhaustion DoS fix (a peer flooding tiny fragments could crash the server with OOM).

## [1.0.1] - 2026-05-20

### Changed

- gzip HTTP responses (client bundle, CSS, locale JSON, SPA index) via the `compression` middleware so cold loads over a tunnel or VPN ship far fewer bytes.

### Fixed

- Share dialog Copy buttons now fall back to `document.execCommand("copy")` when the async Clipboard API is unavailable, so they work on plain-HTTP LAN deployments instead of silently failing.

### Security

- Pin transitive `ws` to `^8.20.1` via npm `overrides`, clearing GHSA-58qx-3vcg-4xpx (uninitialized memory disclosure) while Socket.IO upstream still ships `engine.io` with `ws@~8.18.3`.

## [1.0.0] - 2026-05-17

- Initial release.
