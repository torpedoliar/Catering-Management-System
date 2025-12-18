import { useState, useEffect, useCallback } from 'react';
import { api } from '../../contexts/AuthContext';
import { format } from 'date-fns';
import { useSSERefresh, USER_EVENTS } from '../../contexts/SSEContext';
import { Ban, Unlock, Loader2, ChevronLeft, ChevronRight, UserPlus, X, AlertTriangle, Eye, EyeOff } from 'lucide-react';
import toast from 'react-hot-toast';

interface Blacklist {
    id: string;
    reason: string;
    startDate: string;
    endDate: string | null;
    isActive: boolean;
    user: {
        id: string;
        externalId: string;
        name: string;
        company: string;
        division: string;
        department: string;
        noShowCount: number;
    };
}

interface User {
    id: string;
    externalId: string;
    name: string;
    company: string;
    department: string;
}

interface ConfirmModalProps {
    isOpen: boolean;
    onClose: () => void;
    onConfirm: (password: string, reason: string) => Promise<void>;
    title: string;
    description: string;
    actionLabel: string;
    actionColor: 'red' | 'green';
    targetUser: string;
    requireReason?: boolean;
    reasonPlaceholder?: string;
}

function ConfirmModal({
    isOpen,
    onClose,
    onConfirm,
    title,
    description,
    actionLabel,
    actionColor,
    targetUser,
    requireReason = true,
    reasonPlaceholder = 'Masukkan alasan (minimal 10 karakter)...',
}: ConfirmModalProps) {
    const [password, setPassword] = useState('');
    const [reason, setReason] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [error, setError] = useState('');

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');

        if (!password) {
            setError('Password admin harus diisi');
            return;
        }

        if (requireReason && reason.trim().length < 10) {
            setError('Alasan harus minimal 10 karakter');
            return;
        }

        setIsSubmitting(true);
        try {
            await onConfirm(password, reason.trim());
            setPassword('');
            setReason('');
            onClose();
        } catch (err: any) {
            setError(err.response?.data?.error || 'Terjadi kesalahan');
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleClose = () => {
        setPassword('');
        setReason('');
        setError('');
        onClose();
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
            <div className="bg-slate-800 rounded-xl border border-slate-700 max-w-md w-full shadow-2xl">
                <div className="px-6 py-4 border-b border-slate-700 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <div className={`p-2 rounded-lg ${actionColor === 'red' ? 'bg-red-500/20' : 'bg-green-500/20'}`}>
                            <AlertTriangle className={`w-5 h-5 ${actionColor === 'red' ? 'text-red-400' : 'text-green-400'}`} />
                        </div>
                        <h3 className="text-lg font-semibold text-slate-100">{title}</h3>
                    </div>
                    <button
                        onClick={handleClose}
                        className="p-2 hover:bg-slate-700 rounded-lg transition-colors"
                    >
                        <X className="w-5 h-5 text-slate-400" />
                    </button>
                </div>

                <form onSubmit={handleSubmit} className="p-6 space-y-4">
                    <div className="bg-slate-700/50 rounded-lg p-4">
                        <p className="text-slate-300">{description}</p>
                        <p className="text-white font-medium mt-2">{targetUser}</p>
                    </div>

                    {error && (
                        <div className="bg-red-500/20 border border-red-500/30 rounded-lg px-4 py-3">
                            <p className="text-red-400 text-sm">{error}</p>
                        </div>
                    )}

                    {requireReason && (
                        <div>
                            <label className="block text-sm font-medium text-slate-300 mb-2">
                                Alasan <span className="text-red-400">*</span>
                            </label>
                            <textarea
                                value={reason}
                                onChange={(e) => setReason(e.target.value)}
                                placeholder={reasonPlaceholder}
                                rows={3}
                                className="w-full px-4 py-2 bg-slate-700 border border-slate-600 rounded-lg text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-cyan-500 resize-none"
                            />
                            <p className="text-xs text-slate-400 mt-1">
                                {reason.length}/10 karakter minimum
                            </p>
                        </div>
                    )}

                    <div>
                        <label className="block text-sm font-medium text-slate-300 mb-2">
                            Konfirmasi Password Admin <span className="text-red-400">*</span>
                        </label>
                        <div className="relative">
                            <input
                                type={showPassword ? 'text' : 'password'}
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                placeholder="Masukkan password Anda..."
                                className="w-full px-4 py-2 pr-10 bg-slate-700 border border-slate-600 rounded-lg text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-cyan-500"
                            />
                            <button
                                type="button"
                                onClick={() => setShowPassword(!showPassword)}
                                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-300"
                            >
                                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                            </button>
                        </div>
                        <p className="text-xs text-slate-400 mt-1">
                            Masukkan password akun admin Anda untuk konfirmasi
                        </p>
                    </div>

                    <div className="flex gap-3 pt-2">
                        <button
                            type="button"
                            onClick={handleClose}
                            disabled={isSubmitting}
                            className="flex-1 px-4 py-2 bg-slate-700 hover:bg-slate-600 text-slate-300 rounded-lg transition-colors disabled:opacity-50"
                        >
                            Batal
                        </button>
                        <button
                            type="submit"
                            disabled={isSubmitting}
                            className={`flex-1 px-4 py-2 rounded-lg transition-colors disabled:opacity-50 flex items-center justify-center gap-2 ${actionColor === 'red'
                                    ? 'bg-red-600 hover:bg-red-700 text-white'
                                    : 'bg-green-600 hover:bg-green-700 text-white'
                                }`}
                        >
                            {isSubmitting ? (
                                <>
                                    <Loader2 className="w-4 h-4 animate-spin" />
                                    Memproses...
                                </>
                            ) : (
                                actionLabel
                            )}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}

interface BlacklistUserModalProps {
    isOpen: boolean;
    onClose: () => void;
    onConfirm: (userId: string, reason: string, durationDays: number | null, password: string) => Promise<void>;
}

function BlacklistUserModal({ isOpen, onClose, onConfirm }: BlacklistUserModalProps) {
    const [users, setUsers] = useState<User[]>([]);
    const [searchTerm, setSearchTerm] = useState('');
    const [selectedUser, setSelectedUser] = useState<User | null>(null);
    const [reason, setReason] = useState('');
    const [durationType, setDurationType] = useState<'permanent' | 'temporary'>('temporary');
    const [durationDays, setDurationDays] = useState(7);
    const [password, setPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [isSearching, setIsSearching] = useState(false);
    const [error, setError] = useState('');

    const searchUsers = async (term: string) => {
        if (term.length < 2) {
            setUsers([]);
            return;
        }

        setIsSearching(true);
        try {
            const res = await api.get(`/api/users?search=${encodeURIComponent(term)}&limit=10`);
            setUsers(res.data.users.filter((u: any) => u.role === 'USER'));
        } catch (error) {
            console.error('Search error:', error);
        } finally {
            setIsSearching(false);
        }
    };

    useEffect(() => {
        const timer = setTimeout(() => {
            searchUsers(searchTerm);
        }, 300);
        return () => clearTimeout(timer);
    }, [searchTerm]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');

        if (!selectedUser) {
            setError('Pilih user yang akan di-blacklist');
            return;
        }

        if (reason.trim().length < 10) {
            setError('Alasan harus minimal 10 karakter');
            return;
        }

        if (!password) {
            setError('Password admin harus diisi');
            return;
        }

        setIsSubmitting(true);
        try {
            await onConfirm(
                selectedUser.id,
                reason.trim(),
                durationType === 'permanent' ? null : durationDays,
                password
            );
            handleClose();
        } catch (err: any) {
            setError(err.response?.data?.error || 'Terjadi kesalahan');
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleClose = () => {
        setSelectedUser(null);
        setSearchTerm('');
        setUsers([]);
        setReason('');
        setDurationType('temporary');
        setDurationDays(7);
        setPassword('');
        setError('');
        onClose();
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
            <div className="bg-slate-800 rounded-xl border border-slate-700 max-w-lg w-full shadow-2xl max-h-[90vh] overflow-y-auto">
                <div className="px-6 py-4 border-b border-slate-700 flex items-center justify-between sticky top-0 bg-slate-800">
                    <div className="flex items-center gap-3">
                        <div className="p-2 rounded-lg bg-red-500/20">
                            <Ban className="w-5 h-5 text-red-400" />
                        </div>
                        <h3 className="text-lg font-semibold text-slate-100">Blacklist User</h3>
                    </div>
                    <button
                        onClick={handleClose}
                        className="p-2 hover:bg-slate-700 rounded-lg transition-colors"
                    >
                        <X className="w-5 h-5 text-slate-400" />
                    </button>
                </div>

                <form onSubmit={handleSubmit} className="p-6 space-y-4">
                    {error && (
                        <div className="bg-red-500/20 border border-red-500/30 rounded-lg px-4 py-3">
                            <p className="text-red-400 text-sm">{error}</p>
                        </div>
                    )}

                    {/* User Selection */}
                    <div>
                        <label className="block text-sm font-medium text-slate-300 mb-2">
                            Pilih User <span className="text-red-400">*</span>
                        </label>
                        {selectedUser ? (
                            <div className="bg-slate-700/50 rounded-lg p-3 flex items-center justify-between">
                                <div>
                                    <p className="text-white font-medium">{selectedUser.name}</p>
                                    <p className="text-sm text-slate-400">{selectedUser.externalId} - {selectedUser.department}</p>
                                </div>
                                <button
                                    type="button"
                                    onClick={() => setSelectedUser(null)}
                                    className="text-slate-400 hover:text-white"
                                >
                                    <X className="w-4 h-4" />
                                </button>
                            </div>
                        ) : (
                            <div className="space-y-2">
                                <div className="relative">
                                    <input
                                        type="text"
                                        value={searchTerm}
                                        onChange={(e) => setSearchTerm(e.target.value)}
                                        placeholder="Cari berdasarkan nama atau ID..."
                                        className="w-full px-4 py-2 bg-slate-700 border border-slate-600 rounded-lg text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-cyan-500"
                                    />
                                    {isSearching && (
                                        <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 animate-spin" />
                                    )}
                                </div>
                                {users.length > 0 && (
                                    <div className="bg-slate-700 rounded-lg border border-slate-600 max-h-40 overflow-y-auto">
                                        {users.map((user) => (
                                            <button
                                                key={user.id}
                                                type="button"
                                                onClick={() => {
                                                    setSelectedUser(user);
                                                    setSearchTerm('');
                                                    setUsers([]);
                                                }}
                                                className="w-full px-4 py-2 text-left hover:bg-slate-600 transition-colors"
                                            >
                                                <p className="text-white">{user.name}</p>
                                                <p className="text-sm text-slate-400">{user.externalId} - {user.department}</p>
                                            </button>
                                        ))}
                                    </div>
                                )}
                            </div>
                        )}
                    </div>

                    {/* Reason */}
                    <div>
                        <label className="block text-sm font-medium text-slate-300 mb-2">
                            Alasan Blacklist <span className="text-red-400">*</span>
                        </label>
                        <textarea
                            value={reason}
                            onChange={(e) => setReason(e.target.value)}
                            placeholder="Jelaskan alasan user di-blacklist (minimal 10 karakter)..."
                            rows={3}
                            className="w-full px-4 py-2 bg-slate-700 border border-slate-600 rounded-lg text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-cyan-500 resize-none"
                        />
                        <p className="text-xs text-slate-400 mt-1">
                            {reason.length}/10 karakter minimum
                        </p>
                    </div>

                    {/* Duration */}
                    <div>
                        <label className="block text-sm font-medium text-slate-300 mb-2">
                            Durasi Blacklist
                        </label>
                        <div className="flex gap-4 mb-3">
                            <label className="flex items-center gap-2 cursor-pointer">
                                <input
                                    type="radio"
                                    checked={durationType === 'temporary'}
                                    onChange={() => setDurationType('temporary')}
                                    className="w-4 h-4 text-cyan-500 focus:ring-cyan-500"
                                />
                                <span className="text-slate-300">Sementara</span>
                            </label>
                            <label className="flex items-center gap-2 cursor-pointer">
                                <input
                                    type="radio"
                                    checked={durationType === 'permanent'}
                                    onChange={() => setDurationType('permanent')}
                                    className="w-4 h-4 text-cyan-500 focus:ring-cyan-500"
                                />
                                <span className="text-slate-300">Permanen</span>
                            </label>
                        </div>
                        {durationType === 'temporary' && (
                            <div className="flex items-center gap-2">
                                <input
                                    type="number"
                                    value={durationDays}
                                    onChange={(e) => setDurationDays(Math.max(1, parseInt(e.target.value) || 1))}
                                    min={1}
                                    max={365}
                                    className="w-24 px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-slate-100 focus:outline-none focus:ring-2 focus:ring-cyan-500"
                                />
                                <span className="text-slate-400">hari</span>
                            </div>
                        )}
                    </div>

                    {/* Password Confirmation */}
                    <div>
                        <label className="block text-sm font-medium text-slate-300 mb-2">
                            Konfirmasi Password Admin <span className="text-red-400">*</span>
                        </label>
                        <div className="relative">
                            <input
                                type={showPassword ? 'text' : 'password'}
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                placeholder="Masukkan password Anda..."
                                className="w-full px-4 py-2 pr-10 bg-slate-700 border border-slate-600 rounded-lg text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-cyan-500"
                            />
                            <button
                                type="button"
                                onClick={() => setShowPassword(!showPassword)}
                                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-300"
                            >
                                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                            </button>
                        </div>
                    </div>

                    {/* Warning */}
                    <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg px-4 py-3">
                        <p className="text-amber-400 text-sm">
                            <strong>Perhatian:</strong> User yang di-blacklist tidak akan bisa memesan makanan sampai di-unblock.
                        </p>
                    </div>

                    <div className="flex gap-3 pt-2">
                        <button
                            type="button"
                            onClick={handleClose}
                            disabled={isSubmitting}
                            className="flex-1 px-4 py-2 bg-slate-700 hover:bg-slate-600 text-slate-300 rounded-lg transition-colors disabled:opacity-50"
                        >
                            Batal
                        </button>
                        <button
                            type="submit"
                            disabled={isSubmitting}
                            className="flex-1 px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                        >
                            {isSubmitting ? (
                                <>
                                    <Loader2 className="w-4 h-4 animate-spin" />
                                    Memproses...
                                </>
                            ) : (
                                <>
                                    <Ban className="w-4 h-4" />
                                    Blacklist User
                                </>
                            )}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}

export default function BlacklistPage() {
    const [blacklists, setBlacklists] = useState<Blacklist[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [page, setPage] = useState(1);
    const [totalPages, setTotalPages] = useState(1);
    const [showAll, setShowAll] = useState(false);

    // Modal states
    const [showBlacklistModal, setShowBlacklistModal] = useState(false);
    const [unblockTarget, setUnblockTarget] = useState<Blacklist | null>(null);

    const loadBlacklists = useCallback(async () => {
        setIsLoading(true);
        try {
            const params = new URLSearchParams({
                page: page.toString(),
                limit: '20',
                active: (!showAll).toString(),
            });

            const res = await api.get(`/api/blacklist?${params}`);
            setBlacklists(res.data.blacklists);
            setTotalPages(res.data.pagination.totalPages);
        } catch (error) {
            console.error('Failed to load blacklist:', error);
        } finally {
            setIsLoading(false);
        }
    }, [page, showAll]);

    useEffect(() => {
        loadBlacklists();
    }, [loadBlacklists]);

    // Auto-refresh on blacklist events (SSE)
    useSSERefresh(USER_EVENTS, loadBlacklists);

    const handleBlacklistUser = async (userId: string, reason: string, durationDays: number | null, adminPassword: string) => {
        await api.post('/api/blacklist', {
            userId,
            reason,
            durationDays,
            adminPassword,
        });
        toast.success('User berhasil di-blacklist');
        loadBlacklists();
    };

    const handleUnblockUser = async (password: string, reason: string) => {
        if (!unblockTarget) return;

        await api.post(`/api/blacklist/${unblockTarget.id}/unblock`, {
            adminPassword: password,
            reason,
        });
        toast.success('User berhasil di-unblock');
        loadBlacklists();
    };

    return (
        <div className="space-y-6 animate-fade-in">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-white">Blacklist Management</h1>
                    <p className="text-slate-400">Manage restricted users • Real-time sync enabled</p>
                </div>

                <div className="flex items-center gap-4">
                    <label className="flex items-center gap-2 cursor-pointer">
                        <input
                            type="checkbox"
                            checked={showAll}
                            onChange={(e) => { setShowAll(e.target.checked); setPage(1); }}
                            className="w-4 h-4 rounded border-slate-600 text-cyan-500 focus:ring-cyan-500 focus:ring-offset-slate-800"
                        />
                        <span className="text-slate-300">Show inactive</span>
                    </label>
                    <button
                        onClick={() => setShowBlacklistModal(true)}
                        className="flex items-center gap-2 px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg transition-colors"
                    >
                        <UserPlus className="w-4 h-4" />
                        Blacklist User
                    </button>
                </div>
            </div>

            <div className="glass-dark rounded-xl overflow-hidden">
                {isLoading ? (
                    <div className="flex items-center justify-center py-20">
                        <Loader2 className="w-8 h-8 animate-spin text-cyan-500" />
                    </div>
                ) : blacklists.length === 0 ? (
                    <div className="text-center py-20">
                        <Ban className="w-12 h-12 mx-auto text-slate-600 mb-4" />
                        <p className="text-slate-400">No blacklisted users</p>
                    </div>
                ) : (
                    <>
                        <div className="overflow-x-auto">
                            <table className="w-full">
                                <thead>
                                    <tr className="border-b border-slate-700/50">
                                        <th className="px-6 py-4 text-left text-xs font-semibold text-slate-400 uppercase">User</th>
                                        <th className="px-6 py-4 text-left text-xs font-semibold text-slate-400 uppercase">Reason</th>
                                        <th className="px-6 py-4 text-left text-xs font-semibold text-slate-400 uppercase">Start Date</th>
                                        <th className="px-6 py-4 text-left text-xs font-semibold text-slate-400 uppercase">End Date</th>
                                        <th className="px-6 py-4 text-left text-xs font-semibold text-slate-400 uppercase">Tidak Diambil</th>
                                        <th className="px-6 py-4 text-left text-xs font-semibold text-slate-400 uppercase">Action</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-700/30">
                                    {blacklists.map((entry) => (
                                        <tr key={entry.id} className="hover:bg-slate-800/30 transition-colors">
                                            <td className="px-6 py-4">
                                                <p className="text-white font-medium">{entry.user.name}</p>
                                                <p className="text-sm text-slate-400">{entry.user.externalId}</p>
                                            </td>
                                            <td className="px-6 py-4 text-slate-300 max-w-xs">
                                                <p className="truncate" title={entry.reason}>{entry.reason}</p>
                                            </td>
                                            <td className="px-6 py-4 text-slate-300">
                                                {format(new Date(entry.startDate), 'MMM dd, yyyy')}
                                            </td>
                                            <td className="px-6 py-4 text-slate-300">
                                                {entry.endDate
                                                    ? format(new Date(entry.endDate), 'MMM dd, yyyy')
                                                    : <span className="text-amber-400">Indefinite</span>
                                                }
                                            </td>
                                            <td className="px-6 py-4">
                                                <span className="text-red-400 font-medium">{entry.user.noShowCount}</span>
                                            </td>
                                            <td className="px-6 py-4">
                                                {entry.isActive && (
                                                    <button
                                                        onClick={() => setUnblockTarget(entry)}
                                                        className="flex items-center gap-2 text-sm py-2 px-3 bg-green-600 hover:bg-green-700 text-white rounded-lg transition-colors"
                                                    >
                                                        <Unlock className="w-4 h-4" />
                                                        Unblock
                                                    </button>
                                                )}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>

                        {totalPages > 1 && (
                            <div className="flex items-center justify-between px-6 py-4 border-t border-slate-700/50">
                                <p className="text-sm text-slate-400">Page {page} of {totalPages}</p>
                                <div className="flex items-center gap-2">
                                    <button
                                        onClick={() => setPage(p => Math.max(1, p - 1))}
                                        disabled={page === 1}
                                        className="p-2 rounded-lg hover:bg-slate-700/50 disabled:opacity-50 disabled:cursor-not-allowed"
                                    >
                                        <ChevronLeft className="w-5 h-5 text-slate-400" />
                                    </button>
                                    <button
                                        onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                                        disabled={page === totalPages}
                                        className="p-2 rounded-lg hover:bg-slate-700/50 disabled:opacity-50 disabled:cursor-not-allowed"
                                    >
                                        <ChevronRight className="w-5 h-5 text-slate-400" />
                                    </button>
                                </div>
                            </div>
                        )}
                    </>
                )}
            </div>

            {/* Blacklist User Modal */}
            <BlacklistUserModal
                isOpen={showBlacklistModal}
                onClose={() => setShowBlacklistModal(false)}
                onConfirm={handleBlacklistUser}
            />

            {/* Unblock Confirmation Modal */}
            <ConfirmModal
                isOpen={!!unblockTarget}
                onClose={() => setUnblockTarget(null)}
                onConfirm={handleUnblockUser}
                title="Unblock User"
                description="Anda akan menghapus blacklist untuk user:"
                targetUser={unblockTarget ? `${unblockTarget.user.name} (${unblockTarget.user.externalId})` : ''}
                actionLabel="Unblock User"
                actionColor="green"
                requireReason={true}
                reasonPlaceholder="Jelaskan alasan unblock user ini..."
            />
        </div>
    );
}
