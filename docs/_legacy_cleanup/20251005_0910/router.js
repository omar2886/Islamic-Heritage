export async function mount(page){
  switch(page){
    case 'builder': return (await import('./ui/builder.js')).mount();
    case 'results': return (await import('./ui/results.js')).mount();
    default: /* home */ return;
  }
}
