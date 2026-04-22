import { clawchatPlugin, setRuntime } from "./src/channel.js";

const plugin = {
  id: "clawchat-openclaw-plugin",
  name: "ClawChat",
  description: "ClawChat Web 客户端推送插件",
  configSchema: { type: "object", properties: {}, additionalProperties: false },
  register(api) {
    setRuntime(api.runtime);
    api.registerChannel({ plugin: clawchatPlugin });
  },
};

export default plugin;
