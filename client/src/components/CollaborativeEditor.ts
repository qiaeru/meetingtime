import { Compartment, EditorState } from "@codemirror/state";
import { EditorView, lineNumbers, highlightActiveLine, keymap, placeholder } from "@codemirror/view";
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
    ".cm-activeLineGutter": { backgroundColor: "color-mix(in srgb, var(--accent) 12%, transparent)" },
    ".cm-cursor": { borderLeftColor: "var(--fg)" },
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
    ".cm-activeLineGutter": { backgroundColor: "color-mix(in srgb, var(--accent) 18%, transparent)" },
    ".cm-cursor": { borderLeftColor: "var(--fg)" },
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
  displayName: string;
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
  setUserColor: (color: string) => void;
  destroy: () => void;
}

export function mountCollaborativeEditor(args: Args): CollaborativeEditor {
  const ydoc = new Y.Doc();
  const provider = new WebsocketProvider(
    YJS_WS_URL.replace(/\/$/, ""),
    args.meetingId,
    ydoc,
    { params: { token: args.token } }
  );

  const initialColor = sanitizeColor(args.color ?? colorFromId(args.participantId));
  provider.awareness.setLocalStateField("user", {
    name: args.displayName,
    color: initialColor,
    colorLight: initialColor,
    participantId: args.participantId,
  });

  const ytext = ydoc.getText("notes");

  const themeCompartment = new Compartment();
  const readOnlyCompartment = new Compartment();

  const state = EditorState.create({
    doc: ytext.toString(),
    extensions: [
      lineNumbers(),
      highlightActiveLine(),
      history(),
      keymap.of([...defaultKeymap, ...historyKeymap]),
      markdown(),
      readOnlyCompartment.of(EditorState.readOnly.of(args.readOnly)),
      yCollab(ytext, provider.awareness),
      EditorView.lineWrapping,
      placeholder(args.readOnly ? t("notes.placeholderReadOnly") : t("notes.placeholder")),
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
        effects: readOnlyCompartment.reconfigure(EditorState.readOnly.of(readOnly)),
      });
    },
    setUserColor: (color: string) => {
      const safe = sanitizeColor(color);
      provider.awareness.setLocalStateField("user", {
        name: args.displayName,
        color: safe,
        colorLight: safe,
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
