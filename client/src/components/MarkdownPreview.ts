import { Marked } from "marked";
import DOMPurify from "dompurify";
// Shiki's runtime (grammars, themes, the Oniguruma wasm) loads lazily on the
// first preview open, in its own chunk. We use the fine-grained `shiki/core`
// API with explicit grammar/theme imports rather than the full `shiki` bundle:
// that bundle registers all ~340 languages, which makes the bundler emit a
// (never-fetched) chunk for every one of them. See `loadHighlighter()` below.
import type { HighlighterCore } from "shiki/core";
import { t } from "../i18n/index.js";

const THEMES = { light: "github-light", dark: "github-dark" } as const;

let highlighter: HighlighterCore | null = null;
let highlighterPromise: Promise<HighlighterCore> | null = null;
function loadHighlighter(): Promise<HighlighterCore> {
  if (!highlighterPromise) {
    // Each import() is a grammar/theme chunk fetched only now. One `bash` import
    // covers the bash/sh/shell/zsh aliases. Keep this list in sync with the
    // languages we advertise as highlightable.
    highlighterPromise = Promise.all([
      import("shiki/core"),
      import("shiki/engine/oniguruma"),
    ])
      .then(([{ createHighlighterCore }, { createOnigurumaEngine }]) =>
        createHighlighterCore({
          themes: [
            import("@shikijs/themes/github-light"),
            import("@shikijs/themes/github-dark"),
          ],
          langs: [
            import("@shikijs/langs/bash"),
            import("@shikijs/langs/css"),
            import("@shikijs/langs/diff"),
            import("@shikijs/langs/html"),
            import("@shikijs/langs/ini"),
            import("@shikijs/langs/java"),
            import("@shikijs/langs/javascript"),
            import("@shikijs/langs/json"),
            import("@shikijs/langs/markdown"),
            import("@shikijs/langs/python"),
            import("@shikijs/langs/sql"),
            import("@shikijs/langs/typescript"),
            import("@shikijs/langs/xml"),
            import("@shikijs/langs/yaml"),
          ],
          engine: createOnigurumaEngine(import("shiki/wasm")),
        })
      )
      .then((h) => {
        highlighter = h;
        return h;
      });
  }
  return highlighterPromise;
}

// Before the highlighter is ready, fenced code is rendered escaped and the
// preview is re-rendered once shiki resolves.
const md = new Marked({
  renderer: {
    code({ text, lang }) {
      const language = (lang || "").trim();
      if (highlighter && language && highlighter.getLoadedLanguages().includes(language)) {
        return highlighter.codeToHtml(text, {
          lang: language,
          themes: THEMES,
          defaultColor: false,
        });
      }
      const escaped = text
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;");
      const langAttr = language ? ` class="language-${language}"` : "";
      // CSS ::before reads data-syntax-loading to show a "loading highlighter"
      // hint until the proper colors arrive.
      const pending = highlighter ? "" : ' data-syntax-pending="true"';
      return `<pre${pending}><code${langAttr}>${escaped}</code></pre>`;
    },
  },
});

export function renderMarkdownInto(target: HTMLElement, source: string): void {
  const render = (): void => {
    const raw = md.parse(source, { async: false }) as string;
    target.innerHTML = DOMPurify.sanitize(raw, {
      ADD_ATTR: ["style", "data-syntax-pending"],
    });
    const pending = target.querySelectorAll<HTMLElement>("pre[data-syntax-pending]");
    for (const el of pending) {
      el.setAttribute("aria-label", t("notes.syntaxLoading"));
      el.dataset.syntaxLoading = t("notes.syntaxLoading");
    }
  };
  render();
  if (!highlighter) {
    void loadHighlighter().then(render);
  }
}
