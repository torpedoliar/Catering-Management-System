import { BrowserRouter, Routes, Route, Navigate, Outlet } from 'react-router-dom';
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
import MessagesPage from './pages/admin/MessagesPage';
import CostAnalysisPage from './pages/admin/CostAnalysisPage';
import AnnouncementPage from './pages/admin/AnnouncementPage';
import EmailSettingsPage from './pages/admin/EmailSettingsPage';
import OrderListPage from './pages/admin/OrderListPage';
import CheckInPage from './pages/canteen/CheckInPage';
import AboutPage from './pages/AboutPage';

// Layout
import Layout from './components/Layout/Layout';
import ForcePasswordChange from './components/ForcePasswordChange';
import AnnouncementPopup from './components/AnnouncementPopup';

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
    return (
        <Routes>
            <Route path="/login" element={<LoginPage />} />

            {/* Persistent Layout for all authenticated routes */}
            <Route element={
                <Layout>
                    <Outlet />
                </Layout>
            }>
                {/* User Routes */}
                <Route element={<ProtectedRoute><Outlet /></ProtectedRoute>}>
                    <Route path="/" element={<OrderPage />} />
                    <Route path="/history" element={<HistoryPage />} />
                    <Route path="/settings" element={<SettingsPage />} />
                    <Route path="/about" element={<AboutPage />} />
                </Route>

                {/* Admin Routes */}
                <Route element={<ProtectedRoute roles={['ADMIN']}><Outlet /></ProtectedRoute>}>
                    <Route path="/admin/dashboard" element={<DashboardPage />} />
                    <Route path="/admin/orders" element={<OrderListPage />} />
                    <Route path="/admin/shifts" element={<ShiftConfigPage />} />
                    <Route path="/admin/users" element={<UserManagementPage />} />
                    <Route path="/admin/companies" element={<CompanyManagementPage />} />
                    <Route path="/admin/blacklist" element={<BlacklistPage />} />
                    <Route path="/admin/export" element={<ExportPage />} />
                    <Route path="/admin/costs" element={<CostAnalysisPage />} />
                    <Route path="/admin/announcements" element={<AnnouncementPage />} />
                    <Route path="/admin/calendar" element={<CalendarPage />} />
                    <Route path="/admin/time-settings" element={<TimeSettingsPage />} />
                    <Route path="/admin/audit-log" element={<AuditLogPage />} />
                    <Route path="/admin/messages" element={<MessagesPage />} />
                    <Route path="/admin/email-settings" element={<EmailSettingsPage />} />
                </Route>

                {/* Canteen Routes */}
                <Route element={<ProtectedRoute roles={['CANTEEN', 'ADMIN']}><Outlet /></ProtectedRoute>}>
                    <Route path="/canteen/checkin" element={<CheckInPage />} />
                </Route>
            </Route>

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
                    <AnnouncementPopup />
                </SSEProvider>
            </AuthProvider>
        </BrowserRouter>
    );
}
