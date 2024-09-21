import { WebRequest } from "webextension-polyfill";
import filterResponseDataWrapper from "../../common/ts/filterResponseDataWrapper";
import findChannelFromVideoWeaverUrl from "../../common/ts/findChannelFromVideoWeaverUrl";
import getHostFromUrl from "../../common/ts/getHostFromUrl";
import { getUrlFromProxyInfo } from "../../common/ts/proxyInfo";
import { videoWeaverHostRegex } from "../../common/ts/regexes";
import store from "../../store";
import { AdType, ProxyInfo } from "../../types";

export default function onBeforeVideoWeaverRequest(
  details: WebRequest.OnBeforeRequestDetailsType & {
    proxyInfo?: ProxyInfo;
  }
): WebRequest.BlockingResponseOrPromise | undefined {
  // Filter to video-weaver responses.
  const host = getHostFromUrl(details.url);
  if (!host || !videoWeaverHostRegex.test(host)) return;
  if (!store.state.adLogEnabled) return;

  filterResponseDataWrapper(details, text => {
    const adSignifier = "stitched-ad";
    const midrollSignifier = "midroll";

    const textLower = text.toLowerCase();
    const isAd = textLower.includes(adSignifier);
    const isMidroll = textLower.includes(midrollSignifier);
    if (!isAd && !isMidroll) return text;

    const isDuplicate = store.state.adLog.some(
      entry =>
        entry.videoWeaverUrl === details.url &&
        details.timeStamp - entry.timestamp < 1000 * 30 // 30 seconds
    );
    if (isDuplicate) return text;

    const channelName = findChannelFromVideoWeaverUrl(details.url);
    const isPurpleScreen =
      textLower.includes("https://example.com") &&
      textLower.includes("https://help.twitch.tv/");
    const proxy =
      details.proxyInfo && details.proxyInfo.type !== "direct"
        ? getUrlFromProxyInfo(details.proxyInfo)
        : null;

    store.state.adLog.push({
      adType: isMidroll ? AdType.MIDROLL : AdType.PREROLL,
      isPurpleScreen,
      proxy,
      channel: channelName,
      passportLevel: store.state.passportLevel,
      anonymousMode: store.state.anonymousMode,
      timestamp: details.timeStamp,
      videoWeaverHost: host,
      videoWeaverUrl: details.url,
    });
    console.log(`📝 Ad log updated (${store.state.adLog.length} entries).`);
    console.log(text);

    return text;
  });
}
