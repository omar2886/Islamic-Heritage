const VERSION = 4;

function createInitialHeirsCounts() {
  return {};
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
};
