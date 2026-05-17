import { Marked } from "marked";
import DOMPurify from "dompurify";
// Shiki is type-only at the top level so the runtime (~1.5 MB of grammars and
// themes once bundled) is split into its own chunk and only fetched on the
// first preview open. See `loadHighlighter()` below for the dynamic import.
import type { Highlighter, BundledLanguage } from "shiki";
import { t } from "../i18n/index.js";

// Keep narrow: every entry pulls a TextMate grammar into the Shiki chunk.
const LANGS: BundledLanguage[] = [
  "bash",
  "css",
  "diff",
  "html",
  "ini",
  "java",
  "javascript",
  "json",
  "markdown",
  "python",
  "shell",
  "sql",
  "typescript",
  "xml",
  "yaml",
];

const THEMES = { light: "github-light", dark: "github-dark" } as const;

let highlighter: Highlighter | null = null;
let highlighterPromise: Promise<Highlighter> | null = null;
function loadHighlighter(): Promise<Highlighter> {
  if (!highlighterPromise) {
    highlighterPromise = import("shiki")
      .then(({ createHighlighter }) =>
        createHighlighter({
          themes: [THEMES.light, THEMES.dark],
          langs: LANGS,
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
      // hint until the proper colours arrive.
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
