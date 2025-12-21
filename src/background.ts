// Listen for Grok API requests to capture headers
chrome.webRequest.onBeforeSendHeaders.addListener(
  (details) => {
    // We are looking for the list-shared-posts or similar API calls that have the necessary auth/context headers
    if (details.url.includes("grok.com") || details.url.includes("x.ai")) {
      const headers: Record<string, string> = {};
      
      if (details.requestHeaders) {
        details.requestHeaders.forEach((header) => {
          if (header.name && header.value) {
            // Convert to lowercase for consistent access, but keep values as is
            headers[header.name.toLowerCase()] = header.value;
          }
        });
      }

      // Filter for interesting headers if needed, or just store them all.
      // Storing all might be safer to ensure we get everything needed.
      // However, we specifically care about custom headers.
      // Let's store the whole set, but maybe filter out standard ones if size is an issue.
      // For now, store all to be safe.
      
      chrome.storage.local.set({ grokHeaders: headers }, () => {
        // console.log("Grok headers captured:", headers);
      });
    }
  },
  {
    urls: ["https://grok.com/*", "https://x.ai/*"],
    types: ["xmlhttprequest"] // Only capture XHR/Fetch requests
  },
  ["requestHeaders", "extraHeaders"]
);

// Update Check Logic
const GITHUB_USER = 'charanjit-singh'; // TODO: Replace with your GitHub username/org
const GITHUB_REPO = 'cjgrok'; // TODO: Replace with your repository name
const UPDATE_CHECK_ALARM = 'check_update';

function compareVersions(v1: string, v2: string): number {
  const p1 = v1.split('.').map(Number);
  const p2 = v2.split('.').map(Number);
  const len = Math.max(p1.length, p2.length);

  for (let i = 0; i < len; i++) {
    const n1 = p1[i] || 0;
    const n2 = p2[i] || 0;
    if (n1 > n2) return 1;
    if (n1 < n2) return -1;
  }
  return 0;
}

async function checkForUpdate() {

  try {
    const response = await fetch(`https://raw.githubusercontent.com/${GITHUB_USER}/${GITHUB_REPO}/main/package.json`);
    if (!response.ok) return;

    const pkg = await response.json();
    const latestVersion = pkg.version;
    const currentVersion = chrome.runtime.getManifest().version;

    if (compareVersions(latestVersion, currentVersion) > 0) {
      chrome.storage.local.set({ 
        updateAvailable: {
          version: latestVersion,
          url: `https://github.com/${GITHUB_USER}/${GITHUB_REPO}/releases/latest`
        }
      });
    } else {
        chrome.storage.local.remove('updateAvailable');
    }
  } catch (error) {
    console.error('Failed to check for updates:', error);
  }
}

// Check on startup
chrome.runtime.onStartup.addListener(checkForUpdate);
chrome.runtime.onInstalled.addListener(checkForUpdate);

// Check periodically (every 6 hours)
chrome.alarms.create(UPDATE_CHECK_ALARM, { periodInMinutes: 360 });
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === UPDATE_CHECK_ALARM) {
    checkForUpdate();
  }
});
