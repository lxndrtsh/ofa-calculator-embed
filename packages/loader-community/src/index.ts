type Options = {
  apiBase: string;
  configVersion?: string;
  theme?: 'light'|'dark';
  referralCookie?: string;
  iframeBase?: string;
};
declare global {
  interface Window { HPPEmbed: { init: (elOrId: HTMLElement|string, opts: Options) => void } }
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
      if (!el) throw new Error(`HPPEmbed: container #${elOrId} not found`);
      return el;
    }
    return elOrId;
  }
  function readCookie(name: string): string | null {
    const m = document.cookie.match(new RegExp('(?:^|; )' + name.replace(/([$()*+./?[\\\\]^{|}])/g, '\\$1') + '=([^;]*)'));
    return m ? decodeURIComponent(m[1]) : null;
  }
  function init(elOrId: HTMLElement|string, options: Options) {
    const opts = { ...DEFAULTS, ...options };
    const container = getEl(elOrId);
    const wrapper = document.createElement('div');
    wrapper.style.position = 'relative';
    wrapper.style.width = '100%';
    const iframe = document.createElement('iframe');
    iframe.title = 'HPP Widget';
    iframe.allow = 'clipboard-write';
    iframe.loading = 'lazy';
    iframe.style.width = '1px';
    iframe.style.minWidth = '100%';
    iframe.style.border = '0';
    iframe.style.display = 'block';
    const src = new URL(`${opts.iframeBase!.replace(/\/$/,'')}/embed/community`);
    src.searchParams.set('v', String(opts.configVersion));
    src.searchParams.set('theme', String(opts.theme));
    iframe.src = src.toString();
    wrapper.appendChild(iframe);
    container.appendChild(wrapper);
    const referral = readCookie(opts.referralCookie!);
    function onMessage(ev: MessageEvent) {
      const allowed = new URL(opts.iframeBase!).origin;
      if (ev.origin !== allowed) return;
      if ((ev.data && ev.data.type) === 'HPP_EMBED_READY') {
        iframe.contentWindow?.postMessage({
          type: 'HPP_EMBED_BOOT',
          payload: {
            apiBase: opts.apiBase,
            configVersion: String(opts.configVersion),
            theme: opts.theme,
            referralToken: referral ?? null
          }
        }, allowed);
      }
      if ((ev.data && ev.data.type) === 'HPP_EMBED_RESIZE') {
        const h = Number(ev.data.height || 0);
        if (h > 0) iframe.style.height = `${h}px`;
      }
    }
    window.addEventListener('message', onMessage);
  }
  window.HPPEmbed = { init };
})();
