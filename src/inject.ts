import { logo } from "./logo";

interface GrokPost {
  postId: string;
  id?: string;
  prompt?: string;
  thumbnailImageUrl?: string;
  createdAt?: string;
  [key: string]: any;
}

interface GrokHeaders {
  [key: string]: string;
}

class CJGrok {
  private posts: GrokPost[] = [];
  private modal: HTMLElement | null = null;
  private button: HTMLElement | null = null;
  private isDeleting: boolean = false;
  private stopDeleting: boolean = false;
  private headers: GrokHeaders | null = null;
  private updateInfo: { version: string, url: string } | null = null;
  private nextCursor: string | null = null;

  private menuOpen: boolean = false;
  private menu: HTMLElement | null = null;
  private progressModal: HTMLElement | null = null;
  private progressContent: HTMLElement | null = null;

  // Concurrency settings for parallel deletion
  // Conservative defaults to avoid rate limiting - adjust if needed
  private readonly CONCURRENCY_LIMIT = 5; // Number of simultaneous delete requests
  private readonly DELETE_BATCH_DELAY = 500; // Delay between batches (ms)
  private readonly PER_REQUEST_DELAY = 150; // Small delay per request within batch (ms)
  private rateLimitHits = 0; // Track rate limit encounters

  constructor() {
    this.init();
  }

  /**
   * Add randomized jitter to delays to appear more natural
   */
  private jitter(baseMs: number, variance: number = 0.3): number {
    const min = baseMs * (1 - variance);
    const max = baseMs * (1 + variance);
    return Math.floor(Math.random() * (max - min) + min);
  }

  /**
   * Execute promises with concurrency limit and per-request delays
   * @param items - Array of items to process
   * @param fn - Async function to execute for each item
   * @param concurrency - Max concurrent operations
   */
  private async executeWithConcurrency<T, R>(
    items: T[],
    fn: (item: T, index: number) => Promise<R>,
    concurrency: number
  ): Promise<R[]> {
    const results: R[] = [];
    let currentIndex = 0;

    const executeNext = async (): Promise<void> => {
      while (currentIndex < items.length && !this.stopDeleting) {
        const index = currentIndex++;
        const item = items[index];
        try {
          // Small jittered delay before each request to spread load
          await new Promise(r => setTimeout(r, this.jitter(this.PER_REQUEST_DELAY)));
          const result = await fn(item, index);
          results[index] = result;
        } catch (e) {
          console.error(`Error processing item ${index}:`, e);
          results[index] = null as any;
        }
      }
    };

    // Start concurrent workers
    const workers = Array(Math.min(concurrency, items.length))
      .fill(null)
      .map(() => executeNext());

    await Promise.all(workers);
    return results;
  }

