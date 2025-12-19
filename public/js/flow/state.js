export function createInitialState() {
  return {
    version: 1,
    step: 'decedent',
    deceased: { name: '', sex: 'M', notes: '' },
    estate: { value: '' },
    heirsCounts: {},
    reached: {
      decedent: true,
      heirs: false,
      review: false,
      results: false,
    },
    lastPayload: null,
    lastResponse: null,
    lastError: ''
  };
}

function withVersion(state) {
  return { ...state, version: 1 };
}

export function setStep(state, step) {
  return withVersion({ ...state, step });
}

export function setDeceasedField(state, key, value) {
  return withVersion({
    ...state,
    deceased: { ...state.deceased, [key]: value }
  });
}

export function setEstateValue(state, valueString) {
  const normalized = typeof valueString === 'string' || typeof valueString === 'number'
    ? String(valueString).replace(',', '.')
    : '';
  return withVersion({
    ...state,
    estate: { ...state.estate, value: normalized }
  });
}

export function setHeirCount(state, role, intCount) {
  const safe = Number.isInteger(intCount) && intCount >= 0 ? intCount : 0;
  return withVersion({
    ...state,
    heirsCounts: { ...state.heirsCounts, [role]: safe }
  });
}

export function setLastPayload(state, objOrNull) {
  return withVersion({ ...state, lastPayload: objOrNull });
}

export function setLastResponse(state, objOrNull) {
  return withVersion({ ...state, lastResponse: objOrNull });
}

export function setLastError(state, msgString) {
  return withVersion({ ...state, lastError: msgString });
}
