import { lazy } from 'react';
import { Route, Routes } from 'react-router-dom';
import { Workspace } from './Workspace';
import { Lazy } from './ErrorBoundary';

const Playground = lazy(() =>
  import('../playground/Playground').then((m) => ({ default: m.Playground })),
);

export function App() {
  return (
    <Routes>
      <Route path="/" element={<Workspace />} />
      <Route
        path="/playground"
        element={
          <Lazy label="The playground">
            <Playground />
          </Lazy>
        }
      />
      <Route path="*" element={<Workspace />} />
    </Routes>
  );
}
