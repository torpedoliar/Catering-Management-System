import { useState, useEffect, useRef, useCallback } from 'react';
import { Palette, Upload, Trash2, Save, Image as ImageIcon } from 'lucide-react';
import toast from 'react-hot-toast';
import { api } from '../../contexts/AuthContext';
import {
    PageHeader,
    Button,
    Card,
    Field,
    Input,
    Skeleton,
} from '../../components/ui';

interface BrandingSettings {
    appName: string;
    appShortName: string;
    logoUrl: string | null;
    faviconUrl: string | null;
    loginBackgroundUrl: string | null;
}

export default function BrandingSettingsPage() {
    const [settings, setSettings] = useState<BrandingSettings>({
        appName: 'Catering Management System',
        appShortName: 'Catering',
        logoUrl: null,
        faviconUrl: null,
        loginBackgroundUrl: null,
    });
    const [originalSettings, setOriginalSettings] = useState<BrandingSettings | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);
    const [logoPreview, setLogoPreview] = useState<string | null>(null);
    const [faviconPreview, setFaviconPreview] = useState<string | null>(null);
    const [bgPreview, setBgPreview] = useState<string | null>(null);
    const [logoFile, setLogoFile] = useState<File | null>(null);
    const [faviconFile, setFaviconFile] = useState<File | null>(null);
    const [bgFile, setBgFile] = useState<File | null>(null);

    const logoInputRef = useRef<HTMLInputElement>(null);
    const faviconInputRef = useRef<HTMLInputElement>(null);
    const bgInputRef = useRef<HTMLInputElement>(null);

    const loadSettings = useCallback(async () => {
        try {
            const res = await api.get('/api/settings/branding');
            setSettings(res.data);
            setOriginalSettings(res.data);
        } catch {
            toast.error('Gagal memuat pengaturan branding');
        } finally {
            setIsLoading(false);
        }
    }, []);

    useEffect(() => {
        loadSettings();
    }, [loadSettings]);

    const readPreview = (
        file: File | undefined,
        maxKb: number,
        onOk: (f: File, dataUrl: string) => void
    ) => {
        if (!file) return;
        if (file.size > maxKb * 1024) {
            toast.error(`Ukuran file maksimal ${maxKb >= 1000 ? `${maxKb / 1000}MB` : `${maxKb}KB`}`);
            return;
        }
        const reader = new FileReader();
        reader.onload = () => onOk(file, reader.result as string);
        reader.readAsDataURL(file);
    };

    const uploadAsset = async (
        field: 'logo' | 'favicon' | 'background',
        file: File | null,
        url: string,
        onSuccess: (data: Record<string, string>) => void
    ) => {
        if (!file) return;
        const fd = new FormData();
        fd.append(field, file);
        try {
            const res = await api.post(url, fd);
            onSuccess(res.data);
        } catch (error: unknown) {
            const err = error as { response?: { data?: { error?: string } } };
            toast.error(err.response?.data?.error || `Gagal mengunggah ${field}`);
        }
    };

    const saveTextSettings = async () => {
        setIsSaving(true);
        try {
            await api.put('/api/settings/branding', {
                appName: settings.appName,
                appShortName: settings.appShortName,
            });
            setOriginalSettings((s) =>
                s ? { ...s, appName: settings.appName, appShortName: settings.appShortName } : null
            );
            document.title = settings.appName;
            toast.success('Nama aplikasi disimpan');
        } catch (error: unknown) {
            const err = error as { response?: { data?: { error?: string } } };
            toast.error(err.response?.data?.error || 'Gagal menyimpan');
        } finally {
            setIsSaving(false);
        }
    };

    const hasTextChanges = Boolean(
        originalSettings &&
        (settings.appName !== originalSettings.appName ||
            settings.appShortName !== originalSettings.appShortName)
    );

    if (isLoading) {
        return (
            <div className="space-y-4 w-full">
                <Skeleton className="h-9 w-56" />
                <Skeleton className="h-36 w-full" />
                <Skeleton className="h-44 w-full" />
            </div>
        );
    }

    return (
        <div className="space-y-4 w-full">
            <PageHeader
                title="Branding aplikasi"
                subtitle="Atur nama aplikasi, logo sidebar, favicon browser, dan latar halaman login"
            />

            <Card>
                <div className="flex items-center gap-2 mb-4">
                    <Palette className="w-4 h-4 text-[#b45309]" aria-hidden="true" />
                    <h2 className="text-[15px] font-bold text-[#1c1917]">Nama aplikasi</h2>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <Field label="Nama lengkap" hint="Tampil di judul tab browser dan halaman login">
                        <Input
                            value={settings.appName}
                            onChange={(e) => setSettings((s) => ({ ...s, appName: e.target.value }))}
                        />
                    </Field>
                    <Field label="Nama singkat" hint="Tampil di sidebar dan header">
                        <Input
                            value={settings.appShortName}
                            onChange={(e) => setSettings((s) => ({ ...s, appShortName: e.target.value }))}
                        />
                    </Field>
                </div>
                {hasTextChanges && (
                    <div className="flex justify-end mt-4 pt-3 border-t border-[#f5f5f4]">
                        <Button
                            variant="primary"
                            size="sm"
                            loading={isSaving}
                            onClick={saveTextSettings}
                            leftIcon={<Save className="w-3.5 h-3.5" aria-hidden="true" />}
                        >
                            Simpan nama
                        </Button>
                    </div>
                )}
            </Card>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {/* Logo */}
                <Card>
                    <h3 className="text-[14px] font-bold text-[#1c1917] mb-1">Logo aplikasi</h3>
                    <p className="text-[12px] text-[#78716c] mb-3">PNG/SVG maks. 500KB</p>
                    <div className="h-28 rounded-[10px] bg-[#fafaf9] border border-[#e7e5e4] flex items-center justify-center mb-3 overflow-hidden p-2">
                        {logoPreview || settings.logoUrl ? (
                            <img
                                src={logoPreview || settings.logoUrl || ''}
                                alt="Logo"
                                className="max-h-full max-w-full object-contain"
                            />
                        ) : (
                            <ImageIcon className="w-8 h-8 text-[#a8a29e]" aria-hidden="true" />
                        )}
                    </div>
                    <input
                        ref={logoInputRef}
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={(e) =>
                            readPreview(e.target.files?.[0], 500, (f, d) => {
                                setLogoFile(f);
                                setLogoPreview(d);
                            })
                        }
                    />
                    <div className="flex flex-wrap gap-2">
                        <Button
                            variant="secondary"
                            size="sm"
                            onClick={() => logoInputRef.current?.click()}
                            leftIcon={<Upload className="w-3.5 h-3.5" />}
                        >
                            Pilih
                        </Button>
                        {logoFile && (
                            <Button
                                variant="primary"
                                size="sm"
                                onClick={() =>
                                    uploadAsset('logo', logoFile, '/api/settings/branding/logo', (d) => {
                                        setSettings((s) => ({ ...s, logoUrl: d.logoUrl }));
                                        setLogoFile(null);
                                        setLogoPreview(null);
                                        toast.success('Logo diperbarui');
                                    })
                                }
                            >
                                Unggah
                            </Button>
                        )}
                        {settings.logoUrl && (
                            <Button
                                variant="danger"
                                size="sm"
                                aria-label="Hapus logo"
                                onClick={async () => {
                                    await api.delete('/api/settings/branding/logo');
                                    setSettings((s) => ({ ...s, logoUrl: null }));
                                    toast.success('Logo dihapus');
                                }}
                            >
                                <Trash2 className="w-3.5 h-3.5" />
                            </Button>
                        )}
                    </div>
                </Card>

                {/* Favicon */}
                <Card>
                    <h3 className="text-[14px] font-bold text-[#1c1917] mb-1">Favicon browser</h3>
                    <p className="text-[12px] text-[#78716c] mb-3">PNG/ICO maks. 500KB</p>
                    <div className="h-28 rounded-[10px] bg-[#fafaf9] border border-[#e7e5e4] flex items-center justify-center mb-3 overflow-hidden p-2">
                        {faviconPreview || settings.faviconUrl ? (
                            <img
                                src={faviconPreview || settings.faviconUrl || ''}
                                alt="Favicon"
                                className="w-12 h-12 object-contain"
                            />
                        ) : (
                            <ImageIcon className="w-8 h-8 text-[#a8a29e]" aria-hidden="true" />
                        )}
                    </div>
                    <input
                        ref={faviconInputRef}
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={(e) =>
                            readPreview(e.target.files?.[0], 500, (f, d) => {
                                setFaviconFile(f);
                                setFaviconPreview(d);
                            })
                        }
                    />
                    <div className="flex flex-wrap gap-2">
                        <Button
                            variant="secondary"
                            size="sm"
                            onClick={() => faviconInputRef.current?.click()}
                            leftIcon={<Upload className="w-3.5 h-3.5" />}
                        >
                            Pilih
                        </Button>
                        {faviconFile && (
                            <Button
                                variant="primary"
                                size="sm"
                                onClick={() =>
                                    uploadAsset('favicon', faviconFile, '/api/settings/branding/favicon', (d) => {
                                        setSettings((s) => ({ ...s, faviconUrl: d.faviconUrl }));
                                        setFaviconFile(null);
                                        setFaviconPreview(null);
                                        const fav = document.getElementById('dynamic-favicon') as HTMLLinkElement | null;
                                        if (fav) fav.href = `${d.faviconUrl}?t=${Date.now()}`;
                                        toast.success('Favicon diperbarui');
                                    })
                                }
                            >
                                Unggah
                            </Button>
                        )}
                        {settings.faviconUrl && (
                            <Button
                                variant="danger"
                                size="sm"
                                aria-label="Hapus favicon"
                                onClick={async () => {
                                    await api.delete('/api/settings/branding/favicon');
                                    setSettings((s) => ({ ...s, faviconUrl: null }));
                                    toast.success('Favicon dihapus');
                                }}
                            >
                                <Trash2 className="w-3.5 h-3.5" />
                            </Button>
                        )}
                    </div>
                </Card>

                {/* Login Background */}
                <Card>
                    <h3 className="text-[14px] font-bold text-[#1c1917] mb-1">Latar halaman login</h3>
                    <p className="text-[12px] text-[#78716c] mb-3">JPG/PNG maks. 2MB</p>
                    <div className="h-28 rounded-[10px] bg-[#fafaf9] border border-[#e7e5e4] flex items-center justify-center mb-3 overflow-hidden">
                        {bgPreview || settings.loginBackgroundUrl ? (
                            <img
                                src={bgPreview || settings.loginBackgroundUrl || ''}
                                alt="Background"
                                className="w-full h-full object-cover"
                            />
                        ) : (
                            <ImageIcon className="w-8 h-8 text-[#a8a29e]" aria-hidden="true" />
                        )}
                    </div>
                    <input
                        ref={bgInputRef}
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={(e) =>
                            readPreview(e.target.files?.[0], 2000, (f, d) => {
                                setBgFile(f);
                                setBgPreview(d);
                            })
                        }
                    />
                    <div className="flex flex-wrap gap-2">
                        <Button
                            variant="secondary"
                            size="sm"
                            onClick={() => bgInputRef.current?.click()}
                            leftIcon={<Upload className="w-3.5 h-3.5" />}
                        >
                            Pilih
                        </Button>
                        {bgFile && (
                            <Button
                                variant="primary"
                                size="sm"
                                onClick={() =>
                                    uploadAsset('background', bgFile, '/api/settings/branding/background', (d) => {
                                        setSettings((s) => ({
                                            ...s,
                                            loginBackgroundUrl: d.loginBackgroundUrl,
                                        }));
                                        setBgFile(null);
                                        setBgPreview(null);
                                        toast.success('Background diperbarui');
                                    })
                                }
                            >
                                Unggah
                            </Button>
                        )}
                        {settings.loginBackgroundUrl && (
                            <Button
                                variant="danger"
                                size="sm"
                                aria-label="Hapus latar login"
                                onClick={async () => {
                                    await api.delete('/api/settings/branding/background');
                                    setSettings((s) => ({ ...s, loginBackgroundUrl: null }));
                                    toast.success('Background dihapus');
                                }}
                            >
                                <Trash2 className="w-3.5 h-3.5" />
                            </Button>
                        )}
                    </div>
                </Card>
            </div>
        </div>
    );
}
