# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Changed

- Negotiate gzip on the HTTP responses (client bundle, CSS, locale JSON, SPA index) via the `compression` middleware so cold loads over a tunnel or VPN ship far fewer bytes.

### Fixed

- Share dialog: fall back to `document.execCommand("copy")` when the asynchronous Clipboard API is unavailable, so the Copy buttons work on plain-HTTP LAN deployments instead of silently failing.

### Security

- Pin transitive `ws` to `^8.20.1` via npm `overrides` to clear the GHSA-58qx-3vcg-4xpx uninitialized-memory-disclosure advisory (Socket.IO and engine.io still depend on `ws@~8.18.3`).

## [1.0.0] - 2026-05-17

- Initial release.
