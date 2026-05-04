type Options = {
  apiBase: string;
  configVersion?: string;
  theme?: 'light'|'dark';
  /** Resolved referral code from the host (e.g. from ?utm_rcode=). Passed through to boot as `referralToken`. Not a cookie name. */
  referralCookie?: string;
  iframeBase?: string;
  hubspotIntegration?: boolean;
};

declare global {
  interface Window {
    OFACalculator: {
      init: (elOrId: HTMLElement|string, opts: Options) => void;
    };
  }
}

(function () {
  const DEFAULTS: Partial<Options> = {
    iframeBase: (typeof window !== 'undefined' ? window.location.origin : '') + '',
    theme: 'light',
    configVersion: '1.0.0'
  };
  function getEl(elOrId: HTMLElement|string): HTMLElement {
    if (typeof elOrId === 'string') {
      const el = document.getElementById(elOrId);
      if (!el) throw new Error(`OFACalculator: container #${elOrId} not found`);
      return el;
    }
    return elOrId;
  }
  /** `referralCookie` on init is the resolved code string from the host (e.g. ?utm_rcode=), not a cookie name. */
  function referralCodeFromInit(opts: Options): string | null {
    const c = opts.referralCookie;
    if (typeof c !== 'string') return null;
    const t = c.trim();
    return t.length ? t : null;
  }
  function init(elOrId: HTMLElement|string, options: Options) {
    try {
      const opts = { ...DEFAULTS, ...options };
      if (typeof document !== 'undefined' && document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => init(elOrId, options));
        return;
      }
      const container = getEl(elOrId);
      console.log('OFACalculator: Initializing simple-oia (form-only) embed in container:', elOrId);
      if (container.querySelector('iframe')) {
        console.warn('OFACalculator: container already initialized, skipping');
        return;
      }
      const wrapper = document.createElement('div');
      wrapper.style.position = 'relative';
      wrapper.style.width = '100%';
      const iframe = document.createElement('iframe');
      iframe.title = 'OFA Calculator Widget';
      iframe.allow = 'clipboard-write';
      iframe.loading = 'lazy';
      iframe.style.width = '1px';
      iframe.style.minWidth = '100%';
      iframe.style.border = '0';
      iframe.style.display = 'block';
      const src = new URL(`${opts.iframeBase!.replace(/\/$/, '')}/embed/simple-oia`);
      src.searchParams.set('v', String(opts.configVersion));
      src.searchParams.set('theme', String(opts.theme));
      iframe.src = src.toString();
      wrapper.appendChild(iframe);
      container.appendChild(wrapper);
      const referral = referralCodeFromInit(opts);
      function onMessage(ev: MessageEvent) {
        const allowed = new URL(opts.iframeBase!).origin;
        if (ev.origin !== allowed) return;
        if ((ev.data && ev.data.type) === 'OFA_CALCULATOR_READY') {
          iframe.contentWindow?.postMessage({
            type: 'OFA_CALCULATOR_BOOT',
            payload: {
              apiBase: opts.apiBase,
              configVersion: String(opts.configVersion),
              theme: opts.theme,
              referralToken: referral,
              hubspotIntegration: opts.hubspotIntegration === true
            }
          }, allowed);
        }
        if ((ev.data && ev.data.type) === 'OFA_CALCULATOR_RESIZE') {
          const h = Number(ev.data.height || 0);
          if (h > 0) iframe.style.height = `${h}px`;
        }
      }
      window.addEventListener('message', onMessage);
      console.log('OFACalculator: simple-oia iframe created and message listener attached');
    } catch (error) {
      console.error('OFACalculator: Error initializing simple-oia:', error);
      throw error;
    }
  }
  window.OFACalculator = { init };
  console.log('OFACalculator: simple-oia loader script loaded');
})();

export {};
