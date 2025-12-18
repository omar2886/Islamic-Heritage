export async function mount() {
  const root = document.getElementById('builder3-root');
  if (!root) {
    throw new Error('No se encontró el contenedor builder3-root');
  }

  root.replaceChildren();

  const heading = document.createElement('h2');
  heading.textContent = 'V3 skeleton OK';
  const paragraph = document.createElement('p');
  paragraph.textContent = 'V3 skeleton OK';

  root.append(heading, paragraph);
  return root;
}
