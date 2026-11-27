import React, { useState, useEffect } from 'react';
import { Lock, AlertCircle } from 'lucide-react';
import toast from 'react-hot-toast';
import { api } from '../contexts/AuthContext';
import { Button, Field, Input } from './ui';

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
        api.get('/api/announcements/agreement/latest')
            .then((res) => {
                if (res.data.agreement) {
                    setAgreement(res.data.agreement);
                }
            })
            .catch((err) => console.error('Failed to load agreement:', err));
    }, []);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();

        if (agreement && !isAgreed) {
            toast.error('Anda wajib menyetujui ketentuan penggunaan terlebih dahulu');
            return;
        }

        if (newPassword.length < 6) {
            toast.error('Password baru minimal 6 karakter');
            return;
        }

        if (newPassword !== confirmPassword) {
            toast.error('Konfirmasi password tidak cocok');
            return;
        }

        setIsLoading(true);
        try {
            await api.post('/api/auth/change-password', {
                currentPassword,
                newPassword,
            });
            toast.success('Password berhasil diperbarui');
            onPasswordChanged();
        } catch (error) {
            const msg = (error as { response?: { data?: { error?: string } } })?.response?.data?.error;
            toast.error(msg || 'Gagal mengganti password');
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="force-pw-title"
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#0f172a]/70 backdrop-blur-sm"
        >
            <div className="bg-[#fff] rounded-[16px] p-6 sm:p-7 max-w-md w-full border border-[#e7e5e4] shadow-xl max-h-[90vh] overflow-y-auto">
                <div className="text-center mb-5">
                    <div className="w-12 h-12 mx-auto mb-3 rounded-full bg-[#fffbeb] border border-[#fde68a] flex items-center justify-center">
                        <Lock className="w-5 h-5 text-[#b45309]" aria-hidden="true" />
                    </div>
                    <h2 id="force-pw-title" className="text-[20px] font-bold text-[#1c1917]">
                        Wajib Ganti Password
                    </h2>
                    <p className="text-[13px] text-[#78716c] mt-1">
                        Demi keamanan akun, ganti password bawaan sebelum melanjutkan.
                    </p>
                </div>

                <form onSubmit={handleSubmit} className="space-y-3.5">
                    {agreement && (
                        <div className="bg-[#fafaf9] rounded-[12px] p-3.5 border border-[#e7e5e4]">
                            <h3 className="text-[14px] font-bold text-[#1c1917] mb-2">{agreement.title}</h3>
                            <div className="h-36 overflow-y-auto pr-2 text-[12.5px] text-[#57534e] whitespace-pre-wrap p-2.5 bg-[#fff] border border-[#e7e5e4] rounded-[8px] mb-3 leading-relaxed">
                                {agreement.content}
                            </div>
                            <label className="flex items-start gap-2.5 pt-2 border-t border-[#e7e5e4] cursor-pointer text-[13px] text-[#1c1917] select-none">
                                <input
                                    type="checkbox"
                                    id="agree"
                                    checked={isAgreed}
                                    onChange={(e) => setIsAgreed(e.target.checked)}
                                    className="mt-0.5 w-4 h-4 rounded border-[#d6d3d1] accent-[#f59e0b]"
                                />
                                <span>
                                    Saya telah membaca dan menyetujui <b>{agreement.title}</b>
                                </span>
                            </label>
                        </div>
                    )}

                    <Field label="Password saat ini" required>
                        <Input
                            type="password"
                            value={currentPassword}
                            onChange={(e) => setCurrentPassword(e.target.value)}
                            required
                        />
                    </Field>

                    <Field label="Password baru" required>
                        <Input
                            type="password"
                            value={newPassword}
                            onChange={(e) => setNewPassword(e.target.value)}
                            minLength={6}
                            required
                        />
                    </Field>

                    <Field label="Konfirmasi password baru" required>
                        <Input
                            type="password"
                            value={confirmPassword}
                            onChange={(e) => setConfirmPassword(e.target.value)}
                            required
                        />
                    </Field>

                    <div className="flex items-start gap-2 p-3 bg-[#fffbeb] rounded-[10px] border border-[#fde68a]">
                        <AlertCircle className="w-4 h-4 text-[#b45309] flex-shrink-0 mt-0.5" aria-hidden="true" />
                        <p className="text-[12.5px] text-[#92400e]">
                            Password baru harus terdiri dari minimal 6 karakter.
                        </p>
                    </div>

                    <Button type="submit" variant="primary" loading={isLoading} className="w-full">
                        {isLoading ? 'Menyimpan...' : 'Simpan Password Baru'}
                    </Button>
                </form>
            </div>
        </div>
    );
}
