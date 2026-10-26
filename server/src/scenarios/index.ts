import { englishChannel } from './englishChannel';
import type { Scenario } from './types';

/** Add new areas here. The id is what SIM_SCENARIO selects. */
const scenarios: Record<string, Scenario> = {
  [englishChannel.id]: englishChannel,
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

export type { Scenario } from './types';
