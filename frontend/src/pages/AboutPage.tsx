import { useState, useEffect } from 'react';
import { Github, Mail, CheckCircle2 } from 'lucide-react';
import { api } from '../contexts/AuthContext';
import { Card, PageHeader, Badge, SkeletonCard } from '../components/ui';

export default function AboutPage() {
    const [version, setVersion] = useState<string>('');
    const [releaseDate, setReleaseDate] = useState<string>('');
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchVersion = async () => {
            try {
                const res = await api.get('/api/version');
                setVersion(res.data.current.version);
                setReleaseDate(res.data.current.releaseDate);
            } catch (error) {
                console.error('Failed to fetch version:', error);
                setVersion('N/A');
            } finally {
                setLoading(false);
            }
        };
        fetchVersion();
    }, []);

    const features = [
        { title: 'Pemesanan multi-hari', desc: 'Pesan makanan beberapa hari ke depan sesuai batas cutoff.' },
        { title: 'Dukungan multi-shift', desc: 'Mendukung beberapa shift makan dan jam istirahat fleksibel.' },
        { title: 'Check-in barcode/QR', desc: 'Verifikasi pengambilan cepat dengan barcode unik di kantin.' },
        { title: 'Kontrol departemen', desc: 'Akses shift dan lokasi kantin per struktur organisasi.' },
        { title: 'Pembaruan real-time', desc: 'Status pesanan dan pengumuman diperbarui via SSE.' },
        { title: 'Sistem strike & blacklist', desc: 'Pencatatan otomatis untuk pesanan tidak diambil beserta sanggahan.' },
    ];

    return (
        <div className="max-w-[960px] w-full space-y-[18px]">
            <PageHeader
                title="Tentang aplikasi"
                subtitle="Sistem Manajemen Katering PT Santos Jaya Abadi"
            />

            {loading ? (
                <SkeletonCard lines={3} />
            ) : (
                <Card className="flex flex-wrap items-center justify-between gap-4">
                    <div>
                        <div className="flex items-center gap-2.5">
                            <h2 className="m-0 text-[18px] font-extrabold text-[#1c1917]">
                                Catering Management System
                            </h2>
                            <Badge variant="warning">Versi {version}</Badge>
                        </div>
                        <p className="m-0 mt-1.5 text-[13.5px] text-[#78716c]">
                            Sistem manajemen pemesanan katering multi-shift, check-in barcode, dan pelaporan operasional.
                        </p>
                    </div>
                    {releaseDate && (
                        <div className="text-[12.5px] text-[#78716c]">Rilis: {releaseDate}</div>
                    )}
                </Card>
            )}

            <Card>
                <h2 className="m-0 mb-3.5 text-[15px] font-bold text-[#1c1917]">Fitur utama</h2>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {features.map((f) => (
                        <div
                            key={f.title}
                            className="flex items-start gap-2.5 p-3 rounded-[10px] border border-[#f0efed] bg-[#fafaf9]"
                        >
                            <CheckCircle2 className="w-4 h-4 text-[#15803d] flex-shrink-0 mt-0.5" aria-hidden="true" />
                            <div>
                                <div className="text-[13.5px] font-bold text-[#1c1917]">{f.title}</div>
                                <div className="text-[12.5px] text-[#78716c] mt-0.5">{f.desc}</div>
                            </div>
                        </div>
                    ))}
                </div>
            </Card>

            <Card className="flex flex-wrap items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                    <div className="w-11 h-11 rounded-full bg-[#fde68a] text-[#92400e] flex items-center justify-center font-extrabold text-[15px]">
                        YO
                    </div>
                    <div>
                        <div className="text-[14px] font-bold text-[#1c1917]">Yohanes Octavian Rizky</div>
                        <div className="text-[12.5px] text-[#78716c]">Pengembang · ICT SJA</div>
                    </div>
                </div>
                <div className="flex flex-wrap gap-2">
                    <a
                        href="https://github.com/torpedoliar/"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-2 h-9 px-3 rounded-[9px] border border-[#e7e5e4] bg-[#fff] text-[13px] font-semibold text-[#44403c] no-underline hover:bg-[#fafaf9]"
                    >
                        <Github className="w-4 h-4" aria-hidden="true" />
                        <span>github.com/torpedoliar</span>
                    </a>
                    <a
                        href="mailto:yohanesorizky@gmail.com"
                        className="inline-flex items-center gap-2 h-9 px-3 rounded-[9px] border border-[#e7e5e4] bg-[#fff] text-[13px] font-semibold text-[#44403c] no-underline hover:bg-[#fafaf9]"
                    >
                        <Mail className="w-4 h-4 text-[#b45309]" aria-hidden="true" />
                        <span>yohanesorizky@gmail.com</span>
                    </a>
                </div>
            </Card>
        </div>
    );
}
