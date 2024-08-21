import Bowser from "bowser";
import browser from "webextension-polyfill";
import $ from "../common/ts/$";
import {
  anonymizeIpAddress,
  anonymizeIpAddresses,
} from "../common/ts/anonymizeIpAddress";
import { alpha2 } from "../common/ts/countryCodes";
import findChannelFromTwitchTvUrl from "../common/ts/findChannelFromTwitchTvUrl";
import isChannelWhitelisted from "../common/ts/isChannelWhitelisted";
import store from "../store";
import type { StreamStatus } from "../types";

type WarningBannerType = "noProxies";

//#region HTML Elements
const warningBannerNoProxiesElement = $(
  "#warning-banner-no-proxies"
) as HTMLDivElement;
const streamStatusElement = $("#stream-status") as HTMLDivElement;
const proxiedElement = $("#proxied") as HTMLDivElement;
const channelNameElement = $("#channel-name") as HTMLHeadingElement;
const reasonElement = $("#reason") as HTMLParagraphElement;
const infoContainerElement = $("#info-container") as HTMLDivElement;
const whitelistStatusElement = $("#whitelist-status") as HTMLDivElement;
const whitelistToggleElement = $("#whitelist-toggle") as HTMLInputElement;
const copyDebugInfoButtonElement = $(
  "#copy-debug-info-button"
) as HTMLButtonElement;
const copyDebugInfoButtonDescriptionElement = $(
  "#copy-debug-info-button-description"
) as HTMLParagraphElement;
//#endregion

if (store.readyState === "complete") main();
else store.addEventListener("load", main);

async function main() {
  const proxies = store.state.optimizedProxiesEnabled
    ? store.state.optimizedProxies
    : store.state.normalProxies;
  if (proxies.length === 0) {
    setWarningBanner("noProxies");
  }

  const tabs = await browser.tabs.query({ active: true, currentWindow: true });
  const activeTab = tabs[0];
  if (!activeTab || !activeTab.url) return;

  const channelName = findChannelFromTwitchTvUrl(activeTab.url);
  if (!channelName) return;

  setStreamStatusElement(channelName);
  store.addEventListener("change", () => setStreamStatusElement(channelName));
}

function setWarningBanner(type: WarningBannerType) {
  // Hide all warning banners.
  warningBannerNoProxiesElement.style.display = "none";

  switch (type) {
    case "noProxies":
      warningBannerNoProxiesElement.style.display = "block";
      break;
  }
}

function setStreamStatusElement(channelName: string) {
  const channelNameLower = channelName.toLowerCase();
  const isWhitelisted = isChannelWhitelisted(channelNameLower);
  const status = store.state.streamStatuses[channelNameLower];
  if (status) {
    setProxyStatus(channelNameLower, isWhitelisted, status);
    setWhitelistStatus(channelNameLower, isWhitelisted);
    streamStatusElement.style.display = "flex";
  } else {
    streamStatusElement.style.display = "none";
  }
}

function setProxyStatus(
  channelNameLower: string,
  isWhitelisted: boolean,
  status: StreamStatus
) {
  // Proxied
  if (status.proxied) {
    proxiedElement.classList.remove("error");
    proxiedElement.classList.remove("idle");
    proxiedElement.classList.add("success");
    proxiedElement.title = "Proxying";
  } else if (
    !status.proxied &&
    status.proxyHost &&
    status.stats &&
    status.stats.proxied > 0 &&
    store.state.optimizedProxiesEnabled &&
    store.state.optimizedProxies.length > 0 &&
    !isWhitelisted
  ) {
    proxiedElement.classList.remove("error");
    proxiedElement.classList.remove("success");
    proxiedElement.classList.add("idle");
    proxiedElement.title = "Idling";
  } else {
    proxiedElement.classList.remove("success");
    proxiedElement.classList.remove("idle");
    proxiedElement.classList.add("error");
    proxiedElement.title = "Not proxying";
  }
  // Channel name
  channelNameElement.textContent = channelNameLower;
  // Reason
  if (status.reason) {
    reasonElement.textContent = status.reason;
    reasonElement.style.display = "";
  } else if (status.stats) {
    reasonElement.textContent = getProxyStatusStatsMessage(status.stats);
    reasonElement.style.display = "";
  } else {
    reasonElement.style.display = "none";
  }
  // Info
  const messages = getProxyStatusMessages(status);
  infoContainerElement.innerHTML = "";
  infoContainerElement.style.display = messages.length > 0 ? "flex" : "none";
  for (const message of messages) {
    const smallElement = document.createElement("small");
    smallElement.className = "info";
    smallElement.textContent = message;
    infoContainerElement.appendChild(smallElement);
  }
}

function getProxyStatusStatsMessage(
  stats: NonNullable<StreamStatus["stats"]>
): string {
  const formatter = new Intl.NumberFormat("en-US");
  return `Proxied: ${formatter.format(
    stats.proxied
  )} | Not proxied: ${formatter.format(stats.notProxied)}`;
}

