import { cork } from './cork';
import { englishChannel } from './englishChannel';
import type { Scenario } from './types';
import { world } from './world';

/** Add new areas here. The id is what SCENARIO selects. */
const scenarios: Record<string, Scenario> = {
  [cork.id]: cork,
  [englishChannel.id]: englishChannel,
  [world.id]: world,
};

export function getScenario(id: string): Scenario {
  const scenario = scenarios[id];
  if (!scenario) {
    throw new Error(
      `Unknown scenario "${id}". Available: ${Object.keys(scenarios).join(', ')}`,
    );
  }
  return scenario;
}

export type { Airport, Scenario } from './types';
