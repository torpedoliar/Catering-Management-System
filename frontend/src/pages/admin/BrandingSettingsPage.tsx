import { useState, useEffect, useRef, useCallback } from 'react';
import { api } from '../../contexts/AuthContext';
import { Palette, Upload, Trash2, Loader2, Save, Image, FileImage, RotateCcw } from 'lucide-react';
import toast from 'react-hot-toast';

interface BrandingSettings {
    appName: string;
    appShortName: string;
    logoUrl: string | null;
    faviconUrl: string | null;
}

export default function BrandingSettingsPage() {
    const [settings, setSettings] = useState<BrandingSettings>({
        appName: 'Catering Management System',
        appShortName: 'Catering',
        logoUrl: null,
        faviconUrl: null,
    });
    const [originalSettings, setOriginalSettings] = useState<BrandingSettings | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);
    const [logoPreview, setLogoPreview] = useState<string | null>(null);
    const [faviconPreview, setFaviconPreview] = useState<string | null>(null);
    const [logoFile, setLogoFile] = useState<File | null>(null);
    const [faviconFile, setFaviconFile] = useState<File | null>(null);

    const logoInputRef = useRef<HTMLInputElement>(null);
    const faviconInputRef = useRef<HTMLInputElement>(null);

    const loadSettings = useCallback(async () => {
        try {
            const res = await api.get('/api/settings/branding');
            setSettings(res.data);
            setOriginalSettings(res.data);
        } catch (error) {
            console.error('Failed to load branding:', error);
            toast.error('Gagal memuat pengaturan branding');
        } finally {
            setIsLoading(false);
        }
    }, []);

    useEffect(() => {
        loadSettings();
    }, [loadSettings]);

    const handleLogoSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        if (file.size > 500 * 1024) {
            toast.error('Ukuran file maksimal 500KB');
            return;
        }

        setLogoFile(file);
        const reader = new FileReader();
        reader.onload = () => setLogoPreview(reader.result as string);
        reader.readAsDataURL(file);
    };

    const handleFaviconSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        if (file.size > 500 * 1024) {
            toast.error('Ukuran file maksimal 500KB');
            return;
        }

        setFaviconFile(file);
        const reader = new FileReader();
        reader.onload = () => setFaviconPreview(reader.result as string);
        reader.readAsDataURL(file);
    };

    const uploadLogo = async () => {
        if (!logoFile) return;

        const formData = new FormData();
        formData.append('logo', logoFile);

        try {
            const res = await api.post('/api/settings/branding/logo', formData);
            setSettings(s => ({ ...s, logoUrl: res.data.logoUrl }));
            setLogoFile(null);
            setLogoPreview(null);
            toast.success('Logo berhasil diupload');
        } catch (error: any) {
            toast.error(error.response?.data?.error || 'Gagal upload logo');
        }
    };

    const uploadFavicon = async () => {
        if (!faviconFile) return;

        const formData = new FormData();
        formData.append('favicon', faviconFile);

        try {
            const res = await api.post('/api/settings/branding/favicon', formData);
            setSettings(s => ({ ...s, faviconUrl: res.data.faviconUrl }));
            setFaviconFile(null);
            setFaviconPreview(null);
            toast.success('Favicon berhasil diupload');

            // Update browser favicon immediately
            const favicon = document.getElementById('dynamic-favicon') as HTMLLinkElement;
            if (favicon) {
                favicon.href = res.data.faviconUrl + '?t=' + Date.now();
            }
        } catch (error: any) {
            toast.error(error.response?.data?.error || 'Gagal upload favicon');
        }
    };

    const deleteLogo = async () => {
        try {
            await api.delete('/api/settings/branding/logo');
            setSettings(s => ({ ...s, logoUrl: null }));
            toast.success('Logo dihapus');
        } catch (error: any) {
            toast.error(error.response?.data?.error || 'Gagal menghapus logo');
        }
    };

    const deleteFavicon = async () => {
        try {
            await api.delete('/api/settings/branding/favicon');
            setSettings(s => ({ ...s, faviconUrl: null }));
            toast.success('Favicon dihapus');

            // Reset browser favicon to default
            const favicon = document.getElementById('dynamic-favicon') as HTMLLinkElement;
            if (favicon) {
                favicon.href = '/vite.svg';
            }
        } catch (error: any) {
            toast.error(error.response?.data?.error || 'Gagal menghapus favicon');
        }
    };

    const saveTextSettings = async () => {
        setIsSaving(true);
        try {
            await api.put('/api/settings/branding', {
                appName: settings.appName,
                appShortName: settings.appShortName,
            });
            setOriginalSettings(s => s ? { ...s, appName: settings.appName, appShortName: settings.appShortName } : null);
            toast.success('Pengaturan disimpan');

            // Update browser title
            document.title = settings.appName;
        } catch (error: any) {
            toast.error(error.response?.data?.error || 'Gagal menyimpan');
        } finally {
            setIsSaving(false);
        }
    };

    const hasTextChanges = originalSettings && (
        settings.appName !== originalSettings.appName ||
        settings.appShortName !== originalSettings.appShortName
    );

    if (isLoading) {
        return (
            <div className="flex items-center justify-center h-[60vh]">
                <Loader2 className="w-8 h-8 animate-spin text-orange-500" />
            </div>
        );
    }

    return (
        <div className="max-w-4xl mx-auto space-y-6 animate-fade-in">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold text-[#1a1f37]">Branding</h1>
                    <p className="text-slate-500">Kustomisasi logo dan nama aplikasi</p>
                </div>
            </div>

            {/* App Name Settings */}
            <div className="card p-6">
                <div className="flex items-center gap-3 mb-6">
                    <div className="w-10 h-10 rounded-xl bg-orange-50 flex items-center justify-center">
                        <Palette className="w-5 h-5 text-orange-500" />
                    </div>
                    <h2 className="text-lg font-semibold text-[#1a1f37]">Nama Aplikasi</h2>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                    <div>
                        <label className="block text-sm font-medium text-slate-700 mb-2">
                            Nama Lengkap
                        </label>
                        <input
                            type="text"
                            value={settings.appName}
                            onChange={(e) => setSettings(s => ({ ...s, appName: e.target.value }))}
                            className="input-field"
                            placeholder="Catering Management System"
                        />
                        <p className="text-xs text-slate-500 mt-1">Tampil di browser tab dan halaman login</p>
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-slate-700 mb-2">
                            Nama Singkat
                        </label>
                        <input
                            type="text"
                            value={settings.appShortName}
                            onChange={(e) => setSettings(s => ({ ...s, appShortName: e.target.value }))}
                            className="input-field"
                            placeholder="Catering"
                        />
                        <p className="text-xs text-slate-500 mt-1">Tampil di sidebar</p>
                    </div>
                </div>

                {hasTextChanges && (
                    <div className="flex justify-end">
                        <button
                            onClick={saveTextSettings}
                            disabled={isSaving}
                            className="btn-primary flex items-center gap-2"
                        >
                            {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                            Simpan Nama
                        </button>
                    </div>
                )}
            </div>

            {/* Logo Upload */}
            <div className="card p-6">
                <div className="flex items-center gap-3 mb-6">
                    <div className="w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center">
                        <Image className="w-5 h-5 text-blue-500" />
                    </div>
                    <div>
                        <h2 className="text-lg font-semibold text-[#1a1f37]">Logo Aplikasi</h2>
                        <p className="text-sm text-slate-500">Tampil di sidebar dan halaman login</p>
                    </div>
                </div>

                <div className="flex flex-col md:flex-row gap-6">
                    {/* Current/Preview Logo */}
                    <div className="flex-shrink-0">
                        <p className="text-sm font-medium text-slate-700 mb-2">
                            {logoPreview ? 'Preview' : 'Logo Saat Ini'}
                        </p>
                        <div className="w-32 h-32 rounded-xl border-2 border-dashed border-slate-300 flex items-center justify-center bg-slate-50 overflow-hidden">
                            {logoPreview ? (
                                <img src={logoPreview} alt="Preview" className="w-full h-full object-contain p-2" />
                            ) : settings.logoUrl ? (
                                <img src={settings.logoUrl} alt="Logo" className="w-full h-full object-contain p-2" />
                            ) : (
                                <div className="text-center text-slate-400">
                                    <Image className="w-8 h-8 mx-auto mb-1" />
                                    <span className="text-xs">Default</span>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Upload Controls */}
                    <div className="flex-1 space-y-3">
                        <input
                            ref={logoInputRef}
                            type="file"
                            accept="image/png,image/svg+xml,image/jpeg,image/webp"
                            onChange={handleLogoSelect}
                            className="hidden"
                        />

                        <button
                            onClick={() => logoInputRef.current?.click()}
                            className="btn-secondary flex items-center gap-2"
                        >
                            <Upload className="w-4 h-4" />
                            Pilih File Logo
                        </button>

                        {logoFile && (
                            <div className="flex items-center gap-2">
                                <span className="text-sm text-slate-600">{logoFile.name}</span>
                                <button
                                    onClick={uploadLogo}
                                    className="btn-primary text-sm py-1 px-3"
                                >
                                    Upload
                                </button>
                                <button
                                    onClick={() => { setLogoFile(null); setLogoPreview(null); }}
                                    className="text-slate-400 hover:text-slate-600"
                                >
                                    <RotateCcw className="w-4 h-4" />
                                </button>
                            </div>
                        )}

                        {settings.logoUrl && !logoFile && (
                            <button
                                onClick={deleteLogo}
                                className="text-red-500 hover:text-red-600 text-sm flex items-center gap-1"
                            >
                                <Trash2 className="w-4 h-4" />
                                Hapus Logo
                            </button>
                        )}

                        <p className="text-xs text-slate-500">
                            Format: PNG, SVG, JPG, WebP. Maksimal 500KB. Rekomendasi: 200x200px
                        </p>
                    </div>
                </div>
            </div>

            {/* Favicon Upload */}
            <div className="card p-6">
                <div className="flex items-center gap-3 mb-6">
                    <div className="w-10 h-10 rounded-xl bg-purple-50 flex items-center justify-center">
                        <FileImage className="w-5 h-5 text-purple-500" />
                    </div>
                    <div>
                        <h2 className="text-lg font-semibold text-[#1a1f37]">Favicon</h2>
                        <p className="text-sm text-slate-500">Ikon kecil di browser tab</p>
                    </div>
                </div>

                <div className="flex flex-col md:flex-row gap-6">
                    {/* Current/Preview Favicon */}
                    <div className="flex-shrink-0">
                        <p className="text-sm font-medium text-slate-700 mb-2">
                            {faviconPreview ? 'Preview' : 'Favicon Saat Ini'}
                        </p>
                        <div className="w-20 h-20 rounded-xl border-2 border-dashed border-slate-300 flex items-center justify-center bg-slate-50 overflow-hidden">
                            {faviconPreview ? (
                                <img src={faviconPreview} alt="Preview" className="w-12 h-12 object-contain" />
                            ) : settings.faviconUrl ? (
                                <img src={settings.faviconUrl} alt="Favicon" className="w-12 h-12 object-contain" />
                            ) : (
                                <div className="text-center text-slate-400">
                                    <FileImage className="w-6 h-6 mx-auto" />
                                    <span className="text-xs">Default</span>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Upload Controls */}
                    <div className="flex-1 space-y-3">
                        <input
                            ref={faviconInputRef}
                            type="file"
                            accept="image/png,image/svg+xml,image/x-icon,image/jpeg"
                            onChange={handleFaviconSelect}
                            className="hidden"
                        />

                        <button
                            onClick={() => faviconInputRef.current?.click()}
                            className="btn-secondary flex items-center gap-2"
                        >
                            <Upload className="w-4 h-4" />
                            Pilih File Favicon
                        </button>

                        {faviconFile && (
                            <div className="flex items-center gap-2">
                                <span className="text-sm text-slate-600">{faviconFile.name}</span>
                                <button
                                    onClick={uploadFavicon}
                                    className="btn-primary text-sm py-1 px-3"
                                >
                                    Upload
                                </button>
                                <button
                                    onClick={() => { setFaviconFile(null); setFaviconPreview(null); }}
                                    className="text-slate-400 hover:text-slate-600"
                                >
                                    <RotateCcw className="w-4 h-4" />
                                </button>
                            </div>
                        )}

                        {settings.faviconUrl && !faviconFile && (
                            <button
                                onClick={deleteFavicon}
                                className="text-red-500 hover:text-red-600 text-sm flex items-center gap-1"
                            >
                                <Trash2 className="w-4 h-4" />
                                Hapus Favicon
                            </button>
                        )}

                        <p className="text-xs text-slate-500">
                            Format: PNG, SVG, ICO. Maksimal 500KB. Rekomendasi: 64x64px
                        </p>
                    </div>
                </div>
            </div>
        </div>
    );
}
