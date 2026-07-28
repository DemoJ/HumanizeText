export async function notifyUser(message, tabId) {
  if (tabId) {
    try {
      const tab = await chrome.tabs.get(tabId).catch(() => null);
      if (tab?.url?.startsWith('http')) {
        await chrome.scripting.executeScript({
          target: { tabId },
          func: (msg) => {
            const id = 'humanize-text-toast';
            let el = document.getElementById(id);
            if (!el) {
              el = document.createElement('div');
              el.id = id;
              el.style.cssText = [
                'position:fixed',
                'top:20px',
                'right:20px',
                'z-index:2147483647',
                'background:#333',
                'color:#fff',
                'padding:12px 16px',
                'border-radius:8px',
                'font-size:14px',
                'line-height:1.4',
                'box-shadow:0 4px 12px rgba(0,0,0,.2)',
                'max-width:320px',
                'font-family:system-ui,-apple-system,sans-serif',
                'transition:opacity .2s'
              ].join(';');
              document.body.appendChild(el);
            }
            el.textContent = msg;
            el.style.opacity = '1';
            clearTimeout(el._htTimer);
            el._htTimer = setTimeout(() => {
              el.style.opacity = '0';
              setTimeout(() => el.remove(), 200);
            }, 3000);
          },
          args: [message]
        });
        return;
      }
    } catch (error) {
      console.error('页内提示失败:', error);
    }
  }

  try {
    await chrome.action.setBadgeText({ text: '!' });
    await chrome.action.setBadgeBackgroundColor({ color: '#f44336' });
    await chrome.action.setTitle({ title: message });
    setTimeout(() => {
      chrome.action.setBadgeText({ text: '' });
      chrome.action.setTitle({ title: '人话翻译器' });
    }, 3000);
  } catch (error) {
    console.error(message, error);
  }
}
