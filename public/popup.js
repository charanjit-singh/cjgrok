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

  // Version and Update Logic
  const versionEl = document.getElementById('version');
  const checkUpdateLink = document.getElementById('checkUpdate');
  
  if (versionEl) {
    versionEl.textContent = 'v' + chrome.runtime.getManifest().version;
  }

  if (checkUpdateLink) {
    checkUpdateLink.onclick = (e) => {
        e.preventDefault();
        checkUpdateLink.textContent = 'Checking...';
        
        chrome.runtime.sendMessage({ action: 'checkForUpdate' }, (response) => {
            if (response && response.success) {
                if (response.updateAvailable) {
                    checkUpdateLink.textContent = `Update available: v${response.updateAvailable.version}`;
                    checkUpdateLink.className = 'update-link update-available';
                    checkUpdateLink.href = response.updateAvailable.url;
                    checkUpdateLink.onclick = null; // Let standard link behavior take over
                    checkUpdateLink.target = '_blank';
                } else {
                    checkUpdateLink.textContent = 'Up to date';
                    setTimeout(() => {
                        checkUpdateLink.textContent = 'Check for updates';
                    }, 2000);
                }
            } else {
                checkUpdateLink.textContent = 'Error checking';
                setTimeout(() => {
                    checkUpdateLink.textContent = 'Check for updates';
                }, 2000);
            }
        });
    };
  }
});

