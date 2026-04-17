import { BrowserRouter, Routes, Route } from 'react-router-dom';
import Layout from './components/layout/Layout';
import Dashboard from './pages/Dashboard';
import CRM from './pages/CRM';
import Transactions from './pages/Transactions';
import Employees from './pages/Employees';
import Projects from './pages/Projects';
import Credentials from './pages/Credentials';

export default function App() {
  return (
    <BrowserRouter>
      <Layout>
        <Routes>
          <Route path="/"             element={<Dashboard />} />
          <Route path="/crm"          element={<CRM />} />
          <Route path="/transactions" element={<Transactions />} />
          <Route path="/employees"    element={<Employees />} />
          <Route path="/projects"     element={<Projects />} />
          <Route path="/credentials"  element={<Credentials />} />
        </Routes>
      </Layout>
    </BrowserRouter>
  );
}
