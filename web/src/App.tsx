import { useEffect, useState } from 'react';
import { Capture } from './pages/Capture';
import { Home } from './pages/Home';
import { ModelPage } from './pages/Model';
import { Review } from './pages/Review';
import { VocabularyPage } from './pages/Vocabulary';
import { NotebookProvider } from './notebook';
import { parseHash, type Route } from './route';

export function App() {
  const [route, setRoute] = useState<Route>(() => parseHash(window.location.hash));
  useEffect(() => {
    const onHash = () => setRoute(parseHash(window.location.hash));
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  let page = <Home />;
  if (route.name === 'capture') page = <Capture id={route.id} />;
  if (route.name === 'review') page = <Review id={route.id} />;
  if (route.name === 'vocabulary') page = <VocabularyPage />;
  if (route.name === 'model') page = <ModelPage />;

  return (
    <NotebookProvider>
      {page}
    </NotebookProvider>
  );
}
