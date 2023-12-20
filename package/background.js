/*!
 * From https://github.com/eelokets/array-buffer-to-data
 */
const arrayBufferToData = {
  toBase64: function (arrayBuffer) {
    let binary = "";
    const bytes = new Uint8Array(arrayBuffer);
    const len = bytes.byteLength;
    for (let i = 0; i < len; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return window.btoa(binary);
  },

  toString: function (arrayBuffer) {
    try {
      const base64 = this.toBase64(arrayBuffer);

      return decodeURIComponent(escape(window.atob(base64)));
    } catch (e) {
      console.warn("Can not be converted to String");
      return false;
    }
  },

  toJSON: function (arrayBuffer) {
    try {
      const string = this.toString(arrayBuffer);
      return JSON.parse(string);
    } catch (e) {
      console.warn("Can not be converted to JSON");
      return false;
    }
  },
};

const directNavTest = /^(https:\/\/(?:www|m)\.youtube\.com)\/?(\?.+?)?(#.+?)?$/;
const spaApiTest = /\/youtubei\/v1\/browse/;

const browseId = "FEwhat_to_watch";
const isObjectKey = (src, key) =>
  key in src && typeof src[key] === "object" && src[key] !== null;
const isArrayKey = (src, key) => key in src && Array.isArray(src[key]);
const isOldHomePageNavigation = (requestBody) =>
  "browseId" in requestBody && requestBody.browseId === browseId;
const isNewHomePageNavigation = (requestBody) => {
  return (
    isObjectKey(requestBody, "contents") &&
    isObjectKey(requestBody.contents, "twoColumnBrowseResultsRenderer") &&
    isArrayKey(requestBody.contents.twoColumnBrowseResultsRenderer, "tabs") &&
    isObjectKey(requestBody.contents.twoColumnBrowseResultsRenderer.tabs, 0) &&
    requestBody.contents.twoColumnBrowseResultsRenderer.tabs[0]
      .tabIdentifier === browseId
  );
};

const matchGetUrl = (details) => {
  const match = details.url.match(directNavTest);
  if (match === null) {
    return;
  }

  // Remove pointless funky query string
  const queryString =
    typeof match[2] === "string" && match[2] === "?pbjreload=102"
      ? ""
      : match[2] || "";
  return {
    redirectUrl: match[1] + "/feed/library" + queryString + (match[3] || ""),
  };
};

const matchPostUrl = (details) => {
  const match = details.url.match(spaApiTest);
  if (match === null) {
    return;
  }

  let requestBody = {};
  try {
    // Try to decode request body
    requestBody =
      arrayBufferToData.toJSON(details.requestBody.raw[0].bytes) || {};
  } catch (e) {
    // Ignore error
  }

  // Cancel any requests that contain the home page browseId
  if (
    isOldHomePageNavigation(requestBody) ||
    isNewHomePageNavigation(requestBody)
  )
    // By cancelling this request the frontend will update the URL but locks up,
    // a full page reload is needed afterwards using tabs API
    return { cancel: true };
};

// Tab update listener
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (!changeInfo.url) {
    return;
  }

  // If tab URL changed to home page replace it with library
  const returnValue = matchGetUrl({ url: changeInfo.url });
  if (returnValue && returnValue.redirectUrl) {
    chrome.tabs.update(tabId, { url: returnValue.redirectUrl });
  }
});
