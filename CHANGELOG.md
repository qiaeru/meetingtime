# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Fixed

- Share dialog: fall back to `document.execCommand("copy")` when the asynchronous Clipboard API is unavailable, so the Copy buttons work on plain-HTTP LAN deployments instead of silently failing.

## [1.0.0] - 2026-05-17

- Initial release.
