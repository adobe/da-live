// ../slicc/packages/cherry/dist/cdp-host-handlers.js
var CherryUnsupportedError = class extends Error {
  code = -32601;
  constructor(method) {
    super(`Cherry: unsupported CDP method '${method}'`);
    this.name = "CherryUnsupportedError";
  }
};
function createCdpHostHandler(opts) {
  const nodeIds = /* @__PURE__ */ new WeakMap();
  const nodesById = /* @__PURE__ */ new Map();
  let nextNodeId = 1;
  const idFor = (node) => {
    let id = nodeIds.get(node);
    if (id === void 0) {
      id = nextNodeId++;
      nodeIds.set(node, id);
      nodesById.set(id, node);
    }
    return id;
  };
  const toRemoteObject = (value) => {
    const type = typeof value;
    if (value === null)
      return { type: "object", subtype: "null", value: null };
    if (type === "undefined")
      return { type: "undefined" };
    if (type === "number" || type === "boolean" || type === "string") {
      return { type, value };
    }
    return { type: "object", description: String(value) };
  };
  const indirectEval = eval;
  const evalInRealm = indirectEval;
  return async function handle(method, params) {
    switch (method) {
      case "Runtime.evaluate": {
        const expression = String(params.expression ?? "");
        try {
          const value = evalInRealm(expression);
          const resolved = value instanceof Promise ? await value : value;
          return { result: toRemoteObject(resolved) };
        } catch (err) {
          return {
            result: { type: "object", subtype: "error" },
            exceptionDetails: {
              text: err instanceof Error ? err.message : String(err),
              exception: { type: "object", description: String(err) }
            }
          };
        }
      }
      case "DOM.getDocument": {
        return { root: { nodeId: idFor(document), nodeName: "#document", childNodeCount: 1 } };
      }
      case "DOM.querySelector": {
        const root = nodesById.get(Number(params.nodeId)) ?? document;
        const sel = String(params.selector ?? "");
        const el = root.querySelector?.(sel) ?? null;
        return { nodeId: el ? idFor(el) : 0 };
      }
      case "DOM.getBoxModel": {
        const node = nodesById.get(Number(params.nodeId));
        const el = node;
        const r = el?.getBoundingClientRect?.();
        if (!r)
          throw new CherryUnsupportedError("DOM.getBoxModel(no-rect)");
        const quad = [r.left, r.top, r.right, r.top, r.right, r.bottom, r.left, r.bottom];
        return { model: { content: quad, width: r.width, height: r.height } };
      }
      case "Input.dispatchMouseEvent": {
        const x = Number(params.x ?? 0);
        const y = Number(params.y ?? 0);
        const target = document.elementFromPoint(x, y);
        if (target && params.type === "mousePressed") {
          target.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, clientX: x, clientY: y }));
        }
        return {};
      }
      case "Input.dispatchKeyEvent": {
        const active = document.activeElement;
        if (active && params.type === "keyDown" && typeof params.key === "string") {
          active.dispatchEvent(new KeyboardEvent("keydown", { key: params.key, bubbles: true }));
        }
        return {};
      }
      case "Page.captureScreenshot": {
        if (opts.capabilities.screenshot !== "html2canvas") {
          throw new CherryUnsupportedError("Page.captureScreenshot");
        }
        const { default: html2canvas } = await import("html2canvas-pro");
        const canvas = await html2canvas(document.body);
        const data = canvas.toDataURL("image/png").split(",")[1] ?? "";
        return { data };
      }
      case "Page.navigate": {
        if (!opts.capabilities.navigate)
          throw new CherryUnsupportedError("Page.navigate");
        const url = String(params.url ?? "");
        location.assign(url);
        return { frameId: "cherry-frame", loaderId: "cherry-loader" };
      }
      case "Target.createTarget": {
        if (!opts.capabilities.openUrl)
          throw new CherryUnsupportedError("Target.createTarget");
        const url = String(params.url ?? "");
        opts.onOpenUrl?.(url);
        return { targetId: "cherry-opened" };
      }
      default:
        throw new CherryUnsupportedError(method);
    }
  };
}

