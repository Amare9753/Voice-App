export const EXPLICIT_NETWORK_ACTIONS = ['download-speech-model'] as const;

export type ExplicitNetworkAction = (typeof EXPLICIT_NETWORK_ACTIONS)[number];

export function assertUserInitiatedNetwork(action: ExplicitNetworkAction, userInitiated: boolean): void {
  if (userInitiated) return;
  throw new Error(
    `Core Capture does not use the network for ${action} unless you explicitly ask. Notes, audio, and photos stay on this device.`,
  );
}
