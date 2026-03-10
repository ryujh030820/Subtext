import ReactDOM from 'react-dom/client';
import React from 'react';
import App from './App';
import { onMessage } from '@/lib/messaging';
import './style.css';

export default defineContentScript({
  matches: ['*://*.youtube.com/*'],
  runAt: 'document_idle',
  cssInjectionMode: 'ui',

  async main(ctx) {
    // Google Fonts — Geist (via Vercel/CDN) or Inter (via Google Fonts)
    if (!document.querySelector('link[data-subtext-fonts]')) {
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href =
        'https://fonts.googleapis.com/css2?family=Geist+Mono:wght@400;500&family=Geist:wght@300;400;500;600&family=Inter:wght@400;500;600;700&display=swap';
      link.setAttribute('data-subtext-fonts', '1');
      document.head.appendChild(link);
    }

    let isOpen = false;
    let root: ReactDOM.Root | null = null;

    const ui = await createShadowRootUi(ctx, {
      name: 'subtext-overlay',
      position: 'inline',
      isolateEvents: true,
      onMount(uiContainer, _shadow, shadowHost) {
        shadowHost.style.position = 'fixed';
        shadowHost.style.top = '0';
        shadowHost.style.right = '0';
        shadowHost.style.width = '0';
        shadowHost.style.height = '100vh';
        shadowHost.style.zIndex = '2147483647';
        shadowHost.style.pointerEvents = 'none';

        root = ReactDOM.createRoot(uiContainer);
        return uiContainer;
      },
      onRemove() {
        root?.unmount();
        root = null;
      },
    });

    ui.mount();

    function renderPanel(open: boolean) {
      if (!root) return;

      if (open) {
        // Match the .overlay-panel width from style.css
        ui.shadowHost.style.width = '380px';
        ui.shadowHost.style.pointerEvents = 'auto';
        root.render(
          <React.StrictMode>
            <App onClose={() => togglePanel()} />
          </React.StrictMode>,
        );
      } else {
        const panel = ui.uiContainer.querySelector('.overlay-panel') as HTMLElement | null;
        if (panel) {
          panel.classList.add('closing');
          panel.addEventListener(
            'animationend',
            () => {
              ui.shadowHost.style.width = '0';
              ui.shadowHost.style.pointerEvents = 'none';
              root?.render(<></>);
            },
            { once: true },
          );
        } else {
          ui.shadowHost.style.width = '0';
          ui.shadowHost.style.pointerEvents = 'none';
          root.render(<></>);
        }
      }
    }

    function togglePanel() {
      isOpen = !isOpen;
      renderPanel(isOpen);
    }

    // Listen for toggle messages from background
    onMessage('togglePanel', () => {
      togglePanel();
    });
  },
});
