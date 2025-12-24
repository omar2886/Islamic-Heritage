import * as wizard from './wizard.js';
import * as builder from './builder.js';
import * as results from './results.js';

// Referencias a secciones y botones
const wizardSection = document.getElementById('wizard');
const builderSection = document.getElementById('builder');
const resultsSection = document.getElementById('results');
const continueBtn = document.getElementById('continue-to-builder');
const calcBtn = document.getElementById('calculate-btn');
const backBtn = document.getElementById('back-to-builder');

// Inicializar wizard (eventos de formulario)
wizard.initWizard();

// Función para mostrar secciones según el hash
function showSection(sectionId) {
  wizardSection.style.display = 'none';
  builderSection.style.display = 'none';
  resultsSection.style.display = 'none';
  if (sectionId === 'wizard') wizardSection.style.display = 'block';
  if (sectionId === 'builder') builderSection.style.display = 'block';
  if (sectionId === 'results') resultsSection.style.display = 'block';
}

function handleRoute() {
  let hash = window.location.hash.replace('#', '');
  if (!hash) {
    hash = 'wizard';
  }
  if (hash === 'builder') {
    // Si no hay un árbol existente, crear uno vacío
    if (!builder.hasTree()) {
      builder.createEmptyTree();
    }
    // Renderizar vista de builder
    builder.renderTree();
  }
  if (hash === 'results') {
    // Si no hay resultados calculados aún, mostrar mensaje por defecto
    const resContent = document.getElementById('results-content');
    if (!resContent.textContent.trim()) {
      resContent.textContent = 'No hay resultados para mostrar.';
    }
  }
  showSection(hash);
  window.scrollTo(0, 0);
}

// Enrutar cuando cambia el hash
window.addEventListener('hashchange', handleRoute);
// Enrutamiento inicial
handleRoute();

// Continuar al builder desde wizard
continueBtn.addEventListener('click', () => {
  const data = wizard.getWizardData();
  builder.generateTreeFromWizard(data);
  window.location.hash = 'builder';
});

// Ejecutar cálculo desde builder
calcBtn.addEventListener('click', () => {
  if (!builder.hasTree()) {
    alert('No hay datos del árbol para calcular.');
    return;
  }
  results.calculateAndShow();
  window.location.hash = 'results';
});

// Volver al builder desde resultados
backBtn.addEventListener('click', () => {
  window.location.hash = 'builder';
});
