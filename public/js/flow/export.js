function sanitizeFilename(name) {
  const fallback = 'heritage_export';
  if (!name || typeof name !== 'string') return fallback;
  return name.replace(/[\\/:*?"<>|]+/g, '_').replace(/\s+/g, ' ').trim() || fallback;
}

function exportJson(filename, data) {
  const safeName = sanitizeFilename(filename || 'heritage_export');
  const finalName = safeName.toLowerCase().endsWith('.json') ? safeName : `${safeName}.json`;
  try {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = finalName;
    link.click();
    URL.revokeObjectURL(url);
  } catch (error) {
    console.error('No se pudo exportar el JSON', error);
  }
}

export { exportJson, sanitizeFilename };
