import { Link, Navigate, Route, Routes } from 'react-router-dom';
import { Admin } from './pages/Admin';
import { Caisse } from './pages/Caisse';

export function App() {
  return (
    <Routes>
      <Route path="/caisse/*" element={<Caisse />} />
      <Route path="/admin/*" element={<Admin />} />
      <Route path="/" element={<Navigate to="/caisse" replace />} />
      <Route
        path="*"
        element={
          <div className="p-6">
            Page introuvable.{' '}
            <Link className="underline" to="/caisse">
              Retour à la caisse
            </Link>
          </div>
        }
      />
    </Routes>
  );
}
