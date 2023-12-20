import { arrayBufferToData } from './array-buffer-to-data.js';

const directNavTest = /^(https:\/\/(?:www|m)\.youtube\.com)\/?(\?.+?)?(#.+?)?$/;
const spaApiTest = /\/youtubei\/v1\/browse/;

const matchGetUrl = url => {
  const match = url.match(directNavTest);
  if (match === null){
    return;
  }

  // Remove pointless funky query string
  const queryString = typeof match[2] === 'string' && match[2] === '?pbjreload=102'
    ? ''
    : match[2] || '';
  return {
    redirectUrl: match[1] + '/feed/library' + queryString + (match[3] || ''),
  };
};

const browseId = 'FEwhat_to_watch';
const isObjectKey = (src, key) => key in src && typeof src[key] === 'object' && src[key] !== null;
const isArrayKey = (src, key) => key in src && Array.isArray(src[key]);
const isOldHomePageNavigation = (requestBody) => 'browseId' in requestBody && requestBody.browseId === browseId;
const isNewHomePageNavigation = (requestBody) => {
  return isObjectKey(requestBody, 'contents')
    && isObjectKey(requestBody.contents, 'twoColumnBrowseResultsRenderer')
    && isArrayKey(requestBody.contents.twoColumnBrowseResultsRenderer, 'tabs')
    && isObjectKey(requestBody.contents.twoColumnBrowseResultsRenderer.tabs, 0)
    && requestBody.contents.twoColumnBrowseResultsRenderer.tabs[0].tabIdentifier === browseId;
};

const matchPostUrl = url => {
  const match = url.match(spaApiTest);
  if (match === null){
    return;
  }

  let requestBody = {};
  try {
    // Try to decode request body
    requestBody = arrayBufferToData.toJSON(details.requestBody.raw[0].bytes) || {};
  } catch (e){
    // Ignore error
  }

  // Cancel any requests that contain the home page browseId
  if (isOldHomePageNavigation(requestBody) || isNewHomePageNavigation(requestBody))
    // By cancelling this request the frontend will update the URL but locks up,
    // a full page reload is needed afterwards using tabs API
    return { cancel: true };
};

// Blocking webRequets to capture navigation attempts
chrome.webRequest.onBeforeRequest.addListener(
  details => {
    let returnValue;
    switch (details.method){
      case 'GET':
        // Direct navigation (e.g. address bar, external link click)
        returnValue = matchGetUrl(details.url);
        break;
      case 'POST':
        // Partial data fetch via API (internal links)
        returnValue = matchPostUrl(details.url);
        break;
    }
    if (returnValue) return returnValue;
  },
  { urls: ['https://www.youtube.com/*', 'https://m.youtube.com/*'] },
  ['blocking', 'requestBody'],
);

// Tab update listener
chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
  if (!changeInfo.url){
    return;
  }

  // If tab URL changed to home page replace it with library
  const returnValue = matchGetUrl(changeInfo.url);
  if (returnValue && returnValue.redirectUrl){
    chrome.tabs.update(tabId, { url: returnValue.redirectUrl });
  }
});
