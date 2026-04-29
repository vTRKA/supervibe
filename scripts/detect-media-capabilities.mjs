#!/usr/bin/env node
import { detectMediaCapabilities, formatMediaCapabilities } from './lib/media-capabilities.mjs';

const jsonOnly = process.argv.includes('--json');
const caps = detectMediaCapabilities();

if (jsonOnly) {
  console.log(JSON.stringify(caps, null, 2));
} else {
  console.log('Supervibe Media Capabilities');
  console.log('============================');
  console.log(formatMediaCapabilities(caps));
}
