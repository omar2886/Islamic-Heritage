const VERSION = 4;

const DEFAULT_HEIRS = [
  'wife',
  'husband',
  'son',
  'daughter',
  'sons_son',
  'sons_daughter',
  'father',
  'mother',
  'paternal_grandfather',
  'paternal_grandmother',
  'maternal_grandmother',
  'paternal_great_grandmother',
  'maternal_great_grandmother',
  'full_brother',
  'full_sister',
  'consanguine_brother',
  'consanguine_sister',
  'uterine_brother',
  'uterine_sister',
  'paternal_uncle',
  'paternal_uncles_daughter',
  'paternal_uncle_son',
  'paternal_uncle_sons_daughter',
  'consanguine_paternal_uncle',
  'consanguine_paternal_uncles_daughter',
  'consanguine_paternal_uncle_son',
  'consanguine_paternal_uncle_sons_daughter',
];

function createInitialHeirsCounts() {
  return DEFAULT_HEIRS.reduce((acc, role) => ({ ...acc, [role]: 0 }), {});
}

function createInitialState() {
  return {
    version: VERSION,
    step: 'screening',
    estateValue: '',
    lastResponse: null,
    lastError: '',
    screening: {
      spouse: false,
      descendants: false,
      ascendants: false,
      siblings: false,
      collaterals: false,
    },
    deceased: { name: '', sex: 'M', madhhab: '', notes: '' },
    estate: { value: '', currency: 'MAD' },
    heirsCounts: createInitialHeirsCounts(),
    lastResult: null,
    lastResultRaw: null,
    lastPayload: null,
  };
}

function withVersion(state) {
  return { ...state, version: VERSION };
}

function setDeceased(state, payload) {
  return withVersion({
    ...state,
    deceased: { ...state.deceased, ...payload },
  });
}

function setStep(state, step) {
  return withVersion({
    ...state,
    step,
  });
}

function setScreening(state, payload) {
  return withVersion({
    ...state,
    screening: { ...state.screening, ...payload },
  });
}

function setEstateValue(state, value) {
  const nextValue = typeof value === 'string' || typeof value === 'number' ? String(value) : '';
  return withVersion({
    ...state,
    estateValue: nextValue,
    estate: {
      ...state.estate,
      value: nextValue,
    },
  });
}

function setLastResponse(state, payload) {
  return withVersion({
    ...state,
    lastResponse: payload,
  });
}

function setLastError(state, message) {
  return withVersion({
    ...state,
    lastError: message,
  });
}

function setLastResult(state, payload) {
  return withVersion({
    ...state,
    lastResult: payload,
  });
}

function setLastResultRaw(state, payload) {
  return withVersion({
    ...state,
    lastResultRaw: payload,
  });
}

function setLastPayload(state, payload) {
  return withVersion({
    ...state,
    lastPayload: payload,
  });
}

function setHeirCount(state, role, count) {
  const safeCount = Number.isFinite(count) && count >= 0 ? count : 0;
  return withVersion({
    ...state,
    heirsCounts: { ...state.heirsCounts, [role]: safeCount },
  });
}

export {
  VERSION,
  createInitialState,
  createInitialHeirsCounts,
  setDeceased,
  setStep,
  setScreening,
  setEstateValue,
  setLastResult,
  setLastResultRaw,
  setLastPayload,
  setLastResponse,
  setLastError,
  setHeirCount,
  DEFAULT_HEIRS,
};
