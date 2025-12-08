import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { SSEProvider } from './contexts/SSEContext';

// Pages
import LoginPage from './pages/LoginPage';
import OrderPage from './pages/OrderPage';
import HistoryPage from './pages/HistoryPage';
import SettingsPage from './pages/SettingsPage';
import DashboardPage from './pages/admin/DashboardPage';
import ShiftConfigPage from './pages/admin/ShiftConfigPage';
import UserManagementPage from './pages/admin/UserManagementPage';
import CompanyManagementPage from './pages/admin/CompanyManagementPage';
import BlacklistPage from './pages/admin/BlacklistPage';
import ExportPage from './pages/admin/ExportPage';
import CalendarPage from './pages/admin/CalendarPage';
import TimeSettingsPage from './pages/admin/TimeSettingsPage';
import AuditLogPage from './pages/admin/AuditLogPage';
import CheckInPage from './pages/canteen/CheckInPage';
import AboutPage from './pages/AboutPage';

// Layout
import Layout from './components/Layout/Layout';
import ForcePasswordChange from './components/ForcePasswordChange';

// Protected Route Component
const ProtectedRoute = ({ children, roles }: { children: React.ReactNode; roles?: string[] }) => {
    const { user, isLoading, refreshUser } = useAuth();

    if (isLoading) {
        return (
            <div className="min-h-screen flex items-center justify-center">
                <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-cyan-500"></div>
            </div>
        );
    }

    if (!user) {
        return <Navigate to="/login" replace />;
    }

    // Force password change for first-login users
    if (user.mustChangePassword) {
        return <ForcePasswordChange onPasswordChanged={refreshUser} />;
    }

    if (roles && !roles.includes(user.role)) {
        return <Navigate to="/" replace />;
    }

    return <>{children}</>;
};

function AppRoutes() {
    const { user } = useAuth();

    return (
        <Routes>
            <Route path="/login" element={<LoginPage />} />

            {/* User Routes */}
            <Route path="/" element={
                <ProtectedRoute>
                    <Layout>
                        <OrderPage />
                    </Layout>
                </ProtectedRoute>
            } />

            <Route path="/history" element={
                <ProtectedRoute>
                    <Layout>
                        <HistoryPage />
                    </Layout>
                </ProtectedRoute>
            } />

            <Route path="/settings" element={
                <ProtectedRoute>
                    <Layout>
                        <SettingsPage />
                    </Layout>
                </ProtectedRoute>
            } />

            <Route path="/about" element={
                <ProtectedRoute>
                    <Layout>
                        <AboutPage />
                    </Layout>
                </ProtectedRoute>
            } />

            {/* Admin Routes */}
            <Route path="/admin/dashboard" element={
                <ProtectedRoute roles={['ADMIN']}>
                    <Layout>
                        <DashboardPage />
                    </Layout>
                </ProtectedRoute>
            } />

            <Route path="/admin/shifts" element={
                <ProtectedRoute roles={['ADMIN']}>
                    <Layout>
                        <ShiftConfigPage />
                    </Layout>
                </ProtectedRoute>
            } />

            <Route path="/admin/users" element={
                <ProtectedRoute roles={['ADMIN']}>
                    <Layout>
                        <UserManagementPage />
                    </Layout>
                </ProtectedRoute>
            } />

            <Route path="/admin/companies" element={
                <ProtectedRoute roles={['ADMIN']}>
                    <Layout>
                        <CompanyManagementPage />
                    </Layout>
                </ProtectedRoute>
            } />

            <Route path="/admin/blacklist" element={
                <ProtectedRoute roles={['ADMIN']}>
                    <Layout>
                        <BlacklistPage />
                    </Layout>
                </ProtectedRoute>
            } />

            <Route path="/admin/export" element={
                <ProtectedRoute roles={['ADMIN']}>
                    <Layout>
                        <ExportPage />
                    </Layout>
                </ProtectedRoute>
            } />

            <Route path="/admin/calendar" element={
                <ProtectedRoute roles={['ADMIN']}>
                    <Layout>
                        <CalendarPage />
                    </Layout>
                </ProtectedRoute>
            } />

            <Route path="/admin/time-settings" element={
                <ProtectedRoute roles={['ADMIN']}>
                    <Layout>
                        <TimeSettingsPage />
                    </Layout>
                </ProtectedRoute>
            } />

            <Route path="/admin/audit-log" element={
                <ProtectedRoute roles={['ADMIN']}>
                    <Layout>
                        <AuditLogPage />
                    </Layout>
                </ProtectedRoute>
            } />

            {/* Canteen Routes */}
            <Route path="/canteen/checkin" element={
                <ProtectedRoute roles={['CANTEEN', 'ADMIN']}>
                    <Layout>
                        <CheckInPage />
                    </Layout>
                </ProtectedRoute>
            } />

            {/* Fallback */}
            <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
    );
}

export default function App() {
    return (
        <BrowserRouter>
            <AuthProvider>
                <SSEProvider>
                    <AppRoutes />
                    <Toaster
                        position="top-right"
                        toastOptions={{
                            duration: 4000,
                            style: {
                                background: '#1e293b',
                                color: '#f1f5f9',
                                border: '1px solid rgba(100, 116, 139, 0.3)',
                            },
                            success: {
                                iconTheme: {
                                    primary: '#22c55e',
                                    secondary: '#f1f5f9',
                                },
                            },
                            error: {
                                iconTheme: {
                                    primary: '#ef4444',
                                    secondary: '#f1f5f9',
                                },
                            },
                        }}
                    />
                </SSEProvider>
            </AuthProvider>
        </BrowserRouter>
    );
}
