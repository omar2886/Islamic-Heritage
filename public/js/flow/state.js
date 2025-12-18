const VERSION = 1;

const defaultHeir = () => ({ id: '', name: '', sex: 'M', role: '', alive: true, count: 1 });

function createInitialState() {
  return {
    version: VERSION,
    step: 'decedent',
    deceased: { name: '', sex: 'M', madhhab: '', notes: '' },
    heirs: [],
    lastResult: null,
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

function setLastResult(state, payload) {
  return withVersion({
    ...state,
    lastResult: payload,
  });
}

function setLastPayload(state, payload) {
  return withVersion({
    ...state,
    lastPayload: payload,
  });
}

function addHeir(state, heir) {
  const base = defaultHeir();
  const id = heir.id || (typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `heir-${Date.now()}-${Math.random().toString(16).slice(2)}`);
  const cleanHeir = { ...base, ...heir, id };
  return withVersion({
    ...state,
    heirs: [...state.heirs, cleanHeir],
  });
}

function updateHeir(state, heirId, payload) {
  return withVersion({
    ...state,
    heirs: state.heirs.map((item) => (item.id === heirId ? { ...item, ...payload } : item)),
  });
}

function removeHeir(state, heirId) {
  return withVersion({
    ...state,
    heirs: state.heirs.filter((item) => item.id !== heirId),
  });
}

export {
  VERSION,
  createInitialState,
  setDeceased,
  setStep,
  setLastResult,
  setLastPayload,
  addHeir,
  updateHeir,
  removeHeir,
  defaultHeir,
};
