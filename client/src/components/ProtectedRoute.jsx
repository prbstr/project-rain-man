import { Navigate } from 'react-router-dom';

export function ProtectedRoute({ isAuthenticated, isLoading, children }) {
  if (isLoading) {
    return <div style={{ padding: '20px', textAlign: 'center' }}>Loading...</div>;
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  return children;
}
