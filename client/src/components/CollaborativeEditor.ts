import { Compartment, EditorState } from "@codemirror/state";
import {
  EditorView,
  lineNumbers,
  highlightActiveLine,
  keymap,
  placeholder,
} from "@codemirror/view";
import { defaultKeymap, history, historyKeymap } from "@codemirror/commands";
import { markdown } from "@codemirror/lang-markdown";
import * as Y from "yjs";
import { WebsocketProvider } from "y-websocket";
import { yCollab } from "y-codemirror.next";
import { YJS_WS_URL } from "../env.js";
import { colorFromId } from "../lib/color.js";
import { t } from "../i18n/index.js";
import { theme$ } from "./ThemeToggle.js";

// y-codemirror.next interpolates this value into a style="..." attribute on
// remote-cursor decorations. A malicious peer pushing `red; background:url(...)`
// would inject CSS in every other peer's editor; restricting to a strict
// allow-list of hex / hsl literals closes that channel.
const HEX_RE = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;
const HSL_RE = /^hsl\(\s*\d{1,3}(?:\.\d+)?\s*,\s*\d{1,3}(?:\.\d+)?%\s*,\s*\d{1,3}(?:\.\d+)?%\s*\)$/;
const FALLBACK_COLOR = "#2563eb";
function sanitizeColor(input: string): string {
  return HEX_RE.test(input) || HSL_RE.test(input) ? input : FALLBACK_COLOR;
}

// Remote selections are painted behind body text, so they get a light tint of
// the participant color instead of the solid color (which drops the text
// below 2:1). Takes a sanitized color and keeps the same strict formats.
function selectionTint(color: string): string {
  if (color.startsWith("hsl(")) return color.replace(/^hsl\((.*)\)$/, "hsla($1, 0.25)");
  const hex = color.length === 4 ? "#" + [...color.slice(1)].map((c) => c + c).join("") : color;
  return `${hex}40`;
}

const lightTheme = EditorView.theme(
  {
    "&": { height: "100%", color: "var(--fg)", backgroundColor: "var(--bg-elev)" },
    ".cm-content": { fontFamily: "var(--mono-font)", caretColor: "var(--fg)" },
    ".cm-gutters": {
      backgroundColor: "var(--bg-muted)",
      color: "var(--fg-muted)",
      border: "none",
    },
    ".cm-activeLine": { backgroundColor: "color-mix(in srgb, var(--accent) 8%, transparent)" },
    ".cm-activeLineGutter": {
      backgroundColor: "color-mix(in srgb, var(--accent) 12%, transparent)",
    },
    ".cm-cursor": { borderLeftColor: "var(--fg)" },
    "&.cm-focused": { outline: "2px solid var(--accent)", outlineOffset: "-2px" },
    // Override y-codemirror.next which hardcodes `font-family: serif` on the
    // floating remote-cursor name tag.
    ".cm-ySelectionInfo": {
      fontFamily: "var(--sans-font)",
      fontWeight: "600",
      letterSpacing: "-0.01em",
      borderRadius: "3px",
    },
    ".cm-selectionBackground, &.cm-focused .cm-selectionBackground": {
      backgroundColor: "color-mix(in srgb, var(--accent) 25%, transparent)",
    },
  },
  { dark: false }
);

const darkTheme = EditorView.theme(
  {
    "&": { height: "100%", color: "var(--fg)", backgroundColor: "var(--bg-elev)" },
    ".cm-content": { fontFamily: "var(--mono-font)", caretColor: "var(--fg)" },
    ".cm-gutters": {
      backgroundColor: "var(--bg-muted)",
      color: "var(--fg-muted)",
      border: "none",
    },
    ".cm-activeLine": { backgroundColor: "color-mix(in srgb, var(--accent) 12%, transparent)" },
    ".cm-activeLineGutter": {
      backgroundColor: "color-mix(in srgb, var(--accent) 18%, transparent)",
    },
    ".cm-cursor": { borderLeftColor: "var(--fg)" },
    "&.cm-focused": { outline: "2px solid var(--accent)", outlineOffset: "-2px" },
    // Override y-codemirror.next which hardcodes `font-family: serif` on the
    // floating remote-cursor name tag.
    ".cm-ySelectionInfo": {
      fontFamily: "var(--sans-font)",
      fontWeight: "600",
      letterSpacing: "-0.01em",
      borderRadius: "3px",
    },
    ".cm-selectionBackground, &.cm-focused .cm-selectionBackground": {
      backgroundColor: "color-mix(in srgb, var(--accent) 30%, transparent)",
    },
  },
  { dark: true }
);