// ../slicc/packages/cherry/dist/protocol.js
var CHERRY_PROTOCOL_VERSION = 1;
var KINDS = /* @__PURE__ */ new Set([
  "handshake.hello",
  "handshake.welcome",
  "cdp.request",
  "cdp.response",
  "cdp.event",
  "permission.request",
  "permission.response",
  "host.event",
  "slicc.event"
]);
function isCherryEnvelope(value) {
  if (typeof value !== "object" || value === null)
    return false;
  const v = value;
  return v.cherry === CHERRY_PROTOCOL_VERSION && typeof v.channelId === "string" && typeof v.kind === "string" && KINDS.has(v.kind);
}
function acceptEnvelope(event, ctx) {
  if (!ctx.allowOrigins.includes(event.origin))
    return false;
  if (ctx.expectedSource !== null && event.source !== ctx.expectedSource)
    return false;
  if (!isCherryEnvelope(event.data))
    return false;
  if (ctx.channelId !== null && event.data.channelId !== ctx.channelId)
    return false;
  return true;
}

// ../slicc/packages/cherry/dist/mount.js
function mountSliccImpl(options) {
  const iframe = document.createElement("iframe");
  const src = new URL(options.sliccOrigin);
  src.searchParams.set("cherry", "1");
  iframe.src = src.toString();
  iframe.style.border = "0";
  iframe.style.width = "100%";
  iframe.style.height = "100%";
  options.container.appendChild(iframe);
  let channelId = null;
  const hostHandler = createCdpHostHandler({
    capabilities: options.capabilities,
    onOpenUrl: options.hooks?.onOpenUrl
  });
  const post = (env) => {
    if (options.__test_post) {
      options.__test_post(env);
      return;
    }
    iframe.contentWindow?.postMessage(env, options.sliccOrigin);
  };
  const dispatchCdp = async (env) => {
    const domain = env.method.split(".")[0] ?? env.method;
    try {
      const granted = options.hooks?.onPermissionRequest ? await options.hooks.onPermissionRequest(domain) : true;
      if (!granted) {
        return { error: { code: -32601, message: `Cherry: permission denied for ${domain}` } };
      }
      const result = await hostHandler(env.method, env.params ?? {});
      return { result };
    } catch (err) {
      if (err instanceof CherryUnsupportedError) {
        return { error: { code: err.code, message: err.message } };
      }
      return {
        error: { code: -32e3, message: err instanceof Error ? err.message : String(err) }
      };
    }
  };
  const handleEnvelope = async (env) => {
    switch (env.kind) {
      case "handshake.hello": {
        channelId = env.channelId;
        const welcome = {
          cherry: CHERRY_PROTOCOL_VERSION,
          channelId,
          kind: "handshake.welcome",
          joinUrl: options.joinToken
        };
        post(welcome);
        options.hooks?.onHandshakeComplete?.();
        return void 0;
      }
      case "cdp.request": {
        const resp = await dispatchCdp(env);
        post({
          cherry: CHERRY_PROTOCOL_VERSION,
          channelId,
          kind: "cdp.response",
          id: env.id,
          ...resp
        });
        return resp;
      }
      case "slicc.event": {
        options.hooks?.onSliccEvent?.(env.name, env.detail);
        if (env.name === "open-url" && options.capabilities.openUrl) {
          const url = env.detail?.url;
          if (url)
            options.hooks?.onOpenUrl?.(url);
        }
        return void 0;
      }
      default:
        return void 0;
    }
  };
  const onMessage = (event) => {
    if (!acceptEnvelope(event, {
      allowOrigins: [options.sliccOrigin],
      expectedSource: iframe.contentWindow,
      channelId
    })) {
      if (isCherryEnvelope(event.data)) {
        console.warn("[cherry] rejected a cherry envelope (origin/source/channel mismatch)", {
          origin: event.origin,
          expectedOrigin: options.sliccOrigin
        });
      }
      return;
    }
    void handleEnvelope(event.data).catch((err) => {
      console.error("[cherry] envelope handling failed", err);
    });
  };
  window.addEventListener("message", onMessage);
  return {
    iframe,
    emitHostEvent(name, detail) {
      if (channelId === null) {
        console.warn("[cherry] emitHostEvent dropped before handshake completed", { name });
        return;
      }
      post({
        cherry: CHERRY_PROTOCOL_VERSION,
        channelId,
        kind: "host.event",
        name,
        detail
      });
    },
    destroy() {
      window.removeEventListener("message", onMessage);
      iframe.remove();
    },
    __test_receive: (env) => handleEnvelope(env)
  };
}

// ../slicc/packages/cherry/dist/index.js
function mountSlicc(options) {
  if (!options?.container) {
    throw new Error("mountSlicc: options.container is required");
  }
  return mountSliccImpl(options);
}
export {
  mountSlicc
};
