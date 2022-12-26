import { WebRequest } from "webextension-polyfill";
import { TTV_LOL_API_URL_REGEX } from "../../common/ts/regexes";
import store from "../../store";

export default function onHeadersReceived(
  details: WebRequest.OnHeadersReceivedDetailsType
): WebRequest.BlockingResponseOrPromise {
  const match = TTV_LOL_API_URL_REGEX.exec(details.url);
  if (!match) return {};
  const [, streamId] = match;
  if (!streamId) return {};

  const isServerError = 500 <= details.statusCode && details.statusCode < 600;
  if (isServerError) {
    const status = getStreamStatus(streamId);
    store.state.streamStatuses[streamId] = {
      ...status,
      errors: [
        ...status.errors,
        {
          timestamp: Date.now(),
          status: details.statusCode,
        },
      ],
      proxyCountry: undefined,
    };
    console.log(`${streamId}: ${status.errors.length + 1} errors`);
    console.log(`${streamId}: Redirect canceled (Error ${details.statusCode})`);

    return {
      cancel: true,
    };
  } else {
    const status = getStreamStatus(streamId);
    store.state.streamStatuses[streamId] = {
      ...status,
      errors: [],
    };

    return {};
  }
}

function getStreamStatus(streamId: string) {
  return (
    store.state.streamStatuses[streamId] || {
      redirected: true,
      reason: "",
      errors: [],
    }
  );
}
