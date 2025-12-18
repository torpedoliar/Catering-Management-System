import React, { useState, useEffect } from 'react';
import { api } from '../contexts/AuthContext';
import { Lock, AlertCircle } from 'lucide-react';
import toast from 'react-hot-toast';

interface ForcePasswordChangeProps {
    onPasswordChanged: () => void;
}

export default function ForcePasswordChange({ onPasswordChanged }: ForcePasswordChangeProps) {
    const [currentPassword, setCurrentPassword] = useState('');
    const [newPassword, setNewPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [agreement, setAgreement] = useState<{ title: string; content: string } | null>(null);
    const [isAgreed, setIsAgreed] = useState(false);

    useEffect(() => {
        // Fetch latest agreement
        api.get('/api/announcements/agreement/latest')
            .then(res => {
                if (res.data.agreement) {
                    setAgreement(res.data.agreement);
                }
            })
            .catch(err => console.error('Failed to load agreement:', err));
    }, []);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();

        if (agreement && !isAgreed) {
            toast.error('You must agree to the terms to continue');
            return;
        }

        if (newPassword.length < 6) {
            toast.error('New password must be at least 6 characters');
            return;
        }

        if (newPassword !== confirmPassword) {
            toast.error('Passwords do not match');
            return;
        }

        setIsLoading(true);
        try {
            await api.post('/api/auth/change-password', {
                currentPassword,
                newPassword,
            });
            toast.success('Password changed successfully!');
            onPasswordChanged();
        } catch (error: any) {
            toast.error(error.response?.data?.error || 'Failed to change password');
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
            <div className="bg-slate-900 rounded-2xl p-8 max-w-md w-full border border-slate-700 shadow-2xl max-h-[90vh] overflow-y-auto">
                <div className="text-center mb-6">
                    <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-amber-500/20 flex items-center justify-center">
                        <Lock className="w-8 h-8 text-amber-400" />
                    </div>
                    <h2 className="text-2xl font-bold text-white mb-2">Password Change Required</h2>
                    <p className="text-slate-400">
                        For security reasons, you must change your password before continuing.
                    </p>
                </div>

                <form onSubmit={handleSubmit} className="space-y-4">
                    {agreement && (
                        <div className="bg-slate-800/50 rounded-xl p-4 border border-slate-700 mb-6">
                            <h3 className="text-lg font-semibold text-white mb-2">{agreement.title}</h3>
                            <div className="h-40 overflow-y-auto pr-2 text-sm text-slate-300 whitespace-pre-wrap scrollbar-thin scrollbar-thumb-slate-600 mb-4 inner-shadow p-2 bg-black/20 rounded">
                                {agreement.content}
                            </div>
                            <div className="flex items-start gap-3 pt-2 border-t border-slate-700">
                                <input
                                    type="checkbox"
                                    id="agree"
                                    checked={isAgreed}
                                    onChange={(e) => setIsAgreed(e.target.checked)}
                                    className="mt-1 w-4 h-4 rounded bg-slate-700 border-slate-600 text-amber-500 focus:ring-amber-500/30"
                                />
                                <label htmlFor="agree" className="text-sm text-slate-300 cursor-pointer select-none">
                                    I have read and agree to the <strong>{agreement.title}</strong>
                                </label>
                            </div>
                        </div>
                    )}

                    <div>
                        <label className="block text-sm text-slate-400 mb-1">Current Password</label>
                        <input
                            type="password"
                            value={currentPassword}
                            onChange={(e) => setCurrentPassword(e.target.value)}
                            className="input-field"
                            required
                        />
                    </div>

                    <div>
                        <label className="block text-sm text-slate-400 mb-1">New Password</label>
                        <input
                            type="password"
                            value={newPassword}
                            onChange={(e) => setNewPassword(e.target.value)}
                            className="input-field"
                            required
                            minLength={6}
                        />
                    </div>

                    <div>
                        <label className="block text-sm text-slate-400 mb-1">Confirm New Password</label>
                        <input
                            type="password"
                            value={confirmPassword}
                            onChange={(e) => setConfirmPassword(e.target.value)}
                            className="input-field"
                            required
                        />
                    </div>

                    <div className="flex items-start gap-2 p-3 bg-amber-500/10 rounded-lg border border-amber-500/30">
                        <AlertCircle className="w-5 h-5 text-amber-400 flex-shrink-0 mt-0.5" />
                        <p className="text-sm text-amber-200">
                            Password must be at least 6 characters long.
                        </p>
                    </div>

                    <button
                        type="submit"
                        disabled={isLoading}
                        className="btn-primary w-full"
                    >
                        {isLoading ? 'Changing...' : 'Change Password'}
                    </button>
                </form>
            </div>
        </div>
    );
}
