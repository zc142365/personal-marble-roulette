/*
 * Copyright (c) 2026 zc142365 <zc142365@gmail.com>
 * https://github.com/zc142365
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */
/**
 * Desktop app for the admin.
 * Runs the server in-process and opens the admin screen directly.
 * The address for participants is copied from the on-screen field or the menu.
 */
const { app, BrowserWindow, clipboard, dialog, shell, Menu } = require('electron');
const path = require('node:path');

// server.mjs is ESM, so it is loaded through a dynamic import (asar:false in
// package.json is what makes that possible)
const serverPath = path.join(__dirname, '..', 'server.mjs');

let tunnelProc = null; // cleaned up when the app quits

// Temporary public addresses come from untun (Cloudflare Quick Tunnel); nothing to
// install separately. The cloudflared binary is downloaded once, on first use.

app.whenReady().then(async () => {
  const { start, setPublicOrigin, setPublicPending } = await import(`file://${serverPath.replace(/\\/g, '/')}`);
  const server = await start();

  let joinUrl = server.joinUrl;

  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    backgroundColor: '#000000',
    title: 'Personal Marble Roulette',
    webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true },
  });
  win.on('page-title-updated', (e) => e.preventDefault());

  // This window holds the admin key, so external sites go to the system browser
  // and are never opened inside it
  const isLocal = (target) => {
    try {
      return new URL(target).origin === new URL(server.adminUrl).origin;
    } catch {
      return false;
    }
  };
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (!isLocal(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
  win.webContents.on('will-navigate', (e, url) => {
    if (!isLocal(url)) {
      e.preventDefault();
      shell.openExternal(url);
    }
  });

  const buildMenu = () => {
    Menu.setApplicationMenu(
      Menu.buildFromTemplate([
        {
          label: '참가 주소',
          submenu: [
            { label: joinUrl, enabled: false },
            { label: '주소 복사', accelerator: 'CmdOrCtrl+Shift+C', click: () => clipboard.writeText(joinUrl) },
            { label: '브라우저로 열기', click: () => shell.openExternal(joinUrl) },
            { type: 'separator' },
            {
              label: tunnelProc ? '공개 링크 사용중 (cloudflared)' : '인터넷에 공개 (cloudflared)...',
              enabled: !tunnelProc,
              click: () => publish(),
            },
            { type: 'separator' },
            { label: '새로고침', role: 'reload' },
            { label: '개발자 도구', role: 'toggleDevTools' },
            { label: '종료', role: 'quit' },
          ],
        },
      ])
    );
  };

  const EXPOSURE_NOTICE =
    '주소를 아는 사람은 누구나 관전할 수 있다. 시작/설정은 관리자 키가 있어야 하므로 이 창에서만 가능하다.\n\n' +
    'Cloudflare 임시 터널(Quick Tunnel)을 쓴다. 계정은 필요 없지만 Cloudflare 이용약관이 적용되며,\n' +
    '최초 1회 cloudflared 를 내려받는다. 앱을 끄면 주소도 사라진다.\n\n' +
    'HTTPS 라서 폰에서 앱 설치(PWA)도 이 주소로만 제대로 된다.';

  /** @param confirmed Skip the confirmation when consent was already given at startup */
  async function publish(confirmed = false) {
    if (!confirmed) {
      const ok = dialog.showMessageBoxSync(win, {
        type: 'warning',
        buttons: ['공개하기', '취소'],
        defaultId: 1,
        cancelId: 1,
        title: '인터넷에 공개',
        message: '이 컴퓨터의 룰렛을 인터넷에 공개할까?',
        detail: EXPOSURE_NOTICE,
      });
      if (ok !== 0) return;
    }

    win.setTitle('Personal Marble Roulette - 공개 주소 만드는 중...');
    try {
      const { startTunnel } = await import('untun');
      const tunnel = await startTunnel({ port: server.port, acceptCloudflareNotice: true });
      if (!tunnel) throw new Error('터널을 만들지 못했다');
      tunnelProc = tunnel;
      joinUrl = setPublicOrigin(await tunnel.getURL());
      clipboard.writeText(joinUrl);
      buildMenu();
      win.setTitle('Personal Marble Roulette');
      // No reload needed: the page polls the state and swaps the address in place
      dialog.showMessageBox(win, {
        type: 'info',
        title: '공개 완료',
        message: '참가 주소가 클립보드에 복사됐다',
        detail: joinUrl,
      });
    } catch (err) {
      tunnelProc = null;
      buildMenu();
      win.setTitle('Personal Marble Roulette');
      dialog.showMessageBox(win, {
        type: 'error',
        title: '공개 링크를 만들지 못했다',
        message: '터널 생성에 실패했다',
        detail: `인터넷 연결과 방화벽을 확인할 것. 최초 실행 시 cloudflared 를 내려받는다.\n\n${err.message}`,
      });
    }
  }

  buildMenu();

  // Ask before loading the page. Asking afterwards would show the LAN address first
  // and then swap it for the domain, which reads as a glitch.
  // Picking "expose to the internet" here *is* the consent, so no second confirmation.
  const choice = dialog.showMessageBoxSync(win, {
    type: 'question',
    buttons: ['인터넷에 공개 (도메인)', '같은 와이파이만 (IP)'],
    defaultId: 1,
    cancelId: 1,
    title: '참가자를 어떻게 받을까?',
    message: '참가자에게 줄 주소를 정한다',
    detail: [
      '- 인터넷에 공개: https://(무작위).trycloudflare.com 주소가 만들어진다.',
      '  어디서든 들어올 수 있고 폰에서 앱 설치(PWA)도 된다.',
      '',
      `- 같은 와이파이만: ${joinUrl} 을 쓴다.`,
      '  같은 네트워크에 있는 사람만 들어올 수 있다. 외부 노출 없음.',
      '',
      "나중에 메뉴의 '참가 주소 > 인터넷에 공개' 로도 바꿀 수 있다.",
      '',
      '[인터넷에 공개를 고를 경우]',
      EXPOSURE_NOTICE,
    ].join('\n'),
  });

  if (choice === 0) {
    // Tell clients an address is on its way so they never render the LAN one
    setPublicPending();
    publish(true);
  }
  win.loadURL(server.adminUrl);
});

app.on('window-all-closed', () => app.quit());
app.on('before-quit', () => {
  tunnelProc?.close(); // the tunnel closes with the app
});