interface Args {
  container: HTMLElement;
  meetingId: string;
  participantId: string;
  token: string;
  readOnly: boolean;
  // Defaults to a hue derived from the participant id. Pass the meeting's
  // position-based color to match the participant list.
  color?: string;
}

export interface CollaborativeEditor {
  view: EditorView;
  ydoc: Y.Doc;
  ytext: Y.Text;
  provider: WebsocketProvider;
  setReadOnly: (readOnly: boolean) => void;
  // Name and color shown on my remote cursor to the other participants.
  setUser: (name: string, color: string) => void;
  destroy: () => void;
}

export function mountCollaborativeEditor(args: Args): CollaborativeEditor {
  const ydoc = new Y.Doc();
  const provider = new WebsocketProvider(YJS_WS_URL.replace(/\/$/, ""), args.meetingId, ydoc, {
    params: { token: args.token },
  });

  const initialColor = sanitizeColor(args.color ?? colorFromId(args.participantId));
  // Placeholder identity until the page calls setUser() with the real one.
  provider.awareness.setLocalStateField("user", {
    name: "?",
    color: initialColor,
    colorLight: selectionTint(initialColor),
    participantId: args.participantId,
  });

  const ytext = ydoc.getText("notes");

  const themeCompartment = new Compartment();
  const readOnlyCompartment = new Compartment();
  const placeholderCompartment = new Compartment();
  const placeholderFor = (readOnly: boolean) =>
    placeholder(readOnly ? t("notes.placeholderReadOnly") : t("notes.placeholder"));

  const state = EditorState.create({
    doc: ytext.toString(),
    extensions: [
      lineNumbers(),
      highlightActiveLine(),
      history(),
      keymap.of([...defaultKeymap, ...historyKeymap]),
      markdown(),
      // The placeholder is not a name; without this the notes editor is an
      // unnamed textbox for screen readers.
      EditorView.contentAttributes.of({ "aria-label": t("notes.title") }),
      readOnlyCompartment.of(EditorState.readOnly.of(args.readOnly)),
      yCollab(ytext, provider.awareness),
      EditorView.lineWrapping,
      placeholderCompartment.of(placeholderFor(args.readOnly)),
      themeCompartment.of(theme$.get() === "dark" ? darkTheme : lightTheme),
    ],
  });

  const view = new EditorView({ state, parent: args.container });

  const unsubTheme = theme$.subscribe((th) => {
    view.dispatch({
      effects: themeCompartment.reconfigure(th === "dark" ? darkTheme : lightTheme),
    });
  });

  return {
    view,
    ydoc,
    ytext,
    provider,
    setReadOnly: (readOnly: boolean) => {
      view.dispatch({
        effects: [
          readOnlyCompartment.reconfigure(EditorState.readOnly.of(readOnly)),
          placeholderCompartment.reconfigure(placeholderFor(readOnly)),
        ],
      });
    },
    setUser: (name: string, color: string) => {
      const safe = sanitizeColor(color);
      provider.awareness.setLocalStateField("user", {
        name,
        color: safe,
        colorLight: selectionTint(safe),
        participantId: args.participantId,
      });
    },
    destroy: () => {
      unsubTheme();
      view.destroy();
      provider.destroy();
      ydoc.destroy();
    },
  };
}
