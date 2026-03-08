import { Routes, Route, Navigate, Outlet } from 'react-router-dom';
import type { ReactNode } from 'react';
import { useAuth } from '@web/lib/AuthContext';
import { BatchCaptureProvider } from '@web/lib/BatchCaptureContext';
import HomePage from './pages/HomePage';
import SearchPage from './pages/SearchPage';
import PlotDetailPage from './pages/PlotDetailPage';
import CemeteryProfilePage from './pages/CemeteryProfilePage';
import CapturePage from './pages/CapturePage';
import LoginPage from './pages/LoginPage';
import PinDropPage from './pages/PinDropPage';
import CsvImportPage from './pages/CsvImportPage';
import RegisterPage from './pages/RegisterPage';
import WayfindingPage from './pages/WayfindingPage';
import OcrReviewPage from './pages/OcrReviewPage';
import BatchReviewPage from './pages/BatchReviewPage';
import DirectoryPage from './pages/DirectoryPage';
import ContributePage from './pages/ContributePage';
import AdminSubmissionsPage from './pages/AdminSubmissionsPage';

function RequireAuth({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen bg-stone-50 flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-emerald-200 border-t-emerald-600 rounded-full animate-spin" />
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  return <>{children}</>;
}

function BatchCaptureLayout() {
  return (
    <BatchCaptureProvider>
      <Outlet />
    </BatchCaptureProvider>
  );
}

function AuthBatchCaptureLayout() {
  return (
    <RequireAuth>
      <BatchCaptureLayout />
    </RequireAuth>
  );
}

export function App() {
  return (
    <Routes>
      <Route path="/" element={<HomePage />} />
      <Route path="/search" element={<SearchPage />} />
      <Route path="/directory" element={<DirectoryPage />} />
      <Route path="/login" element={<LoginPage />} />
      <Route path="/register" element={<RegisterPage />} />
      <Route path="/contribute" element={<ContributePage />} />
      <Route
        path="/admin/submissions"
        element={
          <RequireAuth>
            <AdminSubmissionsPage />
          </RequireAuth>
        }
      />
      <Route
        path="/pin"
        element={
          <RequireAuth>
            <PinDropPage />
          </RequireAuth>
        }
      />
      <Route
        path="/dashboard/import"
        element={
          <RequireAuth>
            <CsvImportPage />
          </RequireAuth>
        }
      />
      {/* Capture routes with shared BatchCaptureProvider */}
      <Route path="/capture" element={<AuthBatchCaptureLayout />}>
        <Route index element={<CapturePage />} />
        <Route path="batch-review" element={<BatchReviewPage />} />
      </Route>
      <Route path="/:cemeterySlug" element={<CemeteryProfilePage />} />
      <Route path="/:cemeterySlug/plot/:plotId" element={<PlotDetailPage />} />
      <Route path="/:cemeterySlug/plot/:plotId/navigate" element={<WayfindingPage />} />
      <Route path="/:cemeterySlug/capture" element={<AuthBatchCaptureLayout />}>
        <Route index element={<CapturePage />} />
        <Route path="batch-review" element={<BatchReviewPage />} />
        <Route path="review" element={<OcrReviewPage />} />
      </Route>
    </Routes>
  );
}
