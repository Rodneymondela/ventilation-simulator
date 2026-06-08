import type { FanState } from '../solver';

/**
 * Presentation for fan operating states. Colours follow the Ventsim-style
 * convention referenced in the spec: normal = green, off = blue,
 * reverse = yellow/amber, stalled = red.
 */
export const FAN_STATE_STYLE: Record<FanState, { label: string; color: string; text: string }> = {
  normal: { label: 'normal', color: '#16a34a', text: 'text-green-600' },
  off: { label: 'off', color: '#2563eb', text: 'text-blue-600' },
  reverse: { label: 'reverse', color: '#d97706', text: 'text-amber-600' },
  stalled: { label: 'stalled', color: '#dc2626', text: 'text-red-600' },
};
