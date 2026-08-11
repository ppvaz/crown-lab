
/**
 * @type {Record<string, import('playwright-core').BrowserContextOptions>}
 */
export const VIEWPORTS = {
  desktop: { viewport: { width: 1440, height: 900 } },
  laptop: { viewport: { width: 1280, height: 720 } },
  'mobile-landscape': {
    viewport: { width: 984, height: 443 },
    deviceScaleFactor: 2.4375,
    isMobile: true,
    hasTouch: true,
  },
  'desktop-retina': { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 },
};
