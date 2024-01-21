import pageScriptURL from "url:../page/page.ts";
import workerScriptURL from "url:../page/worker.ts";
import browser, { Storage } from "webextension-polyfill";
import findChannelFromTwitchTvUrl from "../common/ts/findChannelFromTwitchTvUrl";
import isChromium from "../common/ts/isChromium";
import { getStreamStatus, setStreamStatus } from "../common/ts/streamStatus";
import store from "../store";
import { State } from "../store/types";
import { MessageType } from "../types";

console.info("[TTV LOL PRO] Content script running.");

if (isChromium) injectPageScript();
// Firefox uses FilterResponseData to inject the page script.

if (store.readyState === "complete") onStoreReady();
else store.addEventListener("load", onStoreReady);

browser.runtime.onMessage.addListener(onBackgroundMessage);
window.addEventListener("message", onPageMessage);

function injectPageScript() {
  // From https://stackoverflow.com/a/9517879
  const script = document.createElement("script");
  script.src = pageScriptURL; // src/page/page.ts
  script.dataset.params = JSON.stringify({
    isChromium,
    workerScriptURL, // src/page/worker.ts
  });
  script.onload = () => script.remove();
  // ---------------------------------------
  // 🦊 Attention Firefox Addon Reviewer 🦊
  // ---------------------------------------
  // Please note that this does NOT involve remote code execution. The injected scripts are bundled
  // with the extension. The `url:` imports above are used to get the runtime URLs of the respective scripts.
  // Additionally, there is no custom Content Security Policy (CSP) in use.
  (document.head || document.documentElement).prepend(script); // Note: Despite what the TS types say, `document.head` can be `null`.
}

function onStoreReady() {
  // Clear stats for stream on page load/reload.
  clearStats();
}

/**
 * Clear stats for stream on page load/reload.
 * @returns
 */
function clearStats() {
  const channelName = findChannelFromTwitchTvUrl(location.href);
  if (!channelName) return;

  if (store.state.streamStatuses.hasOwnProperty(channelName)) {
    store.state.streamStatuses[channelName].stats = {
      proxied: 0,
      notProxied: 0,
    };
  }
  console.log(
    `[TTV LOL PRO] Cleared stats for channel '${channelName}' (content script).`
  );
}

function onBackgroundMessage(message: any) {
  switch (message.type) {
    case MessageType.EnableFullModeResponse:
      window.postMessage({
        type: MessageType.PageScriptMessage,
        message,
      });
      window.postMessage({
        type: MessageType.WorkerScriptMessage,
        message,
      });
      break;
  }
}

function onPageMessage(event: MessageEvent) {
  if (event.data?.type !== MessageType.ContentScriptMessage) return;

  const message = event.data?.message;
  if (!message) return;

  switch (message.type) {
    case MessageType.GetStoreState:
      const sendStoreState = () => {
        window.postMessage({
          type: MessageType.PageScriptMessage,
          message: {
            type: MessageType.GetStoreStateResponse,
            state: JSON.parse(JSON.stringify(store.state)),
          },
        });
      };
      if (store.readyState === "complete") sendStoreState();
      else store.addEventListener("load", sendStoreState);
      break;
    case MessageType.EnableFullMode:
      try {
        browser.runtime.sendMessage(message);
      } catch (error) {
        console.error(
          "[TTV LOL PRO] Failed to send EnableFullMode message",
          error
        );
      }
      break;
    case MessageType.DisableFullMode:
      try {
        browser.runtime.sendMessage(message);
      } catch (error) {
        console.error(
          "[TTV LOL PRO] Failed to send DisableFullMode message",
          error
        );
      }
      break;
    case MessageType.UsherResponse:
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
      break;
    case MessageType.ClearStats:
      clearStats();
      break;
  }
}

store.addEventListener(
  "change",
  (changes: Record<string, Storage.StorageChange>) => {
    const changedKeys = Object.keys(changes) as (keyof State)[];
    // This is mainly to reduce the amount of messages sent to the page script.
    // (Also to reduce the number of console logs.)
    const ignoredKeys: (keyof State)[] = [
      "adLog",
      "dnsResponses",
      "openedTwitchTabs",
      "streamStatuses",
      "videoWeaverUrlsByChannel",
    ];
    if (changedKeys.every(key => ignoredKeys.includes(key))) return;
    console.log("[TTV LOL PRO] Store changed:", changes);
    window.postMessage({
      type: MessageType.PageScriptMessage,
      message: {
        type: MessageType.GetStoreStateResponse,
        state: JSON.parse(JSON.stringify(store.state)),
      },
    });
  }
);

async function waitForElm(selector: string): Promise<Element | null> {
  return new Promise(resolve => {
    if (document.querySelector(selector)) {
      return resolve(document.querySelector(selector));
    }

    const observer = new MutationObserver(mutations => {
      if (document.querySelector(selector)) {
        observer.disconnect();
        resolve(document.querySelector(selector));
      }
    });

    observer.observe(document.documentElement, {
      childList: true,
      subtree: true,
    });
  });
}

// FIXME: Listen to channel change event and renew observer.
waitForElm(".video-player__overlay").then((elm: Element | null) => {
  if (!elm) {
    return console.error("[TTV LOL PRO] Video player overlay not found.");
  }
  console.log("[TTV LOL PRO] Video player overlay loaded.");
  const adSelectors = [
    'span[data-a-target="video-ad-label"]',
    'span[data-a-target="video-ad-countdown"]',
  ];
  const observer = new MutationObserver(mutations => {
    const adDetected = mutations.some(
      mutation =>
        mutation.type === "childList" &&
        Array.from(mutation.addedNodes).some(
          node =>
            node instanceof Element &&
            (adSelectors.some(s => node.matches(s)) ||
              node.querySelector(adSelectors.join(",")) != null)
        )
    );
    if (adDetected) {
      console.log(
        "[TTV LOL PRO] AD DETECTED ALERT THERE IS AN ADVERT ALERT ALERT ALERT AD AD AD AD AD"
      );
    }
  });
  observer.observe(elm, {
    childList: true,
    subtree: true,
  });
});
