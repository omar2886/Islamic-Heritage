import * as builder from './builder.js';

export function calculateAndShow() {
  const resultsDiv = document.getElementById('results-content');
  const payload = builder.getRolesPayload();
  resultsDiv.textContent = 'Calculando...';
  fetch('./app/calc.php', {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify(payload)
  })
    .then(response => response.json())
    .then(data => {
      resultsDiv.innerHTML = '';
      if (!data || data.error) {
        resultsDiv.textContent = data && data.error
          ? ('Error: ' + data.error)
          : 'Error en cálculo. Verifique los datos.';
      } else {
        resultsDiv.textContent = JSON.stringify(data, null, 2);
      }
      console.log("[Calc] Cálculo ejecutado:", data);
    })
    .catch(err => {
      resultsDiv.innerHTML = '';
      resultsDiv.textContent = 'Error de red o de servidor durante el cálculo.';
      console.error("Calc error:", err);
    });
}
