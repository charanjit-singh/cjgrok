// Check if current tab is on grok.com/imagine
chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
  const currentTab = tabs[0];
  const statusEl = document.getElementById('status');
  const buttonEl = document.getElementById('openModal');
  
  if (!statusEl || !buttonEl) return;
  
  const url = (currentTab && currentTab.url) ? currentTab.url : '';
  const isImaginePage = url === 'https://grok.com/imagine' || url.startsWith('https://grok.com/imagine?');
  
  if (isImaginePage) {
    statusEl.textContent = 'Ready to open All Posts';
    statusEl.className = 'status';
    buttonEl.disabled = false;
    
    buttonEl.onclick = () => {
      // Send message to content script to open modal
      if (currentTab && currentTab.id !== undefined) {
        chrome.tabs.sendMessage(currentTab.id, { action: 'openModal' }, (response) => {
          if (chrome.runtime.lastError) {
            statusEl.textContent = 'Error: ' + chrome.runtime.lastError.message;
            statusEl.className = 'status error';
          } else {
            window.close();
          }
        });
      }
    };
  } else {
    statusEl.textContent = 'Please navigate to grok.com/imagine';
    statusEl.className = 'status error';
    buttonEl.disabled = true;
  }
});

