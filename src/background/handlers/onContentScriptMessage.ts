import browser, { Runtime } from "webextension-polyfill";
import { updateProxySettings } from "../../common/ts/proxySettings";
import { getStreamStatus, setStreamStatus } from "../../common/ts/streamStatus";
import store from "../../store";
import { MessageType, ProxyRequestType } from "../../types";

type Timeout = string | number | NodeJS.Timeout | undefined;

const timeoutMap: Map<ProxyRequestType, Timeout> = new Map();
const fetchTimeoutMsOverride: Map<ProxyRequestType, number> = new Map([
  [ProxyRequestType.Usher, 7000], // Account for slow page load.
]);

export default function onContentScriptMessage(
  message: any,
  sender: Runtime.MessageSender,
  sendResponse: (message: any) => void
): true | undefined | Promise<any> {
  if (message.type === MessageType.EnableFullMode) {
    if (!sender.tab?.id) return;

    const requestType = message.requestType as ProxyRequestType;

    // Clear existing timeout for request type.
    if (timeoutMap.has(requestType)) {
      clearTimeout(timeoutMap.get(requestType));
    }

    // Set new timeout for request type.
    const fetchTimeoutMs = fetchTimeoutMsOverride.has(requestType)
      ? fetchTimeoutMsOverride.get(requestType)!
      : 3000; // Time for fetch to be called.
    const replyTimeoutMs = Date.now() - message.timestamp; // Time for reply to be received.
    timeoutMap.set(
      requestType,
      setTimeout(() => {
        console.log(
          `🔴 Disabled full mode (request type: ${requestType}, timeout)`
        );
        timeoutMap.delete(requestType);
        if (store.state.chromiumProxyActive) {
          updateProxySettings([...timeoutMap.keys()]);
        }
      }, fetchTimeoutMs + replyTimeoutMs)
    );
    if (store.state.chromiumProxyActive) {
      updateProxySettings([...timeoutMap.keys()]);
    }

    console.log(
      `🟢 Enabled full mode for ${
        fetchTimeoutMs + replyTimeoutMs
      }ms (request type: ${requestType})`
    );
    try {
      browser.tabs.sendMessage(sender.tab.id, {
        type: MessageType.EnableFullModeResponse,
      });
    } catch (error) {
      console.error("❌ Failed to send EnableFullModeResponse message", error);
    }
  }

  if (message.type === MessageType.DisableFullMode) {
    const requestType = message.requestType as ProxyRequestType;
    // Clear existing timeout for request type.
    if (timeoutMap.has(requestType)) {
      clearTimeout(timeoutMap.get(requestType));
      timeoutMap.delete(requestType);
    }
    if (store.state.chromiumProxyActive) {
      updateProxySettings([...timeoutMap.keys()]);
    }
    console.log(`🔴 Disabled full mode (request type: ${requestType})`);
  }

  if (message.type === MessageType.UsherResponse) {
    const { channel, videoWeaverUrls, proxyCountry } = message;
    // Update Video Weaver URLs.
    store.state.videoWeaverUrlsByChannel[channel] = [
      ...(store.state.videoWeaverUrlsByChannel[channel] ?? []),
      ...videoWeaverUrls,
    ];
    // Update proxy country.
    const streamStatus = getStreamStatus(channel);
    setStreamStatus(channel, {
      ...(streamStatus ?? { proxied: false, reason: "" }),
      proxyCountry,
    });
  }
}
