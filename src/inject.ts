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

  constructor() {
    this.init();
  }

  private init() {
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
        this.createUI();
      }
    } else {
      if (this.button) {
        this.button.remove();
        this.button = null;
      }
    }
  }

  private createUI() {
    // Create floating button
    this.button = document.createElement('button');
    this.button.textContent = 'All Posts';
    this.button.style.cssText = `
      position: fixed;
      bottom: 20px;
      right: 20px;
      z-index: 99999;
      background: rgba(29, 161, 242, 0.9);
      backdrop-filter: blur(20px);
      color: white;
      border: 1px solid rgba(255, 255, 255, 0.2);
      padding: 12px 24px;
      border-radius: 9999px;
      cursor: pointer;
      font-size: 15px;
      font-weight: 700;
      box-shadow: 0 4px 20px rgba(0, 0, 0, 0.3);
      transition: all 0.2s ease;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
    `;
    
    this.button.addEventListener('mouseenter', () => {
      if (this.button) {
        this.button.style.transform = 'scale(1.05)';
        this.button.style.background = 'rgba(29, 161, 242, 1)';
      }
    });
    this.button.addEventListener('mouseleave', () => {
      if (this.button) {
        this.button.style.transform = 'scale(1)';
        this.button.style.background = 'rgba(29, 161, 242, 0.9)';
      }
    });
    this.button.addEventListener('click', () => this.toggleModal());
    
    document.body.appendChild(this.button);
    this.createModal();
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
      background-color: rgba(0, 0, 0, 0.7);
      z-index: 100000;
      justify-content: center;
      align-items: center;
      backdrop-filter: blur(20px);
    `;

    this.modal.addEventListener('click', (e) => {
      if (e.target === this.modal) this.closeModal();
    });

    const modalContent = document.createElement('div');
    modalContent.style.cssText = `
      background: rgba(0, 0, 0, 0.85);
      backdrop-filter: blur(30px);
      color: #fff;
      border: 1px solid rgba(255, 255, 255, 0.1);
      border-radius: 20px;
      padding: 24px;
      width: 1000px;
      max-width: 95%;
      height: 90vh;
      display: flex;
      flex-direction: column;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      box-shadow: 0 20px 60px rgba(0, 0, 0, 0.7);
    `;

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

  private async fetchPosts() {
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
      const response = await fetch("https://grok.com/rest/media/post/list-shared-posts", {
        method: "POST",
        headers: {
            "content-type": "application/json",
            ...headers
        },
        body: JSON.stringify({ limit: 40000 }),
        credentials: "include"
      });

      if (!response.ok) throw new Error(`Failed to fetch: ${response.status}`);

      const data = await response.json();
      this.posts = Array.isArray(data) ? data : (data.items || data.posts || []);
      
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
        aspect-ratio: 1;
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
  }

  private async deletePost(id: string, element?: HTMLElement, skipConfirmation: boolean = false) {
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

  private async startDeleteAll() {
    if (!confirm('Are you sure you want to delete ALL displayed posts?')) return;
    
    this.isDeleting = true;
    this.stopDeleting = false;
    if (this.stopBtn) this.stopBtn.style.display = 'inline-block';
    
    const postsToDelete = [...this.posts]; 
    let deletedCount = 0;

    for (const post of postsToDelete) {
      if (this.stopDeleting) break;
      
      this.updateStatus(`Deleting ${deletedCount + 1}/${postsToDelete.length}...`);
      
      const postId = post.postId || post.id;
      if (!postId) continue;

      const success = await this.deletePost(postId, undefined, true);
      if (success) {
        deletedCount++;
      }
      
      await new Promise(r => setTimeout(r, 500));
    }

    this.isDeleting = false;
    if (this.stopBtn) this.stopBtn.style.display = 'none';
    this.updateStatus(`Finished. Deleted ${deletedCount} posts.`);
    this.fetchPosts(); 
  }
}

new CJGrok();
