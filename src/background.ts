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

