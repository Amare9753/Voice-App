export type Route =
  | { name: 'home' }
  | { name: 'capture'; id: string }
  | { name: 'review'; id: string }
  | { name: 'vocabulary' }
  | { name: 'model' };

export function parseHash(hash: string): Route {
  const parts = hash.replace(/^#\/?/, '').split('/').filter(Boolean);
  const [name, id] = parts;
  if ((name === 'capture' || name === 'review') && id) return { name, id: decodeURIComponent(id) };
  if (name === 'vocabulary' || name === 'model') return { name };
  return { name: 'home' };
}

export function go(route: Route): void {
  const hash = route.name === 'home'
    ? '#/'
    : route.name === 'capture' || route.name === 'review'
      ? `#/${route.name}/${encodeURIComponent(route.id)}`
      : `#/${route.name}`;
  if (location.hash === hash) {
    window.dispatchEvent(new HashChangeEvent('hashchange'));
    return;
  }
  location.hash = hash;
}
