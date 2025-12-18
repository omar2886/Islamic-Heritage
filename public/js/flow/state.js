const VERSION = 4;

function createInitialHeirsCounts() {
  return {};
}

function createInitialState() {
  return {
    version: VERSION,
    step: 'screening',
    screening: {
      spouse: false,
      descendants: false,
      ascendants: false,
      siblings: false,
      collaterals: false,
    },
    deceased: { name: '', sex: '', notes: '' },
    estate: { value: '', currency: 'MAD' },
    heirsCounts: createInitialHeirsCounts(),
    lastPayload: null,
    lastResponse: null,
    lastError: '',
  };
}

function withVersion(state) {
  return { ...state, version: VERSION };
}

function setStep(state, step) {
  return withVersion({ ...state, step });
}

function setDeceased(state, partial) {
  return withVersion({
    ...state,
    deceased: { ...state.deceased, ...partial },
  });
}

function setEstateValue(state, valueString) {
  const nextValue = typeof valueString === 'string' || typeof valueString === 'number' ? String(valueString) : '';
  return withVersion({
    ...state,
    estate: { ...state.estate, value: nextValue },
  });
}

function setHeirCount(state, role, countInt) {
  const safeCount = Number.isInteger(countInt) && countInt >= 0 ? countInt : 0;
  return withVersion({
    ...state,
    heirsCounts: { ...state.heirsCounts, [role]: safeCount },
  });
}

function setScreening(state, partial) {
  return withVersion({
    ...state,
    screening: { ...state.screening, ...partial },
  });
}

function setLastPayload(state, payloadObjOrNull) {
  return withVersion({ ...state, lastPayload: payloadObjOrNull });
}

function setLastResponse(state, responseObjOrNull) {
  return withVersion({ ...state, lastResponse: responseObjOrNull });
}

function setLastError(state, errorString) {
  return withVersion({ ...state, lastError: errorString });
}

export {
  VERSION,
  createInitialState,
  createInitialHeirsCounts,
  setStep,
  setDeceased,
  setEstateValue,
  setHeirCount,
  setScreening,
  setLastPayload,
  setLastResponse,
  setLastError,
};
