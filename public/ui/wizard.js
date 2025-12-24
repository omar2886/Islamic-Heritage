export function initWizard() {
  const genderRadios = document.querySelectorAll('input[name="gender"]');
  const husbandField = document.getElementById('husband-field');
  const wivesField = document.getElementById('wives-field');
  genderRadios.forEach(radio => {
    radio.addEventListener('change', () => {
      if (radio.checked && radio.value === 'F') {
        husbandField.style.display = 'block';
        wivesField.style.display = 'none';
      } else if (radio.checked && radio.value === 'M') {
        husbandField.style.display = 'none';
        wivesField.style.display = 'block';
      }
    });
  });
}

export function getWizardData() {
  const gender = document.querySelector('input[name="gender"]:checked').value;
  const fatherAlive = document.querySelector('input[name="fatherAlive"]').checked ? 1 : 0;
  const motherAlive = document.querySelector('input[name="motherAlive"]').checked ? 1 : 0;
  let husbandsCount = 0, wivesCount = 0;
  if (gender === 'F') {
    husbandsCount = document.querySelector('input[name="husbandAlive"]').checked ? 1 : 0;
    wivesCount = 0;
  } else {
    wivesCount = parseInt(document.querySelector('input[name="wivesCount"]').value) || 0;
    if (wivesCount > 4) wivesCount = 4;
    husbandsCount = 0;
  }
  const sonsCount = parseInt(document.querySelector('input[name="sonsCount"]').value) || 0;
  const daughtersCount = parseInt(document.querySelector('input[name="daughtersCount"]').value) || 0;
  const grandsonsCount = parseInt(document.querySelector('input[name="grandsonsCount"]').value) || 0;
  const granddaughtersCount = parseInt(document.querySelector('input[name="granddaughtersCount"]').value) || 0;
  return {
    gender,
    fatherAlive,
    motherAlive,
    husbandsCount,
    wivesCount,
    sonsCount,
    daughtersCount,
    grandsonsCount,
    granddaughtersCount
  };
}
