import browser from "webextension-polyfill";
import $ from "../common/ts/$";
import { TWITCH_URL_REGEX } from "../common/ts/regexes";
import store from "../store";

//#region HTML Elements
const updateBannerElement = $("#update-banner") as HTMLDivElement;
const streamStatusElement = $("#stream-status") as HTMLDivElement;
const redirectedElement = $("#redirected") as HTMLSpanElement;
const streamIdElement = $("#stream-id") as HTMLSpanElement;
const reasonElement = $("#reason") as HTMLElement;
const proxyCountryElement = $("#proxy-country") as HTMLElement;
const whitelistStatusElement = $("#whitelist-status") as HTMLDivElement;
const whitelistToggle = $("#whitelist-toggle") as HTMLInputElement;
const whitelistToggleLabel = $("#whitelist-toggle-label") as HTMLLabelElement;
//#endregion

if (store.readyState === "complete") main();
else store.addEventListener("load", main);

async function main() {
  // Show update banner if an update is available.
  if (store.state.isUpdateAvailable) {
    updateBannerElement.style.display = "block";
  }

  const tabs = await browser.tabs.query({ active: true, currentWindow: true });
  const activeTab = tabs[0];
  if (!activeTab || !activeTab.url) return;

  const match = TWITCH_URL_REGEX.exec(activeTab.url);
  if (!match) return;
  const [, streamId] = match;
  if (!streamId) return;

  setStreamStatusElement(streamId);
  store.addEventListener("change", () => setStreamStatusElement(streamId));
}

function setStreamStatusElement(streamId: string) {
  const streamIdLower = streamId.toLowerCase();
  const status = store.state.streamStatuses[streamIdLower];
  if (status) {
    streamStatusElement.style.display = "flex";
    if (status.redirected) {
      redirectedElement.classList.remove("error");
      redirectedElement.classList.add("success");
    } else {
      redirectedElement.classList.remove("success");
      redirectedElement.classList.add("error");
    }
    streamIdElement.textContent = streamId;
    if (status.reason) {
      reasonElement.textContent = status.reason;
    } else {
      reasonElement.style.display = "none";
    }
    if (status.proxyCountry) {
      proxyCountryElement.textContent = `Proxy country: ${status.proxyCountry}`;
    } else {
      proxyCountryElement.style.display = "none";
    }
  } else {
    streamStatusElement.style.display = "none";
  }
  setWhitelistToggleElement(streamId);
}

function setWhitelistToggleElement(streamId: string) {
  const streamIdLower = streamId.toLowerCase();
  const status = store.state.streamStatuses[streamIdLower];
  if (status) {
    whitelistToggle.checked =
      store.state.whitelistedChannels.includes(streamId);
    whitelistToggle.addEventListener("change", e => {
      const target = e.target as HTMLInputElement;
      if (target.checked) {
        store.state.whitelistedChannels.push(streamId);
      } else {
        store.state.whitelistedChannels =
          store.state.whitelistedChannels.filter(id => id !== streamId);
      }
      updateWhitelistToggleLabel(target.checked);
      browser.tabs.reload();
    });
    updateWhitelistToggleLabel(whitelistToggle.checked);
    whitelistStatusElement.style.display = "flex";
  } else {
    whitelistStatusElement.style.display = "none";
  }
}

function updateWhitelistToggleLabel(checked: boolean) {
  if (checked) {
    whitelistToggleLabel.textContent = "✓ Whitelisted";
  } else {
    whitelistToggleLabel.textContent = "+ Whitelist";
  }
}
