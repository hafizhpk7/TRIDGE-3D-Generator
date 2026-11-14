import { Route, Routes } from 'react-router-dom';
import { Workspace } from './Workspace';
import { Playground } from '../playground/Playground';

export function App() {
  return (
    <Routes>
      <Route path="/" element={<Workspace />} />
      <Route path="/playground" element={<Playground />} />
      <Route path="*" element={<Workspace />} />
    </Routes>
  );
}
