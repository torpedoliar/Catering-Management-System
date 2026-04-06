import { createContext, useContext, useState, useEffect, ReactNode, useCallback } from 'react';
import axios from 'axios';
import { Preferences } from '@capacitor/preferences';

const API_URL = import.meta.env.VITE_API_URL || '';

// Create axios instance with interceptor
const api = axios.create({
    baseURL: API_URL,
});

// Token in-memory untuk axios interceptor agar tetap berjalan secara synchronous
let memoryToken: string | null = null;

// Add request interceptor to attach token
api.interceptors.request.use(
    (config) => {
        if (memoryToken) {
            config.headers.Authorization = `Bearer ${memoryToken}`;
        }
        return config;
    },
    (error) => {
        return Promise.reject(error);
    }
);

let isRefreshing = false;
let failedQueue: Array<{ resolve: Function; reject: Function }> = [];

const processQueue = (error: any, token: string | null) => {
    failedQueue.forEach(({ resolve, reject }) => {
        error ? reject(error) : resolve(token);
    });
    failedQueue = [];
};

api.interceptors.response.use(
    (response) => response,
    async (error) => {
        const originalRequest = error.config;

        if (error.response?.status === 401
            && !originalRequest._retry
            && !originalRequest.url?.includes('/auth/refresh')
            && !originalRequest.url?.includes('/auth/login')) {

            if (isRefreshing) {
                return new Promise((resolve, reject) => {
                    failedQueue.push({ resolve, reject });
                }).then(token => {
                    originalRequest.headers.Authorization = `Bearer ${token}`;
                    return api(originalRequest);
                });
            }

            originalRequest._retry = true;
            isRefreshing = true;

            try {
                const { value: storedRefreshToken } = await Preferences.get({ key: 'refreshToken' });

                if (!storedRefreshToken) throw new Error('No refresh token');

                const res = await api.post('/api/auth/refresh', {
                    refreshToken: storedRefreshToken
                });

                const newAccessToken = res.data.token;
                await Preferences.set({ key: 'token', value: newAccessToken });
                memoryToken = newAccessToken;

                processQueue(null, newAccessToken);

                originalRequest.headers.Authorization = `Bearer ${newAccessToken}`;
                return api(originalRequest);
            } catch (refreshError) {
                processQueue(refreshError, null);
                
                await Preferences.remove({ key: 'token' });
                await Preferences.remove({ key: 'refreshToken' });
                memoryToken = null;
                window.dispatchEvent(new Event('force-logout'));
                
                return Promise.reject(refreshError);
            } finally {
                isRefreshing = false;
            }
        }
        return Promise.reject(error);
    }
);

// Export for use in other components
export { api };

interface User {
    id: string;
    externalId: string;
    name: string;
    email: string | null;
    company: string;
    division: string;
    department: string;
    role: 'USER' | 'ADMIN' | 'CANTEEN' | 'VENDOR';
    noShowCount: number;
    mustChangePassword?: boolean;
    isBlacklisted?: boolean;
    blacklistEndDate?: string;
    preferredCanteenId?: string;
}

interface AuthContextType {
    user: User | null;
    token: string | null;
    isLoading: boolean;
    login: (externalId: string, password: string) => Promise<void>;
    logout: () => Promise<void>;
    refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
    const [user, setUser] = useState<User | null>(null);
    const [token, setToken] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(true);

    // Load user on mount (only once, not on token change)
    useEffect(() => {
        let isMounted = true;

        const loadUser = async () => {
            const { value: storedToken } = await Preferences.get({ key: 'token' });
            if (storedToken) {
                memoryToken = storedToken;
                if (isMounted) {
                    setToken(storedToken);
                }
                try {
                    const res = await api.get('/api/auth/me');
                    if (isMounted) {
                        setUser(res.data);
                    }
                } catch (error) {
                    console.error('Failed to load user:', error);
                    await Preferences.remove({ key: 'token' });
                    await Preferences.remove({ key: 'refreshToken' });
                    memoryToken = null;
                    if (isMounted) {
                        setToken(null);
                        setUser(null);
                    }
                }
            }
            if (isMounted) {
                setIsLoading(false);
            }
        };

        loadUser();

        const handleForceLogout = () => {
            setToken(null);
            setUser(null);
            sessionStorage.removeItem('announcementsShown');
            sessionStorage.removeItem('dismissedAnnouncements');
        };
        window.addEventListener('force-logout', handleForceLogout);

        return () => {
            isMounted = false;
            window.removeEventListener('force-logout', handleForceLogout);
        };
    }, []); // Empty dependency - only run once on mount

    const login = useCallback(async (externalId: string, password: string) => {
        const res = await api.post('/api/auth/login', { externalId, password });
        const { token: newToken, refreshToken: newRefreshToken, user: userData } = res.data;

        await Preferences.set({ key: 'token', value: newToken });
        if (newRefreshToken) {
            await Preferences.set({ key: 'refreshToken', value: newRefreshToken });
        }
        memoryToken = newToken;
        setToken(newToken);
        setUser(userData);
    }, []);

    const logout = useCallback(async () => {
        try {
            await api.post('/api/auth/logout');
        } catch (error) {
            console.error('Logout API error:', error);
        } finally {
            await Preferences.remove({ key: 'token' });
            await Preferences.remove({ key: 'refreshToken' });
            memoryToken = null;
            // Clear announcement session tracking so popups show on next login
            sessionStorage.removeItem('announcementsShown');
            sessionStorage.removeItem('dismissedAnnouncements');
            setToken(null);
            setUser(null);
        }
    }, []);

    const refreshUser = useCallback(async () => {
        const { value: storedToken } = await Preferences.get({ key: 'token' });
        if (storedToken) {
            try {
                memoryToken = storedToken;
                const res = await api.get('/api/auth/me');
                setUser(res.data);
            } catch (error) {
                console.error('Failed to refresh user:', error);
            }
        }
    }, []);

    return (
        <AuthContext.Provider value={{ user, token, isLoading, login, logout, refreshUser }}>
            {children}
        </AuthContext.Provider>
    );
}

export function useAuth() {
    const context = useContext(AuthContext);
    if (context === undefined) {
        throw new Error('useAuth must be used within an AuthProvider');
    }
    return context;
}
