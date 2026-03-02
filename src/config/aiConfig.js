export const AI_DIFFICULTY_PROFILES = {
  Easy: {
    depth: 3,
    maxMs: null,
    maxNodes: null,
    rootProbeNodes: 50,
    stochasticTopK: 2
  },
  Medium: {
    depth: 6,
    maxMs: null,
    maxNodes: null,
    rootProbeNodes: 50,
    stochasticTopK: 2
  },
  Hard: {
    depth: 9,
    maxMs: 35,
    maxNodes: 15000,
    rootProbeNodes: 50,
    stochasticTopK: 3
  },
  Champion: {
    depth: 12,
    maxMs: 100,
    maxNodes: 25000,
    rootProbeNodes: 50,
    stochasticTopK: 3
  }
};

export const DEFAULT_AI_DIFFICULTY = 'Medium';

export const getAiProfile = (difficulty) => {
  const profile = AI_DIFFICULTY_PROFILES[difficulty] || AI_DIFFICULTY_PROFILES[DEFAULT_AI_DIFFICULTY];
  return { ...profile };
};

