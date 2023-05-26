import browser from "webextension-polyfill";
import isChrome from "../common/ts/isChrome";
import onApiHeadersReceived from "./handlers/onApiHeadersReceived";
import onBeforeManifestRequest from "./handlers/onBeforeManifestRequest";
import onBeforeSendApiHeaders from "./handlers/onBeforeSendApiHeaders";
import onInstalledResetUpdateFlag from "./handlers/onInstalledResetUpdateFlag";
import onStartupStoreCleanup from "./handlers/onStartupStoreCleanup";
import onStartupUpdateCheck from "./handlers/onStartupUpdateCheck";

if (isChrome) {
  // Chrome shows two warnings when loading the extension:
  //  1. Unrecognized manifest key 'browser_specific_settings'.
  //  2. Manifest version 2 is deprecated.
  console.warn(
    "⬆️ THE TWO WARNINGS ABOVE ARE EXPECTED ⬆️ No need to report them."
  );
}

// Cleanup the session-related data in the store on startup.
browser.runtime.onStartup.addListener(onStartupStoreCleanup);

// Check for updates on startup.
browser.runtime.onStartup.addListener(onStartupUpdateCheck);

// Reset the `isUpdateAvailable` flag on update, since the update check is only
// performed at browser startup.
browser.runtime.onInstalled.addListener(onInstalledResetUpdateFlag);

// Redirect the HLS master manifest request to TTV LOL's API.
browser.webRequest.onBeforeRequest.addListener(
  onBeforeManifestRequest,
  {
    urls: [
      "https://usher.ttvnw.net/api/channel/hls/*",
      "https://usher.ttvnw.net/vod/*",
    ],
  },
  ["blocking"]
);

// Add the `X-Donate-To` header to API requests.
browser.webRequest.onBeforeSendHeaders.addListener(
  onBeforeSendApiHeaders,
  { urls: ["https://api.ttv.lol/playlist/*", "https://api.ttv.lol/vod/*"] },
  ["blocking", "requestHeaders"]
);

// Monitor API error responses.
browser.webRequest.onHeadersReceived.addListener(
  onApiHeadersReceived,
  { urls: ["https://api.ttv.lol/playlist/*", "https://api.ttv.lol/vod/*"] },
  ["blocking"]
);
