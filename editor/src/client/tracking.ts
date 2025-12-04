import { init, track } from "@plausible-analytics/tracker";

const getCurrentDomain = () => window.location.hostname;

init({
  endpoint: "/api/event",
  domain: getCurrentDomain(),
  captureOnLocalhost: false, // false is default
  autoCapturePageviews: true, // default true
});

export const trackEvent = track;
