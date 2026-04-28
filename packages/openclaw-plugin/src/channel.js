const CHANNEL_ID = "clawchat";
const DEFAULT_PUSH_URL = "http://localhost:3003/api/push";

let _runtime = null;

function getRuntime() {
  return _runtime;
}

function setRuntime(runtime) {
  _runtime = runtime;
}

/**
 * Read ClawChat channel config from openclaw.json
 */
function getChannelConfig(cfg) {
  return cfg?.channels?.[CHANNEL_ID] ?? {};
}

/**
 * Send a message to ClawChat via HTTP push endpoint.
 */
async function sendClawChatMessage({ to, content, cfg }) {
  const channelCfg = getChannelConfig(cfg);
  const pushUrl = channelCfg.pushUrl || DEFAULT_PUSH_URL;
  const pushSecret = channelCfg.pushSecret || "";
  const defaultRoom = channelCfg.defaultRoom || "🔔 Notifications";

  // Resolve target: explicit `to` overrides defaultRoom from config
  const resolvedTo = to || defaultRoom;

  const body = {
    message: content,
    source: "OpenClaw",
    to: resolvedTo,
    ...(pushSecret ? { secret: pushSecret } : {}),
  };

  const resp = await fetch(pushUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!resp.ok) {
    const text = await resp.text().catch(() => "");
    throw new Error(`ClawChat push failed: ${resp.status} ${text}`);
  }

  const result = await resp.json();
  return {
    channel: CHANNEL_ID,
    messageId: result.messageId || `clawchat-${Date.now()}`,
    chatId: to || "notifications",
  };
}

// ── Channel plugin definition ──

const meta = {
  id: CHANNEL_ID,
  label: "ClawChat",
  selectionLabel: "ClawChat (Web)",
  detailLabel: "ClawChat Web Client",
  docsPath: `/channels/${CHANNEL_ID}`,
  docsLabel: CHANNEL_ID,
  blurb: "ClawChat Web 客户端推送插件",
  systemImage: "bubble.left.and.bubble.right.fill",
};

export const clawchatPlugin = {
  id: CHANNEL_ID,
  meta: {
    ...meta,
    quickstartAllowFrom: false,
  },
  pairing: {
    idLabel: "clawchatUserId",
    normalizeAllowEntry: (entry) => entry.trim(),
  },
  capabilities: {
    chatTypes: ["direct", "group"],
    reactions: false,
    threads: false,
    media: false,
    nativeCommands: false,
    blockStreaming: true,
  },
  reload: { configPrefixes: [`channels.${CHANNEL_ID}`] },
  config: {
    listAccountIds: () => ["default"],
    resolveAccount: (cfg) => {
      const channelCfg = getChannelConfig(cfg);
      return {
        accountId: "default",
        name: channelCfg.name || "ClawChat",
        enabled: channelCfg.enabled !== false,
        pushUrl: channelCfg.pushUrl || DEFAULT_PUSH_URL,
        pushSecret: channelCfg.pushSecret || "",
        config: channelCfg,
      };
    },
    defaultAccountId: () => "default",
    isConfigured: (account) => {
      return Boolean(account.pushUrl?.trim());
    },
    describeAccount: (account) => ({
      accountId: account.accountId || "default",
      name: account.name || "ClawChat",
      enabled: account.enabled !== false,
      configured: Boolean(account.pushUrl?.trim()),
      pushUrl: account.pushUrl,
    }),
  },
  setup: (input) => {
    // Minimal setup: just read config
    const channelCfg = getChannelConfig(input.cfg);
    return {
      ok: true,
      pushUrl: channelCfg.pushUrl || DEFAULT_PUSH_URL,
    };
  },
  messaging: {
    normalizeTarget: (target) => target?.trim() || undefined,
    targetResolver: {
      looksLikeId: (id) => Boolean(id?.trim()),
      hint: "<roomName|roomId>",
    },
  },
  directory: {
    self: async () => null,
    listPeers: async () => [],
    listGroups: async () => [],
  },
  outbound: {
    deliveryMode: "gateway",
    textChunkLimit: 4000,
    sendText: async ({ to, text, cfg }) => {
      return sendClawChatMessage({ to, content: text, cfg });
    },
    sendMedia: async ({ to, text, mediaUrl, cfg }) => {
      const content = text
        ? mediaUrl ? `${text}\n📎 ${mediaUrl}` : text
        : mediaUrl ? `📎 ${mediaUrl}` : "";
      return sendClawChatMessage({ to, content, cfg });
    },
  },
  security: {
    resolveDmPolicy: () => ({
      policy: "open",
      allowFrom: [],
    }),
  },
  status: {
    defaultRuntime: {
      accountId: "default",
      running: false,
      lastStartAt: null,
      lastStopAt: null,
      lastError: null,
    },
    collectStatusIssues: (accounts) =>
      accounts.flatMap((entry) => {
        if (!entry.enabled) return [];
        if (!entry.configured) {
          return [{
            channel: CHANNEL_ID,
            accountId: entry.accountId || "default",
            kind: "config",
            message: "ClawChat pushUrl 未配置",
            fix: `Set channels.clawchat.pushUrl in openclaw.json`,
          }];
        }
        return [];
      }),
    buildChannelSummary: ({ snapshot }) => ({
      configured: snapshot.configured ?? false,
      running: snapshot.running ?? false,
      lastStartAt: snapshot.lastStartAt ?? null,
      lastStopAt: snapshot.lastStopAt ?? null,
      lastError: snapshot.lastError ?? null,
    }),
    probeAccount: async ({ cfg }) => {
      const channelCfg = getChannelConfig(cfg);
      const pushUrl = channelCfg.pushUrl || DEFAULT_PUSH_URL;
      const healthUrl = pushUrl.replace(/\/push$/, "/health");
      try {
        const resp = await fetch(healthUrl, { signal: AbortSignal.timeout(5000) });
        return { ok: resp.ok, status: resp.status };
      } catch {
        return { ok: false, status: 0 };
      }
    },
    buildAccountSnapshot: ({ account, runtime }) => ({
      accountId: account.accountId || "default",
      name: account.name || "ClawChat",
      enabled: account.enabled !== false,
      configured: Boolean(account.pushUrl?.trim()),
      running: runtime?.running ?? false,
      lastStartAt: runtime?.lastStartAt ?? null,
      lastStopAt: runtime?.lastStopAt ?? null,
      lastError: runtime?.lastError ?? null,
    }),
  },
  gateway: {
    startAccount: async (ctx) => {
      const channelCfg = getChannelConfig(ctx.cfg);
      const pushUrl = channelCfg.pushUrl || DEFAULT_PUSH_URL;
      ctx.log?.info?.(`ClawChat channel started (pushUrl: ${pushUrl})`);

      // Keep alive until abort
      await new Promise((resolve) => {
        if (ctx.abortSignal.aborted) { resolve(); return; }
        ctx.abortSignal.addEventListener("abort", () => resolve(), { once: true });
      });
    },
  },
};

export { CHANNEL_ID, getRuntime, setRuntime, sendClawChatMessage };