  private init() {
    // Check for updates
    chrome.storage.local.get('updateAvailable', (data) => {
      if (data.updateAvailable) {
        this.updateInfo = data.updateAvailable;
        this.checkAndCreateUI();
      }
    });

    chrome.storage.onChanged.addListener((changes) => {
      if (changes.updateAvailable) {
        this.updateInfo = changes.updateAvailable.newValue;
        this.checkAndCreateUI();
      }
    });

    // Listen for messages from popup
    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
      if (request.action === 'openModal') {
        this.toggleModal();
        sendResponse({ success: true });
      }
      return true;
    });

    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => this.checkAndCreateUI());
    } else {
      this.checkAndCreateUI();
    }

    // Watch for URL changes (SPA navigation)
    let lastUrl = location.href;
    new MutationObserver(() => {
      const url = location.href;
      if (url !== lastUrl) {
        lastUrl = url;
        this.checkAndCreateUI();
      }
    }).observe(document, { subtree: true, childList: true });
  }

  private isImaginePage(): boolean {
    const path = window.location.pathname;
    return path === '/imagine' || path.startsWith('/imagine/');
  }

  private checkAndCreateUI() {
    if (this.isImaginePage()) {
      if (!this.button) {
        this.createStartMenu();
      }
    } else {
      if (this.button) {
        this.button.remove();
        this.button = null;
      }
      if (this.menu) {
        this.menu.remove();
        this.menu = null;
      }
    }
  }

  private createProgressModal() {
    this.progressModal = document.createElement('div');
    this.progressModal.style.cssText = `
      display: none;
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      background-color: rgba(0, 0, 0, 0.6); 
      z-index: 100001; /* Higher than main modal */
      justify-content: center;
      align-items: center;
      backdrop-filter: blur(5px);
      -webkit-backdrop-filter: blur(5px);
    `;

    const content = document.createElement('div');
    content.style.cssText = `
      background: rgba(20, 20, 20, 0.9);
      backdrop-filter: blur(20px);
      -webkit-backdrop-filter: blur(20px);
      color: #fff;
      border: 1px solid rgba(255, 255, 255, 0.1);
      border-radius: 16px;
      padding: 24px;
      width: 400px;
      max-width: 90%;
      display: flex;
      flex-direction: column;
      gap: 16px;
      box-shadow: 0 20px 60px rgba(0, 0, 0, 0.8);
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
    `;

    const title = document.createElement('h3');
    title.textContent = 'Upscaling Favorites';
    title.style.margin = '0';
    title.style.fontSize = '18px';
    title.style.fontWeight = '700';
    content.appendChild(title);

    this.progressContent = document.createElement('div');
    this.progressContent.style.cssText = `
      font-size: 14px;
      color: #8899a6;
      line-height: 1.5;
      max-height: 200px;
      overflow-y: auto;
    `;
    this.progressContent.textContent = 'Ready to start...';
    content.appendChild(this.progressContent);

    // Stop Button
    const stopBtn = document.createElement('button');
    stopBtn.textContent = 'Stop Process';
    stopBtn.style.cssText = `
      background: rgba(224, 36, 94, 0.2);
      color: #e0245e;
      border: 1px solid rgba(224, 36, 94, 0.5);
      padding: 8px 16px;
      border-radius: 9999px;
      cursor: pointer;
      font-weight: 600;
      font-size: 13px;
      align-self: flex-end;
      transition: all 0.2s;
    `;
    stopBtn.onmouseenter = () => stopBtn.style.background = 'rgba(224, 36, 94, 0.3)';
    stopBtn.onmouseleave = () => stopBtn.style.background = 'rgba(224, 36, 94, 0.2)';
    stopBtn.onclick = () => {
        this.stopDeleting = true;
        this.updateProgress('Stopping...');
    };
    content.appendChild(stopBtn);
    
    // Close Button
    const closeBtn = document.createElement('button');
    closeBtn.textContent = 'Close';
    closeBtn.style.cssText = `
      background: rgba(255, 255, 255, 0.1);
      color: #fff;
      border: 1px solid rgba(255, 255, 255, 0.1);
      padding: 8px 16px;
      border-radius: 9999px;
      cursor: pointer;
      font-weight: 600;
      font-size: 13px;
      align-self: flex-end;
      transition: all 0.2s;
      margin-top: 8px;
    `;
    closeBtn.onclick = () => this.hideProgressModal();
    content.appendChild(closeBtn);

    this.progressModal.appendChild(content);
    document.body.appendChild(this.progressModal);
  }

  private updateProgress(msg: string) {
    if (this.progressContent) {
        // Append new line instead of replacing
        const line = document.createElement('div');
        line.textContent = `[${new Date().toLocaleTimeString()}] ${msg}`;
        line.style.marginBottom = '4px';
        this.progressContent.appendChild(line);
        this.progressContent.scrollTop = this.progressContent.scrollHeight;
    }
  }

  private showProgressModal() {
    if (!this.progressModal) this.createProgressModal();
    if (this.progressModal) {
        this.progressModal.style.display = 'flex';
        if (this.progressContent) this.progressContent.innerHTML = ''; // Clear previous logs
    }
  }

  private hideProgressModal() {
    if (this.progressModal) this.progressModal.style.display = 'none';
  }

  private createStartMenu() {
    // Container for the menu system
    const container = document.createElement('div');
    container.style.cssText = `
      position: fixed;
      bottom: 20px;
      right: 20px;
      z-index: 99999;
      display: flex;
      flex-direction: column;
      align-items: flex-end;
      gap: 12px;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
    `;

    // Dropdown Menu
    this.menu = document.createElement('div');
    this.menu.style.cssText = `
      display: none;
      background: rgba(0, 0, 0, 0.7);
      backdrop-filter: blur(20px);
      -webkit-backdrop-filter: blur(20px);
      border: 1px solid rgba(255, 255, 255, 0.1);
      border-radius: 16px;
      padding: 8px;
      min-width: 220px;
      box-shadow: 0 10px 40px rgba(0, 0, 0, 0.5);
      flex-direction: column;
      gap: 4px;
      margin-bottom: 8px;
      transform-origin: bottom right;
      transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
      opacity: 0;
      transform: scale(0.95) translateY(10px);
    `;

    // Menu Header
    const menuHeader = document.createElement('div');
    menuHeader.textContent = 'CJGrok Menu';
    menuHeader.style.cssText = `
      padding: 8px 12px;
      font-size: 12px;
      font-weight: 600;
      color: #8899a6;
      border-bottom: 1px solid rgba(255, 255, 255, 0.1);
      margin-bottom: 4px;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    `;
    this.menu.appendChild(menuHeader);

    // Menu Items
    const createMenuItem = (text: string, icon: string, onClick: () => void, color: string = '#fff') => {
      const item = document.createElement('button');
      item.innerHTML = `
        <span style="display: flex; align-items: center; justify-content: center; width: 24px; height: 24px; background: rgba(255,255,255,0.1); border-radius: 6px; margin-right: 12px;">
            ${icon}
        </span>
        ${text}
      `;
      item.style.cssText = `
        display: flex;
        align-items: center;
        width: 100%;
        padding: 10px 12px;
        background: transparent;
        border: none;
        color: ${color};
        font-size: 14px;
        font-weight: 500;
        cursor: pointer;
        text-align: left;
        border-radius: 8px;
        transition: all 0.2s;
      `;
      item.onmouseenter = () => item.style.background = 'rgba(255, 255, 255, 0.1)';
      item.onmouseleave = () => item.style.background = 'transparent';
      item.onclick = () => {
        this.toggleMenu();
        onClick();
      };
      return item;
    };

    const manageIcon = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="7" height="7"></rect><rect x="14" y="3" width="7" height="7"></rect><rect x="14" y="14" width="7" height="7"></rect><rect x="3" y="14" width="7" height="7"></rect></svg>`;
    const upscaleIcon = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="17 8 12 3 7 8"></polyline><line x1="12" y1="3" x2="12" y2="15"></line></svg>`;

    const manageBtn = createMenuItem('Manage All Posts', manageIcon, () => this.toggleModal());
    const upscaleBtn = createMenuItem('Upscale Favorites', upscaleIcon, () => this.startUpscaleAndDownloadFavorites(), '#17bf63');

    const filesIcon = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line><polyline points="10 9 9 9 8 9"></polyline></svg>`;
    const filesBtn = createMenuItem('View Uploaded Files', filesIcon, () => {
      window.location.href = 'https://grok.com/files';
    });

    const shareIcon = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"></path><polyline points="16 6 12 2 8 6"></polyline><line x1="12" y1="2" x2="12" y2="15"></line></svg>`;
    const shareBtn = createMenuItem('View Shared Links', shareIcon, () => {
      window.location.href = 'https://grok.com/share-links';
    });

    const reportIcon = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>`;
    const reportBtn = createMenuItem('Report an Issue', reportIcon, () => {
      window.open('https://github.com/charanjit-singh/cjgrok/issues', '_blank');
    });

    // Menu Footer (Updates)
    const menuFooter = document.createElement('div');
    menuFooter.style.cssText = `
        margin-top: 8px;
        padding-top: 8px;
        border-top: 1px solid rgba(255, 255, 255, 0.1);
        font-size: 11px;
        color: #8899a6;
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 4px;
    `;
    
    // Version info
    const versionInfo = document.createElement('div');
    // Using runtime.getManifest() might be blocked in content script depending on context, 
    // but usually allowed. If not, we can't show it easily without passing from background.
    // For now, let's try a safe approach or just hardcode/skip if fails.
    try {
        versionInfo.textContent = `v${chrome.runtime.getManifest().version}`;
    } catch (e) {
        versionInfo.textContent = 'CJGrok';
    }
    menuFooter.appendChild(versionInfo);

    // Update Check / Action
    const updateContainer = document.createElement('div');
    updateContainer.style.cssText = `
        display: flex;
        align-items: center;
        gap: 8px;
    `;

    const checkUpdateBtn = document.createElement('a');
    checkUpdateBtn.textContent = 'Check for updates';
    checkUpdateBtn.href = '#';
    checkUpdateBtn.style.cssText = `
        color: #1DA1F2;
        text-decoration: none;
        cursor: pointer;
    `;
    checkUpdateBtn.onclick = (e) => {
        e.preventDefault();
        checkUpdateBtn.textContent = 'Checking...';
        chrome.runtime.sendMessage({ action: 'checkForUpdate' }, (response) => {
             if (response && response.success) {
                 if (response.updateAvailable) {
                     checkUpdateBtn.textContent = 'Update available!';
                     checkUpdateBtn.style.color = '#e0245e';
                     checkUpdateBtn.style.fontWeight = 'bold';
                     
                     const dlBtn = document.createElement('a');
                     dlBtn.href = response.updateAvailable.url;
                     dlBtn.target = '_blank';
                     dlBtn.textContent = 'Download';
                     dlBtn.style.cssText = `
                        background: #e0245e;
                        color: white;
                        padding: 2px 8px;
                        border-radius: 999px;
                        text-decoration: none;
                        font-weight: bold;
                        font-size: 10px;
                        margin-left: 4px;
                     `;
                     updateContainer.appendChild(dlBtn);
                 } else {
                     checkUpdateBtn.textContent = 'Up to date';
                     setTimeout(() => checkUpdateBtn.textContent = 'Check for updates', 2000);
                 }
             } else {
                 checkUpdateBtn.textContent = 'Error checking';
                 setTimeout(() => checkUpdateBtn.textContent = 'Check for updates', 2000);
             }
        });
    };
    checkUpdateBtn.onmouseenter = () => checkUpdateBtn.style.textDecoration = 'underline';
    checkUpdateBtn.onmouseleave = () => checkUpdateBtn.style.textDecoration = 'none';
    
    updateContainer.appendChild(checkUpdateBtn);
    menuFooter.appendChild(updateContainer);

    this.menu.appendChild(manageBtn);
    this.menu.appendChild(upscaleBtn);
    this.menu.appendChild(filesBtn);
    this.menu.appendChild(shareBtn);
    this.menu.appendChild(reportBtn);
    this.menu.appendChild(menuFooter);
    container.appendChild(this.menu);

    // Main FAB (Start Button)
    this.button = document.createElement('button');
    
    this.button.style.cssText = `
      width: 56px;
      height: 56px;
      border-radius: 50%;
      background: rgba(0, 0, 0, 0.6);
      backdrop-filter: blur(20px);
      -webkit-backdrop-filter: blur(20px);
      border: 1px solid rgba(255, 255, 255, 0.2);
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: all 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275);
      box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
      padding: 0;
      overflow: hidden;
    `;

    // CJGrok Logo (PNG)
    const img = document.createElement('img');
    // Using extension icon. To use a base64 string, replace the src below:
    // img.src = "data:image/png;base64,..."; 
    img.src = logo;
    img.style.cssText = `
      width: 100%;
      height: 100%;
      object-fit: scale-down;
      padding: 2px;
      transition: transform 0.3s;
    `;
    this.button.appendChild(img);
    
    // Update badge logic
    if (this.updateInfo) {
      const badge = document.createElement('div');
      badge.style.cssText = `
        position: absolute;
        top: 0;
        right: 0;
        width: 14px;
        height: 14px;
        background-color: #e0245e;
        border-radius: 50%;
        border: 2px solid #000;
        z-index: 10;
      `;
      this.button.appendChild(badge);
    }

    this.button.onclick = (e) => {
        e.stopPropagation();
        this.toggleMenu();
    };

    // Hover effects
    this.button.onmouseenter = () => {
        this.button!.style.transform = 'scale(1.1)';
        this.button!.style.borderColor = 'rgba(255, 255, 255, 0.4)';
    };
    this.button.onmouseleave = () => {
        this.button!.style.transform = 'scale(1)';
        this.button!.style.borderColor = 'rgba(255, 255, 255, 0.2)';
    };

    // Close menu when clicking outside
    document.addEventListener('click', (e) => {
        if (this.menuOpen && !this.menu?.contains(e.target as Node) && !this.button?.contains(e.target as Node)) {
            this.toggleMenu();
        }
    });

    container.appendChild(this.button);
    document.body.appendChild(container);
    this.createModal();
  }

  private toggleMenu() {
    if (!this.menu) return;
    this.menuOpen = !this.menuOpen;
    
    if (this.menuOpen) {
        this.menu.style.display = 'flex';
        // Trigger reflow
        this.menu.offsetHeight;
        this.menu.style.opacity = '1';
        this.menu.style.transform = 'scale(1) translateY(0)';
    } else {
        this.menu.style.opacity = '0';
        this.menu.style.transform = 'scale(0.95) translateY(10px)';
        setTimeout(() => {
            if (this.menu && !this.menuOpen) this.menu.style.display = 'none';
        }, 200);
    }
  }

  private createUI() {
     // Deprecated by createStartMenu, keeping stub if needed or removing
  }

  private createModal() {
    this.modal = document.createElement('div');
    this.modal.id = 'cjgrok-modal';
    this.modal.style.cssText = `
      display: none;
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      background-color: rgba(0, 0, 0, 0.6); 
      z-index: 100000;
      justify-content: center;
      align-items: center;
      backdrop-filter: blur(15px);
      -webkit-backdrop-filter: blur(15px);
    `;

    this.modal.addEventListener('click', (e) => {
      if (e.target === this.modal) this.closeModal();
    });

    const modalContent = document.createElement('div');
    modalContent.style.cssText = `
      background: rgba(20, 20, 20, 0.7);
      backdrop-filter: blur(40px);
      -webkit-backdrop-filter: blur(40px);
      color: #fff;
      border: 1px solid rgba(255, 255, 255, 0.1);
      border-radius: 24px;
      padding: 32px;
      width: 1100px;
      max-width: 95%;
      height: 85vh;
      display: flex;
      flex-direction: column;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      box-shadow: 0 40px 80px rgba(0, 0, 0, 0.6);
    `;

    if (this.updateInfo) {
      const updateBanner = document.createElement('div');
      updateBanner.style.cssText = `
        background: rgba(29, 161, 242, 0.2);
        border: 1px solid rgba(29, 161, 242, 0.5);
        border-radius: 8px;
        padding: 12px;
        margin-bottom: 20px;
        display: flex;
        justify-content: space-between;
        align-items: center;
      `;
      
      const updateText = document.createElement('span');
      updateText.textContent = `Update available: v${this.updateInfo.version}`;
      updateText.style.fontWeight = '600';
      
      const updateLink = document.createElement('a');
      updateLink.href = this.updateInfo.url;
      updateLink.target = '_blank';
      updateLink.textContent = 'Get Update';
      updateLink.style.cssText = `
        background: #1DA1F2;
        color: white;
        text-decoration: none;
        padding: 6px 12px;
        border-radius: 16px;
        font-size: 13px;
        font-weight: 700;
        transition: opacity 0.2s;
      `;
      updateLink.onmouseover = () => updateLink.style.opacity = '0.9';
      updateLink.onmouseout = () => updateLink.style.opacity = '1';

      updateBanner.appendChild(updateText);
      updateBanner.appendChild(updateLink);
      modalContent.appendChild(updateBanner);
    }

    // Header
    const header = document.createElement('div');
    header.style.cssText = `
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 20px;
      padding-bottom: 16px;
      border-bottom: 1px solid rgba(255, 255, 255, 0.1);
    `;

    const title = document.createElement('h2');
    title.textContent = 'CJGrok - All Posts';
    title.style.margin = '0';
    title.style.fontSize = '24px';
    title.style.fontWeight = '800';

    const closeBtn = document.createElement('button');
    closeBtn.innerHTML = '&times;';
    closeBtn.style.cssText = `
      background: none;
      border: none;
      color: #888;
      font-size: 32px;
      cursor: pointer;
      padding: 0;
      line-height: 1;
      width: 40px;
      height: 40px;
      display: flex;
      align-items: center;
      justify-content: center;
      border-radius: 50%;
      transition: background-color 0.2s;
    `;
    closeBtn.onmouseover = () => closeBtn.style.backgroundColor = 'rgba(255,255,255,0.1)';
    closeBtn.onmouseout = () => closeBtn.style.backgroundColor = 'transparent';
    closeBtn.addEventListener('click', () => this.closeModal());

    header.appendChild(title);
    header.appendChild(closeBtn);

    // Controls
    const controls = document.createElement('div');
    controls.style.cssText = `
      display: flex;
      gap: 12px;
      margin-bottom: 20px;
      align-items: center;
    `;

    const fetchBtn = this.createButton('Fetch Posts', '#1DA1F2');
    fetchBtn.onclick = () => this.fetchPosts();

    const deleteAllBtn = this.createButton('Delete All Sequentially', '#e0245e');
    deleteAllBtn.onclick = () => this.startDeleteAll();

    const stopBtn = this.createButton('Stop Deleting', '#8899a6');
    stopBtn.onclick = () => { this.stopDeleting = true; };
    stopBtn.style.display = 'none';
    this.stopBtn = stopBtn; // Save ref

    controls.appendChild(fetchBtn);
    controls.appendChild(deleteAllBtn);
    controls.appendChild(stopBtn);

    // Status / Loading
    const statusDiv = document.createElement('div');
    statusDiv.id = 'cjgrok-status';
    statusDiv.style.cssText = `
      margin-bottom: 16px;
      font-size: 14px;
      color: #8899a6;
      min-height: 20px;
      font-weight: 500;
    `;

    // List Container (Grid)
    const listContainer = document.createElement('div');
    listContainer.id = 'cjgrok-list';
    listContainer.style.cssText = `
      flex: 1;
      overflow-y: auto;
      padding: 4px;
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
      gap: 16px;
    `;
    
    // Custom scrollbar styling
    const style = document.createElement('style');
    style.textContent = `
      #cjgrok-list::-webkit-scrollbar {
        width: 8px;
      }
      #cjgrok-list::-webkit-scrollbar-track {
        background: rgba(255, 255, 255, 0.05);
        border-radius: 4px;
      }
      #cjgrok-list::-webkit-scrollbar-thumb {
        background: rgba(255, 255, 255, 0.2);
        border-radius: 4px;
      }
      #cjgrok-list::-webkit-scrollbar-thumb:hover {
        background: rgba(255, 255, 255, 0.3);
      }
    `;
    document.head.appendChild(style);

    modalContent.appendChild(header);
    modalContent.appendChild(controls);
    modalContent.appendChild(statusDiv);
    modalContent.appendChild(listContainer);
    this.modal.appendChild(modalContent);
    document.body.appendChild(this.modal);
  }

  private createButton(text: string, bgColor: string) {
    const btn = document.createElement('button');
    btn.textContent = text;
    btn.style.cssText = `
      background: ${bgColor}cc;
      backdrop-filter: blur(10px);
      color: white;
      border: 1px solid rgba(255, 255, 255, 0.1);
      padding: 10px 20px;
      border-radius: 9999px;
      cursor: pointer;
      font-weight: 700;
      font-size: 14px;
      transition: all 0.2s;
    `;
    btn.onmouseover = () => {
      btn.style.opacity = '1';
      btn.style.transform = 'translateY(-1px)';
      btn.style.boxShadow = '0 4px 12px rgba(0, 0, 0, 0.3)';
    };
    btn.onmouseout = () => {
      btn.style.opacity = '0.9';
      btn.style.transform = 'translateY(0)';
      btn.style.boxShadow = 'none';
    };
    btn.onmousedown = () => btn.style.transform = 'translateY(0) scale(0.98)';
    btn.onmouseup = () => btn.style.transform = 'translateY(-1px)';
    return btn;
  }

  private toggleModal() {
    if (!this.modal) return;
    const isHidden = this.modal.style.display === 'none';
    this.modal.style.display = isHidden ? 'flex' : 'none';
    if (isHidden) {
      this.fetchPosts();
    }
  }

  private closeModal() {
    if (this.modal) this.modal.style.display = 'none';
  }

  private stopBtn: HTMLButtonElement | undefined;

  private updateStatus(msg: string, color: string = '#8899a6') {
    const el = document.getElementById('cjgrok-status');
    if (el) {
      el.textContent = msg;
      el.style.color = color;
    }
  }

  private formatCreatedAt(timestamp: string | undefined): string {
    if (!timestamp) return 'Unknown date';
    
    try {
      // Parse Unix timestamp (milliseconds)
      const date = new Date(parseInt(timestamp, 10));
      return date.toLocaleString(undefined, {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        hour12: true
      });
    } catch (e) {
      return 'Invalid date';
    }
  }

  private async getHeaders(): Promise<GrokHeaders | null> {
    if (this.headers) return this.headers;
    
    return new Promise((resolve) => {
      chrome.storage.local.get("grokHeaders", (result) => {
        if (result.grokHeaders) {
          this.headers = result.grokHeaders;
          resolve(result.grokHeaders);
        } else {
          resolve(null);
        }
      });
    });
  }

  private async fetchPosts(cursor?: string) {
    this.updateStatus('Getting authentication...', '#8899a6');
    const headers = await this.getHeaders();
    
    if (!headers) {
      this.updateStatus('No headers found. Please browse Grok to capture session first.', '#e0245e');
      return;
    }

    this.updateStatus('Fetching posts...', '#1DA1F2');
    const listContainer = document.getElementById('cjgrok-list');
    if (listContainer) listContainer.innerHTML = '';

    try {
      const body: any = { limit: 400 };
      if (cursor) body.cursor = cursor;

      const response = await fetch("https://grok.com/rest/media/post/list-shared-posts", {
        method: "POST",
        headers: {
            "content-type": "application/json",
            ...headers
        },
        body: JSON.stringify(body),
        credentials: "include"
      });

      if (!response.ok) throw new Error(`Failed to fetch: ${response.status}`);

      const data = await response.json();
      this.posts = Array.isArray(data) ? data : (data.items || data.posts || []);
      this.nextCursor = data.nextCursor || null;
      
      this.updateStatus(`Found ${this.posts.length} posts.`);
      this.renderList();
    } catch (e) {
      console.error(e);
      this.updateStatus('Error fetching posts. Session might be expired.', '#e0245e');
      this.headers = null;
    }
  }

  private renderList() {
    const listContainer = document.getElementById('cjgrok-list');
    if (!listContainer) return;
    listContainer.innerHTML = '';

    this.posts.forEach(post => {
      const postId = post.postId || post.id;
      if (!postId) return;

      const link = document.createElement('a');
      link.href = `https://grok.com/imagine/post/${postId}`;
      link.target = '_blank';
      link.style.cssText = `
        display: block;
        position: relative;
        height: 280px;
        border-radius: 12px;
        overflow: hidden;
        border: 1px solid rgba(255, 255, 255, 0.1);
        text-decoration: none;
        transition: all 0.2s;
        background-color: rgba(17, 17, 17, 0.8);
        backdrop-filter: blur(10px);
      `;
      link.onmouseenter = () => {
        link.style.transform = 'translateY(-4px) scale(1.02)';
        link.style.borderColor = 'rgba(29, 161, 242, 0.6)';
        link.style.boxShadow = '0 8px 24px rgba(0, 0, 0, 0.4)';
      };
      link.onmouseleave = () => {
        link.style.transform = 'translateY(0) scale(1)';
        link.style.borderColor = 'rgba(255, 255, 255, 0.1)';
        link.style.boxShadow = 'none';
      };

      // Image
      if (post.thumbnailImageUrl) {
        const img = document.createElement('img');
        img.src = post.thumbnailImageUrl;
        img.style.cssText = `
          width: 100%;
          height: 100%;
          object-fit: cover;
          display: block;
        `;
        link.appendChild(img);
      } else {
        const noImg = document.createElement('div');
        noImg.textContent = 'No Image';
        noImg.style.cssText = `
          width: 100%;
          height: 100%;
          display: flex;
          align-items: center;
          justify-content: center;
          color: #555;
          font-size: 12px;
        `;
        link.appendChild(noImg);
      }

      // Overlay (Prompt + Date)
      const overlay = document.createElement('div');
      overlay.style.cssText = `
        position: absolute;
        bottom: 0;
        left: 0;
        right: 0;
        background: linear-gradient(to top, rgba(0,0,0,0.95), rgba(0,0,0,0));
        backdrop-filter: blur(10px);
        padding: 20px 12px 12px;
        pointer-events: none;
      `;

      const dateText = document.createElement('div');
      dateText.textContent = this.formatCreatedAt(post.createdAt);
      dateText.style.cssText = `
        color: rgba(255, 255, 255, 0.7);
        font-size: 11px;
        margin-bottom: 6px;
        text-shadow: 0 1px 2px rgba(0,0,0,0.8);
        font-weight: 500;
      `;
      overlay.appendChild(dateText);

      const promptText = document.createElement('div');
      promptText.textContent = post.prompt || 'No Prompt';
      promptText.style.cssText = `
        color: white;
        font-size: 13px;
        line-height: 1.4;
        display: -webkit-box;
        -webkit-line-clamp: 3;
        -webkit-box-orient: vertical;
        overflow: hidden;
        text-shadow: 0 1px 2px rgba(0,0,0,0.8);
      `;
      overlay.appendChild(promptText);
      link.appendChild(overlay);

      // Like Button
      const likeBtn = document.createElement('button');
      likeBtn.innerHTML = `
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"></path>
        </svg>
      `;
      likeBtn.title = 'Like Post';
      likeBtn.style.cssText = `
        position: absolute;
        top: 8px;
        right: 48px;
        background: rgba(0, 0, 0, 0.7);
        backdrop-filter: blur(10px);
        color: #fff;
        border: 1px solid rgba(255, 255, 255, 0.2);
        border-radius: 8px;
        width: 32px;
        height: 32px;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        transition: all 0.2s;
        z-index: 10;
      `;
      
      likeBtn.onmouseenter = () => {
        likeBtn.style.background = 'rgba(224, 36, 94, 0.2)';
        likeBtn.style.color = '#e0245e';
        likeBtn.style.borderColor = '#e0245e';
        likeBtn.style.transform = 'scale(1.1)';
      };
      likeBtn.onmouseleave = () => {
        if (likeBtn.dataset.liked !== 'true') {
            likeBtn.style.background = 'rgba(0, 0, 0, 0.7)';
            likeBtn.style.color = '#fff';
            likeBtn.style.borderColor = 'rgba(255, 255, 255, 0.2)';
            likeBtn.style.transform = 'scale(1)';
        }
      };

      likeBtn.onclick = async (e) => {
        e.preventDefault();
        e.stopPropagation();
        await this.likePost(postId, likeBtn);
      };

      link.appendChild(likeBtn);

      // Delete Button
      const delBtn = document.createElement('button');
      delBtn.innerHTML = `
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <polyline points="3 6 5 6 21 6"></polyline>
          <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
        </svg>
      `;
      delBtn.title = 'Delete Post';
      delBtn.style.cssText = `
        position: absolute;
        top: 8px;
        right: 8px;
        background: rgba(0, 0, 0, 0.7);
        backdrop-filter: blur(10px);
        color: #e0245e;
        border: 1px solid rgba(255, 255, 255, 0.2);
        border-radius: 8px;
        width: 32px;
        height: 32px;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        transition: all 0.2s;
        z-index: 10;
      `;
      
      delBtn.onmouseenter = () => {
        delBtn.style.background = 'rgba(224, 36, 94, 0.9)';
        delBtn.style.color = 'white';
        delBtn.style.borderColor = '#e0245e';
        delBtn.style.transform = 'scale(1.1)';
      };
      delBtn.onmouseleave = () => {
        delBtn.style.background = 'rgba(0, 0, 0, 0.7)';
        delBtn.style.color = '#e0245e';
        delBtn.style.borderColor = 'rgba(255, 255, 255, 0.2)';
        delBtn.style.transform = 'scale(1)';
      };

      delBtn.onclick = async (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (confirm(`Are you sure you want to delete this post?\n\nPrompt: ${post.prompt || 'N/A'}`)) {
          await this.deletePost(postId, link, false);
        }
      };

      link.appendChild(delBtn);
      listContainer.appendChild(link);
    });

    if (this.nextCursor) {
        const loadMoreBtn = document.createElement('button');
        loadMoreBtn.innerHTML = `
            <span style="font-size: 24px; display: block; margin-bottom: 8px;">&raquo;</span>
            <span>Next Page</span>
        `;
        loadMoreBtn.style.cssText = `
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            height: 280px;
            border-radius: 12px;
            overflow: hidden;
            border: 2px dashed rgba(255, 255, 255, 0.2);
            text-decoration: none;
            transition: all 0.2s;
            background-color: rgba(255, 255, 255, 0.05);
            backdrop-filter: blur(10px);
            color: #fff;
            cursor: pointer;
            font-weight: 600;
        `;
        loadMoreBtn.onmouseenter = () => {
            loadMoreBtn.style.transform = 'translateY(-4px) scale(1.02)';
            loadMoreBtn.style.borderColor = 'rgba(29, 161, 242, 0.6)';
            loadMoreBtn.style.background = 'rgba(29, 161, 242, 0.1)';
        };
        loadMoreBtn.onmouseleave = () => {
            loadMoreBtn.style.transform = 'translateY(0) scale(1)';
            loadMoreBtn.style.borderColor = 'rgba(255, 255, 255, 0.2)';
            loadMoreBtn.style.background = 'rgba(255, 255, 255, 0.05)';
        };
        loadMoreBtn.onclick = () => {
            this.fetchPosts(this.nextCursor!);
        };
        listContainer.appendChild(loadMoreBtn);
    }
  }

  private async deletePost(id: string, element?: HTMLElement, skipConfirmation: boolean = false): Promise<boolean | 'rate_limited'> {
    try {
        const headers = await this.getHeaders();
        if (!headers) {
             this.updateStatus('Lost session. Please refresh.', '#e0245e');
             return false;
        }

      if (element) {
        element.style.opacity = '0.5';
        element.style.pointerEvents = 'none';
      }

      const response = await fetch("https://grok.com/rest/media/post/delete", {
        method: "POST",
        headers: {
            "content-type": "application/json",
            ...headers
        },
        body: JSON.stringify({ id: id }),
        credentials: "include"
      });

      // Detect rate limiting
      if (response.status === 429) {
        console.warn('Rate limited on delete request');
        if (element) {
          element.style.opacity = '1';
          element.style.pointerEvents = 'auto';
        }
        return 'rate_limited';
      }

      if (response.ok) {
        if (element) {
          element.style.transform = 'scale(0.8)';
          element.style.opacity = '0';
          setTimeout(() => element.remove(), 200);
        }
        this.posts = this.posts.filter(p => (p.postId || p.id) !== id);
        this.updateStatus(`Deleted post ${id}`);
        return true;
      } else {
        console.error('Delete failed', await response.text());
        if (element) {
             element.style.opacity = '1';
             element.style.pointerEvents = 'auto';
             // Visual feedback for error
             element.style.borderColor = '#e0245e';
        }
        return false;
      }
    } catch (e) {
      console.error(e);
      return false;
    }
  }

  private async likePost(id: string, element?: HTMLElement) {
    try {
      const headers = await this.getHeaders();
      if (!headers) {
        this.updateStatus('Lost session. Please refresh.', '#e0245e');
        return false;
      }

      const response = await fetch("https://grok.com/rest/media/post/like", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          ...headers
        },
        body: JSON.stringify({ id: id }),
        credentials: "include"
      });

      if (response.ok) {
        if (element) {
           element.dataset.liked = 'true';
           element.style.color = '#e0245e';
           element.style.fill = '#e0245e';
           element.innerHTML = `
            <svg width="16" height="16" viewBox="0 0 24 24" fill="#e0245e" stroke="#e0245e" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"></path>
            </svg>
           `;
        }
        this.updateStatus(`Liked post`, '#17bf63');
        return true;
      } else {
        console.error('Like failed', await response.text());
        return false;
      }
    } catch (e) {
      console.error(e);
      return false;
    }
  }

  private async upscaleVideo(videoId: string): Promise<string | null> {
    try {
      const headers = await this.getHeaders();
      if (!headers) return null;

      const response = await fetch("https://grok.com/rest/media/video/upscale", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          ...headers
        },
        body: JSON.stringify({ videoId: videoId }),
        credentials: "include"
      });

      if (response.ok) {
        const data = await response.json();
        return data.hdMediaUrl || null;
      }
      return null;
    } catch (e) {
      console.error(e);
      return null;
    }
  }

  private async fetchLikedPosts(): Promise<GrokPost[]> {
    this.updateProgress('Fetching favorite posts...');
    const headers = await this.getHeaders();
    if (!headers) {
      this.updateProgress('No headers found.');
      return [];
    }

    let allPosts: GrokPost[] = [];
    let cursor: string | undefined = undefined;
    let hasMore = true;

    try {
      while (hasMore) {
        if (this.stopDeleting) break; // Check for stop signal during fetch loop

        const body: any = {
          limit: 40,
          filter: { source: "MEDIA_POST_SOURCE_LIKED" }
        };
        if (cursor) body.cursor = cursor;

        const response = await fetch("https://grok.com/rest/media/post/list", {
          method: "POST",
          headers: {
            "content-type": "application/json",
            ...headers
          },
          body: JSON.stringify(body),
          credentials: "include"
        });

        if (!response.ok) throw new Error(`Fetch failed: ${response.status}`);

        const data = await response.json();
        const posts = data.posts || [];
        allPosts = [...allPosts, ...posts];
        
        this.updateProgress(`Fetched ${allPosts.length} favorites...`);

        if (data.nextCursor) {
          cursor = data.nextCursor;
          // Small delay to be nice to the API
          await new Promise(r => setTimeout(r, 200));
        } else {
          hasMore = false;
        }
      }
    } catch (e) {
      console.error(e);
      this.updateProgress('Error fetching favorites.');
    }

    return allPosts;
  }

  private async startUpscaleAndDownloadFavorites() {
    if (!confirm('This will fetch all your liked posts, upscale the videos, and download them. \n\nWARNING: This opens many tabs. Please allow popups for this site.')) return;

    this.showProgressModal();
    this.updateProgress('Initializing...');

    this.isDeleting = true; // Use this lock to prevent other actions
    this.stopDeleting = false;
    if (this.stopBtn) this.stopBtn.style.display = 'inline-block';

    const posts = await this.fetchLikedPosts();
    this.updateProgress(`Found ${posts.length} favorites. Starting upscale & download...`);

    let processedCount = 0;
    
    // Filter only videos
    const videoPosts = posts.filter(p => p.mediaType === 'MEDIA_POST_TYPE_VIDEO' || (p.videos && p.videos.length > 0));
    this.updateProgress(`Found ${videoPosts.length} videos among favorites.`);

    for (const post of videoPosts) {
      if (this.stopDeleting) break;
      
      processedCount++;
      const postId = post.postId || post.id;
      
      // Prefer dedicated video ID if available in nested objects
      let videoId = postId;
      if (post.videos && post.videos.length > 0) {
        videoId = post.videos[0].id || postId;
      }

      this.updateProgress(`Processing ${processedCount}/${videoPosts.length}: Upscaling...`);

      // 1. Try to get existing hdMediaUrl first if available
      let downloadUrl = post.hdMediaUrl;

      // 2. If not, try upscale
      if (!downloadUrl && videoId) {
          downloadUrl = await this.upscaleVideo(videoId);
      }

      // 3. Fallback to standard mediaUrl
      if (!downloadUrl) {
          downloadUrl = post.mediaUrl;
      }

      if (downloadUrl) {
        try {
            // Create temporary link
            const a = document.createElement('a');
            a.href = downloadUrl;
            a.download = ''; // Browser will infer filename or use Content-Disposition
            a.target = '_blank'; // Fallback to new tab if download attribute is ignored for cross-origin
            a.style.display = 'none';
            document.body.appendChild(a);
            a.click();
            
            // Cleanup
            setTimeout(() => {
                document.body.removeChild(a);
            }, 100);
            
            this.updateProgress(`Started download for ${videoId}`);
        } catch (e) {
            console.error('Download error', e);
            this.updateProgress(`Error downloading ${videoId}`);
        }
      } else {
        console.error('No URL found for', videoId);
        this.updateProgress(`Failed to find URL for ${videoId}`);
      }

      // Delay to prevent freezing and allow browser to handle tabs
      await new Promise(r => setTimeout(r, 1500));
    }

    this.isDeleting = false;
    if (this.stopBtn) this.stopBtn.style.display = 'none';
    this.updateProgress(`Finished processing ${processedCount} videos.`);
  }

  private async startDeleteAll() {
    if (!confirm('Are you sure you want to delete ALL shared posts? This will use parallel deletion for faster processing.')) return;
    
    this.isDeleting = true;
    this.stopDeleting = false;
    this.rateLimitHits = 0;
    if (this.stopBtn) this.stopBtn.style.display = 'inline-block';
    
    let totalDeleted = 0;
    let totalFailed = 0;
    let currentConcurrency = this.CONCURRENCY_LIMIT;

    // Pre-fetch first batch if not already loaded
    if (this.posts.length === 0) {
      await this.fetchPosts();
    }

    do {
      const postsToDelete = [...this.posts];
      const totalInBatch = postsToDelete.length;
      
      if (totalInBatch === 0) break;

      this.updateStatus(`Deleting ${totalInBatch} posts (${currentConcurrency} concurrent)...`);

      // Pre-fetch next page while deleting current batch
      const nextCursor = this.nextCursor;
      const prefetchPromise = nextCursor ? this.prefetchPosts(nextCursor) : Promise.resolve(null);

      // Delete current batch in parallel
      let completedCount = 0;
      let batchRateLimits = 0;
      
      const results = await this.executeWithConcurrency(
        postsToDelete,
        async (post, index) => {
          if (this.stopDeleting) return false;
          
          const postId = post.postId || post.id;
          if (!postId) return false;

          const result = await this.deletePost(postId, undefined, true);
          
          // Track rate limits
          if (result === 'rate_limited') {
            batchRateLimits++;
            this.rateLimitHits++;
            return false;
          }
          
          completedCount++;
          
          // Update status periodically (every 10 deletions to reduce UI thrash)
          if (completedCount % 10 === 0 || completedCount === totalInBatch) {
            this.updateStatus(`Deleted ${completedCount}/${totalInBatch} (Total: ${totalDeleted + completedCount})...`);
          }
          
          return result === true;
        },
        currentConcurrency
      );

      // Count results
      const batchDeleted = results.filter(r => r === true).length;
      const batchFailed = results.filter(r => r === false).length;
      totalDeleted += batchDeleted;
      totalFailed += batchFailed;

      // Handle rate limiting - back off if we're getting limited
      if (batchRateLimits > 0) {
        const backoffTime = Math.min(5000, 1000 * Math.pow(2, this.rateLimitHits - 1));
        this.updateStatus(`Rate limited! Backing off for ${backoffTime/1000}s...`, '#f5a623');
        await new Promise(r => setTimeout(r, backoffTime));
        
        // Reduce concurrency if we keep hitting limits
        if (this.rateLimitHits >= 3 && currentConcurrency > 2) {
          currentConcurrency = Math.max(2, currentConcurrency - 1);
          this.updateStatus(`Reducing concurrency to ${currentConcurrency}`, '#f5a623');
        }
      } else {
        // Reset rate limit counter on successful batch
        this.rateLimitHits = Math.max(0, this.rateLimitHits - 1);
      }

      if (this.stopDeleting) break;

      // Get prefetched posts
      const prefetchedData = await prefetchPromise;
      if (prefetchedData) {
        this.posts = prefetchedData.posts;
        this.nextCursor = prefetchedData.nextCursor;
      } else {
        this.posts = [];
        this.nextCursor = null;
      }

      // Jittered delay between batches to prevent rate limiting
      if (this.posts.length > 0) {
        await new Promise(r => setTimeout(r, this.jitter(this.DELETE_BATCH_DELAY)));
      }

    } while (this.posts.length > 0 && !this.stopDeleting);

    this.isDeleting = false;
    if (this.stopBtn) this.stopBtn.style.display = 'none';
    
    const status = totalFailed > 0 
      ? `Finished. Deleted ${totalDeleted} posts (${totalFailed} failed).`
      : `Finished. Deleted ${totalDeleted} posts.`;
    this.updateStatus(status, totalFailed > 0 ? '#f5a623' : '#17bf63');
    
    this.fetchPosts(); 
  }

  /**
   * Prefetch posts without updating UI - used for parallel fetching while deleting
   */
  private async prefetchPosts(cursor: string): Promise<{ posts: GrokPost[], nextCursor: string | null } | null> {
    try {
      const headers = await this.getHeaders();
      if (!headers) return null;

      const body: any = { limit: 400, cursor };

      const response = await fetch("https://grok.com/rest/media/post/list-shared-posts", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          ...headers
        },
        body: JSON.stringify(body),
        credentials: "include"
      });

      if (!response.ok) return null;

      const data = await response.json();
      const posts = Array.isArray(data) ? data : (data.items || data.posts || []);
      
      return {
        posts,
        nextCursor: data.nextCursor || null
      };
    } catch (e) {
      console.error('Prefetch error:', e);
      return null;
    }
  }
}

new CJGrok();