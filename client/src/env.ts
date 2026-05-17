/** Runtime constants. The dev server proxies /socket.io and /yjs to the backend. */
export const SERVER_URL = "";
export const YJS_WS_URL = ((): string => {
  const proto = location.protocol === "https:" ? "wss:" : "ws:";
  return `${proto}//${location.host}/yjs`;
})();
