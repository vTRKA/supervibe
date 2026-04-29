import { spawnSync } from 'node:child_process';

const DEFAULT_COMMANDS = {
  ffmpeg: ['ffmpeg', '-version'],
  ffprobe: ['ffprobe', '-version'],
  magick: ['magick', '-version'],
  gifski: ['gifski', '--version'],
};

function commandAvailable(command, args = []) {
  const result = spawnSync(command, args, {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  });
  return {
    available: result.status === 0,
    command,
    status: result.status,
    error: result.error?.code || null,
  };
}

export function detectMediaCapabilities(commands = DEFAULT_COMMANDS) {
  const tools = {};
  for (const [name, cmd] of Object.entries(commands)) {
    tools[name] = commandAvailable(cmd[0], cmd.slice(1));
  }

  const video = Boolean(tools.ffmpeg?.available);
  const animatedGif = Boolean(tools.ffmpeg?.available || tools.gifski?.available);
  const rasterExport = Boolean(tools.magick?.available || tools.ffmpeg?.available);

  return {
    video,
    animatedGif,
    rasterExport,
    tools,
    recommendedFallbacks: video
      ? []
      : [
          'CSS/WAAPI motion in the live prototype',
          'Lottie or SVG sequence only if the asset is already available',
          'static storyboard frames with transition notes',
          'PNG/WebP poster frame plus interaction spec',
        ],
  };
}

export function formatMediaCapabilities(caps) {
  const lines = [
    `video: ${caps.video ? 'available' : 'unavailable'}`,
    `animatedGif: ${caps.animatedGif ? 'available' : 'unavailable'}`,
    `rasterExport: ${caps.rasterExport ? 'available' : 'unavailable'}`,
  ];
  const availableTools = Object.entries(caps.tools)
    .filter(([, value]) => value.available)
    .map(([name]) => name);
  lines.push(`tools: ${availableTools.length ? availableTools.join(', ') : 'none detected'}`);
  if (!caps.video) {
    lines.push(`fallbacks: ${caps.recommendedFallbacks.join('; ')}`);
  }
  return lines.join('\n');
}
