# clawchat-openclaw-plugin

OpenClaw channel plugin for ClawChat. Enables native delivery/announce support so cron jobs, heartbeats, and agent messages can be pushed to ClawChat via the `/api/push` HTTP endpoint.

## Setup

1. Copy or symlink this package to `~/.openclaw/extensions/clawchat-openclaw-plugin/`
2. Add to `~/.openclaw/openclaw.json`:

```jsonc
{
  "channels": {
    "clawchat": {
      "enabled": true,
      "pushUrl": "http://localhost:3003/api/push",
      "pushSecret": ""  // optional
    }
  },
  "plugins": {
    "entries": {
      "clawchat-openclaw-plugin": { "enabled": true }
    },
    "installs": {
      "clawchat-openclaw-plugin": {
        "source": "local",
        "installPath": "~/.openclaw/extensions/clawchat-openclaw-plugin"
      }
    },
    "allow": ["clawchat-openclaw-plugin"]
  }
}
```

3. Restart OpenClaw Gateway

## How it works

- **Outbound only**: ClawChat → OpenClaw is handled by BotBridge (WebSocket client), unchanged.
- **This plugin handles OpenClaw → ClawChat**: when the Gateway needs to deliver a message (cron announce, agent reply), it calls `sendText()` which HTTP POSTs to ClawChat's `/api/push` endpoint.
- ClawChat server receives the push and broadcasts it to the 🔔 Notifications room via Socket.IO.
