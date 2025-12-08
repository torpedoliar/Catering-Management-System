import { createContext, useContext, useState, useEffect, ReactNode, useCallback } from 'react';
import axios from 'axios';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3012';

// Create axios instance with interceptor
const api = axios.create({
    baseURL: API_URL,
});

// Add request interceptor to attach token
api.interceptors.request.use(
    (config) => {
        const token = localStorage.getItem('token');
        if (token) {
            config.headers.Authorization = `Bearer ${token}`;
        }
        return config;
    },
    (error) => {
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
    role: 'USER' | 'ADMIN' | 'CANTEEN';
    noShowCount: number;
    mustChangePassword?: boolean;
    isBlacklisted?: boolean;
    blacklistEndDate?: string;
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
    const [token, setToken] = useState<string | null>(() => localStorage.getItem('token'));
    const [isLoading, setIsLoading] = useState(true);

    // Load user on mount (only once, not on token change)
    useEffect(() => {
        let isMounted = true;

        const loadUser = async () => {
            const storedToken = localStorage.getItem('token');
            if (storedToken) {
                try {
                    const res = await api.get('/api/auth/me');
                    if (isMounted) {
                        setUser(res.data);
                    }
                } catch (error) {
                    console.error('Failed to load user:', error);
                    localStorage.removeItem('token');
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

        return () => {
            isMounted = false;
        };
    }, []); // Empty dependency - only run once on mount

    const login = useCallback(async (externalId: string, password: string) => {
        const res = await api.post('/api/auth/login', { externalId, password });
        const { token: newToken, user: userData } = res.data;

        localStorage.setItem('token', newToken);
        setToken(newToken);
        setUser(userData);
    }, []);

    const logout = useCallback(async () => {
        try {
            await api.post('/api/auth/logout');
        } catch (error) {
            console.error('Logout API error:', error);
        } finally {
            localStorage.removeItem('token');
            setToken(null);
            setUser(null);
        }
    }, []);

    const refreshUser = useCallback(async () => {
        const storedToken = localStorage.getItem('token');
        if (storedToken) {
            try {
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