function getProxyStatusMessages(status: StreamStatus): string[] {
  const messages = [];
  if (status.reason && status.stats) {
    messages.push(getProxyStatusStatsMessage(status.stats));
  }
  if (status.proxyHost) {
    messages.push(`Proxy: ${anonymizeIpAddress(status.proxyHost)}`);
  }
  if (status.proxyCountry) {
    messages.push(
      `Country: ${
        (alpha2 as Record<string, string>)[status.proxyCountry] ??
        status.proxyCountry
      }`
    );
  }
  if (store.state.optimizedProxiesEnabled) {
    messages.push("Using optimized proxies");
  }
  return messages;
}

function setWhitelistStatus(channelNameLower: string, isWhitelisted: boolean) {
  whitelistStatusElement.setAttribute("data-channel", channelNameLower);
  whitelistStatusElement.setAttribute("data-whitelisted", `${isWhitelisted}`);
  whitelistToggleElement.checked = isWhitelisted;
}

whitelistToggleElement.addEventListener("change", e => {
  const channelNameLower = whitelistStatusElement.getAttribute("data-channel");
  if (!channelNameLower) return alert("Channel name not found.");
  const target = e.target as HTMLInputElement;
  const isWhitelisted = target.checked;
  if (isWhitelisted) {
    // Add channel name to whitelist.
    store.state.whitelistedChannels.push(channelNameLower);
  } else {
    // Remove channel name from whitelist.
    store.state.whitelistedChannels = store.state.whitelistedChannels.filter(
      id => id !== channelNameLower
    );
  }
  whitelistStatusElement.setAttribute("data-whitelisted", `${isWhitelisted}`);
  browser.tabs.reload();
});

copyDebugInfoButtonElement.addEventListener("click", async e => {
  const extensionInfo = await browser.management.getSelf();
  const userAgentParser = Bowser.getParser(window.navigator.userAgent);
  const tabs = await browser.tabs.query({ active: true, currentWindow: true });
  const activeTab = tabs[0];
  const channelName =
    activeTab?.url != null ? findChannelFromTwitchTvUrl(activeTab.url) : null;
  const channelNameLower =
    channelName != null ? channelName.toLowerCase() : null;
  const isWhitelisted =
    channelNameLower != null ? isChannelWhitelisted(channelNameLower) : null;
  const status =
    channelNameLower != null
      ? store.state.streamStatuses[channelNameLower]
      : null;
  const proxySettings = await browser.proxy.settings.get({});

  const debugInfo = [
    `**Debug Info**\n`,
    `Extension: ${extensionInfo.name} v${extensionInfo.version} (${extensionInfo.installType})\n`,
    `Browser: ${userAgentParser.getBrowserName()} ${userAgentParser.getBrowserVersion()} (${userAgentParser.getOSName()} ${userAgentParser.getOSVersion()})\n`,
    `Options:\n`,
    `- Passport level: ${store.state.passportLevel}\n`,
    `- Anonymous mode: ${store.state.anonymousMode}\n`,
    store.state.optimizedProxiesEnabled
      ? `- Using optimized proxies: ${JSON.stringify(
          e.shiftKey
            ? store.state.optimizedProxies
            : anonymizeIpAddresses(store.state.optimizedProxies)
        )}\n`
      : `- Using normal proxies: ${JSON.stringify(
          e.shiftKey
            ? store.state.normalProxies
            : anonymizeIpAddresses(store.state.normalProxies)
        )}\n`,
    channelName != null
      ? [
          `Channel name: ${channelName}${
            isWhitelisted ? " (whitelisted)" : ""
          }\n`,
          `Stream status:\n`,
          status != null
            ? [
                `- Reason: ${status.reason ?? "N/A"}\n`,
                `- Proxied: ${status.stats?.proxied ?? "N/A"}, Not proxied: ${
                  status.stats?.notProxied ?? "N/A"
                }\n`,
                `- Proxy: ${
                  status.proxyHost != null
                    ? anonymizeIpAddress(status.proxyHost)
                    : "N/A"
                }\n`,
                `- Country: ${status.proxyCountry ?? "N/A"}\n`,
              ].join("")
            : "",
          `Proxy level of control: ${proxySettings.levelOfControl}\n`,
        ].join("")
      : "",
    store.state.adLog.length > 0
      ? `Latest ad log entry: ${JSON.stringify({
          ...store.state.adLog[store.state.adLog.length - 1],
          videoWeaverUrl: undefined,
        })}\n`
      : "",
  ].join("");

  try {
    await navigator.clipboard.writeText(debugInfo);
    copyDebugInfoButtonDescriptionElement.textContent = "Copied to clipboard!";
  } catch (error) {
    copyDebugInfoButtonDescriptionElement.textContent = `Failed to copy to clipboard: ${error}`;
  }
});
