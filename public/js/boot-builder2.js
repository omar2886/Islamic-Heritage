import { mountBuilder2 } from './ui/builder2.js';

async function init() {
  await mountBuilder2();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => { void init(); }, { once: true });
} else {
  void init();
}
