import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  /**
   * Who may load the dev server's internal assets cross-origin. Next refuses
   * unknown origins, so reaching `pnpm dev` from a phone or an iPad on the LAN
   * gets 403s on `/__nextjs_font/...` and a dead HMR websocket — the dev overlay
   * loses its font and edits stop hot-reloading, on the exact devices this project
   * is built for (see docs/SURFACES.md). Production is unaffected: this option
   * only governs the dev server.
   *
   * Private ranges only, so this widens nothing beyond a home network — and the
   * hardware pass that #12, #13, #14 and #19 all depend on is the reason it is
   * here rather than a per-machine setting.
   */
  allowedDevOrigins: ['192.168.*.*', '10.*.*.*', '172.16.*.*', '*.local'],
};

export default nextConfig;
