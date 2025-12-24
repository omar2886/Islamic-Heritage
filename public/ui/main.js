import * as wizard from './wizard.js';
import * as builder from './builder.js';
import * as results from './results.js';

const wizardSection = document.getElementById('wizard');
const builderSection = document.getElementById('builder');
const resultsSection = document.getElementById('results');

const continueBtn = document.getElementById('continue-to-builder');
const calcBtn = document.getElementById('calculate-btn');
const backBtn = document.getElementById('back-to-builder');

wizard.initWizard();

function normalizeRouteHash() {
  let h = window.location.hash || '';
  // "#/wizard" o "#wizard"
  h = h.startsWith('#') ? h.slice(1) : h;
  h = h.startsWith('/') ? h.slice(1) : h;

  // Por si viene "#/builder?x=y" o "#builder?x=y"
  const q = h.indexOf('?');
  if (q !== -1) h = h.slice(0, q);

  // Limpieza básica
  h = (h || '').trim().toLowerCase();

  if (h === '') return 'wizard';
  if (h === 'wizard' || h === 'builder' || h === 'results') return h;

  // Fallback seguro: no pantalla vacía
  console.warn('[router] Unknown route hash:', window.location.hash, ' -> fallback wizard');
  return 'wizard';
}

function showSection(sectionId) {
  wizardSection.style.display = 'none';
  builderSection.style.display = 'none';
  resultsSection.style.display = 'none';

  if (sectionId === 'wizard') wizardSection.style.display = 'block';
  if (sectionId === 'builder') builderSection.style.display = 'block';
  if (sectionId === 'results') resultsSection.style.display = 'block';
}

function handleRoute() {
  const route = normalizeRouteHash();

  if (route === 'builder') {
    if (!builder.hasTree()) builder.createEmptyTree();
    builder.renderTree();
  }

  if (route === 'results') {
    const resContent = document.getElementById('results-content');
    if (!resContent.textContent.trim()) resContent.textContent = 'No hay resultados para mostrar.';
  }

  showSection(route);
  window.scrollTo(0, 0);
}

window.addEventListener('hashchange', handleRoute);
handleRoute();

continueBtn.addEventListener('click', () => {
  const data = wizard.getWizardData();
  builder.generateTreeFromWizard(data);
  window.location.hash = '#/builder';
});

calcBtn.addEventListener('click', () => {
  if (!builder.hasTree()) {
    alert('No hay datos del árbol para calcular.');
    return;
  }
  results.calculateAndShow();
  window.location.hash = '#/results';
});

backBtn.addEventListener('click', () => {
  window.location.hash = '#/builder';
});
