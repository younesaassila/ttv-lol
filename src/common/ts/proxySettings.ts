import store from "../../store";
import { ProxyRequestType } from "../../types";
import isRequestTypeProxied from "./isRequestTypeProxied";
import { getProxyInfoFromUrl, getUrlFromProxyInfo } from "./proxyInfo";
import {
  passportHostRegex,
  twitchGqlHostRegex,
  twitchTvHostRegex,
  usherHostRegex,
  videoWeaverHostRegex,
} from "./regexes";
import updateDnsResponses from "./updateDnsResponses";

export function updateProxySettings(requestFilter?: ProxyRequestType[]) {
  const { optimizedProxiesEnabled, passportLevel } = store.state;

  const proxies = optimizedProxiesEnabled
    ? store.state.optimizedProxies
    : store.state.normalProxies;
  const proxyInfoString = getProxyInfoStringFromUrls(proxies);

  const getRequestParams = (requestType: ProxyRequestType) => ({
    isChromium: true,
    optimizedProxiesEnabled: optimizedProxiesEnabled,
    passportLevel: passportLevel,
    fullModeEnabled:
      !optimizedProxiesEnabled ||
      (requestFilter != null && requestFilter.includes(requestType)),
  });
  const proxyPassportRequests = isRequestTypeProxied(
    ProxyRequestType.Passport,
    getRequestParams(ProxyRequestType.Passport)
  );
  const proxyUsherRequests = isRequestTypeProxied(
    ProxyRequestType.Usher,
    getRequestParams(ProxyRequestType.Usher)
  );
  const proxyVideoWeaverRequests = isRequestTypeProxied(
    ProxyRequestType.VideoWeaver,
    getRequestParams(ProxyRequestType.VideoWeaver)
  );
  const proxyGraphQLRequests = isRequestTypeProxied(
    ProxyRequestType.GraphQL,
    getRequestParams(ProxyRequestType.GraphQL)
  );
  const proxyTwitchWebpageRequests = isRequestTypeProxied(
    ProxyRequestType.TwitchWebpage,
    getRequestParams(ProxyRequestType.TwitchWebpage)
  );

  const config = {
    mode: "pac_script",
    pacScript: {
      data: `
        function FindProxyForURL(url, host) {
          // Passport requests.
          if (${proxyPassportRequests} && ${passportHostRegex}.test(host)) {
            return "${proxyInfoString}";
          }
          // Usher requests.
          if (${proxyUsherRequests} && ${usherHostRegex}.test(host)) {
            return "${proxyInfoString}";
          }
          // Video Weaver requests.
          if (${proxyVideoWeaverRequests} && ${videoWeaverHostRegex}.test(host)) {
            return "${proxyInfoString}";
          }
          // GraphQL requests.
          if (${proxyGraphQLRequests} && ${twitchGqlHostRegex}.test(host)) {
            return "${proxyInfoString}";
          }
          // Twitch webpage requests.
          if (${proxyTwitchWebpageRequests} && ${twitchTvHostRegex}.test(host)) {
            return "${proxyInfoString}";
          }
          return "DIRECT";
        }
      `,
    },
  };

  chrome.proxy.settings.set({ value: config, scope: "regular" }, function () {
    console.log(
      `⚙️ Proxying requests through one of: ${proxies.toString() || "<empty>"}`
    );
    store.state.chromiumProxyActive = true;
    updateDnsResponses();
  });
}

function getProxyInfoStringFromUrls(urls: string[]): string {
  return [
    ...urls.map(url => {
      const proxyInfo = getProxyInfoFromUrl(url);
      return `${proxyInfo.type} ${getUrlFromProxyInfo({
        ...proxyInfo,
        // Don't include username/password in PAC script.
        username: undefined,
        password: undefined,
      })}`;
    }),
    "DIRECT",
  ].join("; ");
}

export function clearProxySettings() {
  chrome.proxy.settings.clear({ scope: "regular" }, function () {
    console.log("⚙️ Proxy settings cleared");
    store.state.chromiumProxyActive = false;
  });
}
