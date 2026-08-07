
import { spawn } from 'node:child_process';

import { chromium } from 'playwright-core';

export const DEFAULT_ATTEMPTS = 90;

export const startViteServer = ({ port, mode, host } = {}) => {
  const args = ['vite'];
  if (host !== undefined) args.push('--host', host);
  args.push('--port', String(port), '--strictPort');
  if (mode !== undefined) args.push('--mode', mode);

  const proc = spawn('npx', args, { stdio: ['ignore', 'ignore', 'pipe'] });
  const state = { exited: false, stderr: '' };
  proc.stderr.on('data', (chunk) => {
    state.stderr += String(chunk);
  });
  proc.on('exit', () => {
    state.exited = true;
  });
  return { proc, state };
};

export const waitForServer = async (url, state, attempts = DEFAULT_ATTEMPTS) => {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    if (state.exited) {
      throw new Error(
        `dev server exited before becoming ready${state.stderr ? `: ${state.stderr.trim()}` : ''}`,
      );
    }
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch {
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`dev server did not answer at ${url}`);
};

export const launchChrome = async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const answerGate = async (context) => {
    await context.addInitScript(() => {
      try {
        localStorage.setItem('crown.data-mode', 'full');
      } catch {
      }
    });
    return context;
  };
  const newContext = browser.newContext.bind(browser);
  browser.newContext = async (options) => answerGate(await newContext(options));
  const newPage = browser.newPage.bind(browser);
  browser.newPage = async (options) => {
    const page = await newPage(options);
    await answerGate(page.context());
    await page.goto('about:blank');
    return page;
  };
  return browser;
};
