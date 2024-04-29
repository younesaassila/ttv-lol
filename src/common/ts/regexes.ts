export const passportHostRegex = /^passport\.twitch\.tv$/i;
export const twitchApiChannelNameRegex = /\/hls\/(.+)\.m3u8/i;
export const twitchChannelNameRegex =
  /^https?:\/\/(?:www|m)\.twitch\.tv\/(?:videos\/|popout\/|moderator\/)?((?!(?:directory|jobs|p|privacy|store|turbo)\b)\w+)/i;
export const twitchGqlHostRegex = /^gql\.twitch\.tv$/i;
export const twitchTvHostRegex = /^(?:www|m)\.twitch\.tv$/i;
export const usherHostRegex = /^usher\.ttvnw\.net$/i;
export const videoWeaverHostRegex =
  /^(?:\w+\.playlist\.(?:live-video|ttvnw)\.net|video-weaver\.\w+\.hls\.ttvnw\.net)$/i;
export const videoWeaverUrlRegex =
  /^https?:\/\/(?:\w+\.playlist\.(?:live-video|ttvnw)\.net|video-weaver\.\w+\.hls\.ttvnw\.net)\/v1\/playlist\/.+\.m3u8$/gim;
