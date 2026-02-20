type Options = {
  apiBase: string;
  configVersion?: string;
  theme?: 'light'|'dark';
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
    configVersion: '1.0.0',
    referralCookie: 'referral'
  };
  function getEl(elOrId: HTMLElement|string): HTMLElement {
    if (typeof elOrId === 'string') {
      const el = document.getElementById(elOrId);
      if (!el) throw new Error(`OFACalculator: container #${elOrId} not found`);
      return el;
    }
    return elOrId;
  }
  function readCookie(name: string): string | null {
    const m = document.cookie.match(new RegExp('(?:^|; )' + name.replace(/([$()*+./?[\\\\]^{|}])/g, '\\$1') + '=([^;]*)'));
    return m ? decodeURIComponent(m[1]) : null;
  }
  /** Read referral code from URL (utm_rcode, utm_refcode, utm_referral_code). Used when cookie is not set. */
  function readReferralFromQuery(): string | null {
    if (typeof window === 'undefined' || !window.location?.search) return null;
    const q = new URLSearchParams(window.location.search);
    const keys = ['utm_rcode', 'utm_refcode', 'utm_referral_code'];
    for (const key of keys) {
      const v = q.get(key);
      if (v && String(v).trim()) return String(v).trim();
    }
    return null;
  }
  function init(elOrId: HTMLElement|string, options: Options) {
    try {
      const opts = { ...DEFAULTS, ...options };
      
      // Wait for DOM to be ready if needed
      if (typeof document !== 'undefined' && document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => init(elOrId, options));
        return;
      }
      
      const container = getEl(elOrId);
      console.log('OFACalculator: Initializing full-oia form in container:', elOrId);
      
      // Prevent duplicate initialization
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
    const src = new URL(`${opts.iframeBase!.replace(/\/$/,'')}/embed/full-oia`);
    src.searchParams.set('v', String(opts.configVersion));
    src.searchParams.set('theme', String(opts.theme));
    iframe.src = src.toString();
    wrapper.appendChild(iframe);
    container.appendChild(wrapper);
    // Cookie first (host may set it from utm_rcode); fallback to URL so ?utm_rcode= works without a cookie
    const referral = readCookie(opts.referralCookie!) ?? readReferralFromQuery();
    if (referral) {
      console.log('OFACalculator: referral token for boot:', referral);
    }
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
            referralToken: referral ?? null,
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
      console.log('OFACalculator: iframe created and message listener attached');
    } catch (error) {
      console.error('OFACalculator: Error initializing:', error);
      throw error;
    }
  }
  window.OFACalculator = { init };
  console.log('OFACalculator: full-oia loader script loaded');
})();

// Make this file a module so global augmentation works
export {};
