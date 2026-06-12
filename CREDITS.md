# Credits

Meetingtime is released under the [MIT License](./LICENSE). Every third-party asset and library it ships is distributed under an OSI-approved or FSF-approved open source license. No CDN is contacted at runtime.

## Fonts

- **Inter.** Copyright © The Inter Project Authors, licensed under the [SIL Open Font License 1.1](https://openfontlicense.org/). Source: <https://github.com/rsms/inter>. Self-hosted through `@fontsource-variable/inter`.
- **JetBrains Mono.** Copyright © JetBrains s.r.o., licensed under the [SIL Open Font License 1.1](https://openfontlicense.org/). Source: <https://github.com/JetBrains/JetBrainsMono>. Self-hosted through `@fontsource-variable/jetbrains-mono`.

## Icons

- **Lucide.** Copyright © Lucide Contributors, licensed under the [ISC License](https://github.com/lucide-icons/lucide/blob/main/LICENSE). Source: <https://lucide.dev/>. Used as inline SVG through the `components/Icon.ts` helper, plus the favicon and the two PWA icon files.

## Backend runtime

- [Express](https://expressjs.com/). MIT license. The HTTP server.
- [Socket.IO](https://socket.io/). MIT license. The bidirectional event channel for meeting state.
- [Yjs](https://github.com/yjs/yjs). MIT license. The CRDT powering the collaborative notes.
- [y-websocket](https://github.com/yjs/y-websocket) and [y-protocols](https://github.com/yjs/y-protocols). MIT license. The wire protocol used by the Yjs bridge.
- [cors](https://github.com/expressjs/cors). MIT license.
- [pino](https://github.com/pinojs/pino). MIT license. Structured logging.
- [uuid](https://github.com/uuidjs/uuid). MIT license.

## Frontend runtime

- [CodeMirror 6](https://codemirror.net/). MIT license. The notes editor.
- [y-codemirror.next](https://github.com/yjs/y-codemirror.next). MIT license. The CodeMirror binding for Yjs.
- [Marked](https://marked.js.org/). MIT license. Markdown parsing for the preview pane.
- [DOMPurify](https://github.com/cure53/DOMPurify). Apache-2.0 / MPL-2.0 dual license. Sanitises the Markdown preview HTML.
- [Shiki](https://shiki.style/). MIT license. Syntax highlighting in the Markdown preview, bundled with fifteen languages and the dual `github-light` / `github-dark` themes.
- [socket.io-client](https://socket.io/). MIT license.

## Build tooling

- [Vite](https://vitejs.dev/). MIT license. The frontend bundler.
- [TypeScript](https://www.typescriptlang.org/). Apache-2.0 license.
- [tsx](https://github.com/privatenumber/tsx). MIT license. Server reload in development.

## Acknowledgements

Thanks to the maintainers of every dependency listed above, and to everyone who reported a bug or suggested an improvement.
