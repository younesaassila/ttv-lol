import browser, { Proxy } from "webextension-polyfill";
import findChannelFromTwitchTvUrl from "../../common/ts/findChannelFromTwitchTvUrl";
import findChannelFromUsherUrl from "../../common/ts/findChannelFromUsherUrl";
import findChannelFromVideoWeaverUrl from "../../common/ts/findChannelFromVideoWeaverUrl";
import getHostFromUrl from "../../common/ts/getHostFromUrl";
import isChannelWhitelisted from "../../common/ts/isChannelWhitelisted";
import isFlaggedRequest from "../../common/ts/isFlaggedRequest";
import isRequestTypeProxied from "../../common/ts/isRequestTypeProxied";
import { getProxyInfoFromUrl } from "../../common/ts/proxyInfo";
import {
  passportHostRegex,
  twitchGqlHostRegex,
  twitchTvHostRegex,
  usherHostRegex,
  videoWeaverHostRegex,
} from "../../common/ts/regexes";
import store from "../../store";
import { ProxyInfo, ProxyRequestType } from "../../types";

export default async function onProxyRequest(
  details: Proxy.OnRequestDetailsType
): Promise<ProxyInfo | ProxyInfo[]> {
  // Wait for the store to be ready.
  if (store.readyState !== "complete") {
    await new Promise(resolve => {
      const listener = () => {
        store.removeEventListener("load", listener);
        resolve(onProxyRequest(details));
      };
      store.addEventListener("load", listener);
    });
  }

  const host = getHostFromUrl(details.url);
  if (!host) return { type: "DIRECT" };

  const documentHost = details.documentUrl
    ? getHostFromUrl(details.documentUrl)
    : null;
  // Twitch requests from non-Twitch hosts are not supported.
  if (
    documentHost != null && // Twitch webpage requests have no document URL.
    !passportHostRegex.test(documentHost) && // Passport requests have a `passport.twitch.tv` document URL.
    !twitchTvHostRegex.test(documentHost)
  ) {
    return { type: "DIRECT" };
  }

  const proxies = store.state.optimizedProxiesEnabled
    ? store.state.optimizedProxies
    : store.state.normalProxies;
  const proxyInfoArray = getProxyInfoArrayFromUrls(proxies);

  const requestParams = {
    isChromium: false,
    optimizedProxiesEnabled: store.state.optimizedProxiesEnabled,
    passportLevel: store.state.passportLevel,
    isFlagged: isFlaggedRequest(details.requestHeaders),
  };
  const proxyPassportRequest = isRequestTypeProxied(
    ProxyRequestType.Passport,
    requestParams
  );
  const proxyUsherRequest = isRequestTypeProxied(
    ProxyRequestType.Usher,
    requestParams
  );
  const proxyVideoWeaverRequest = isRequestTypeProxied(
    ProxyRequestType.VideoWeaver,
    requestParams
  );
  const proxyGraphQLRequest = isRequestTypeProxied(
    ProxyRequestType.GraphQL,
    requestParams
  );
  const proxyTwitchWebpageRequest = isRequestTypeProxied(
    ProxyRequestType.TwitchWebpage,
    requestParams
  );

  // Passport requests.
  if (proxyPassportRequest && passportHostRegex.test(host)) {
    console.log(
      `⌛ Proxying ${details.url} through one of: ${
        proxies.toString() || "<empty>"
      }`
    );
    return proxyInfoArray;
  }

  // Usher requests.
  if (proxyUsherRequest && usherHostRegex.test(host)) {
    if (details.url.includes("/vod/")) {
      console.log(`✋ '${details.url}' is a VOD manifest.`);
      return { type: "DIRECT" };
    }
    const channelName = findChannelFromUsherUrl(details.url);
    if (isChannelWhitelisted(channelName)) {
      console.log(`✋ Channel '${channelName}' is whitelisted.`);
      return { type: "DIRECT" };
    }
    console.log(
      `⌛ Proxying ${details.url} (${
        channelName ?? "unknown"
      }) through one of: ${proxies.toString() || "<empty>"}`
    );
    return proxyInfoArray;
  }

  // Video Weaver requests.
  if (proxyVideoWeaverRequest && videoWeaverHostRegex.test(host)) {
    let tabUrl: string | undefined = undefined;
    try {
      const tab = await browser.tabs.get(details.tabId);
      tabUrl = tab.url;
    } catch {}
    const channelName =
      findChannelFromVideoWeaverUrl(details.url) ??
      findChannelFromTwitchTvUrl(tabUrl);
    if (isChannelWhitelisted(channelName)) {
      console.log(`✋ Channel '${channelName}' is whitelisted.`);
      return { type: "DIRECT" };
    }
    console.log(
      `⌛ Proxying ${details.url} (${
        channelName ?? "unknown"
      }) through one of: ${proxies.toString() || "<empty>"}`
    );
    return proxyInfoArray;
  }

  // Twitch GraphQL requests.
  if (proxyGraphQLRequest && twitchGqlHostRegex.test(host)) {
    console.log(
      `⌛ Proxying ${details.url} through one of: ${
        proxies.toString() || "<empty>"
      }`
    );
    return proxyInfoArray;
  }

  // Twitch webpage requests.
  if (proxyTwitchWebpageRequest && twitchTvHostRegex.test(host)) {
    console.log(
      `⌛ Proxying ${details.url} through one of: ${
        proxies.toString() || "<empty>"
      }`
    );
    return proxyInfoArray;
  }

  return { type: "DIRECT" };
}

function getProxyInfoArrayFromUrls(urls: string[]): ProxyInfo[] {
  return [
    ...urls.map(getProxyInfoFromUrl),
    { type: "DIRECT" } as ProxyInfo, // Fallback to direct connection if all proxies fail.
  ];
}
