import { Shield, Clock, Calendar, Users, Bell, FileText, CheckCircle, Settings, QrCode, Building, Github, Mail } from 'lucide-react';

export default function AboutPage() {
    return (
        <div className="max-w-4xl mx-auto space-y-6 animate-fade-in">
            {/* Header */}
            <div className="card py-12 text-center">
                <div className="w-20 h-20 mx-auto mb-6 rounded-2xl bg-gradient-to-br from-orange-400 to-orange-600 flex items-center justify-center shadow-lg">
                    <FileText className="w-10 h-10 text-white" />
                </div>
                <h1 className="text-3xl font-bold text-[#1a1f37] mb-2">Catering Management System</h1>
                <p className="text-lg font-semibold text-orange-500 mb-4">Version 1.4.0</p>
                <p className="text-slate-500 max-w-2xl mx-auto">
                    Sistem manajemen pemesanan katering yang modern dan efisien dengan fitur multi-shift,
                    multi-day ordering, QR code check-in, dan kontrol administratif yang lengkap.
                </p>
            </div>

            {/* Key Features */}
            <div className="card">
                <div className="flex items-center gap-3 mb-6">
                    <div className="w-10 h-10 rounded-xl bg-emerald-50 flex items-center justify-center">
                        <CheckCircle className="w-6 h-6 text-emerald-500" />
                    </div>
                    <h2 className="text-xl font-bold text-[#1a1f37]">Fitur Utama</h2>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <FeatureCard
                        icon={<Calendar className="w-5 h-5" />}
                        color="blue"
                        title="Multi-Day Ordering"
                        description="Pesan makanan untuk beberapa hari ke depan sesuai batas yang ditentukan admin"
                    />
                    <FeatureCard
                        icon={<Clock className="w-5 h-5" />}
                        color="orange"
                        title="Multi-Shift Support"
                        description="Mendukung beberapa shift makan dengan konfigurasi waktu yang fleksibel"
                    />
                    <FeatureCard
                        icon={<QrCode className="w-5 h-5" />}
                        color="green"
                        title="QR Code Check-in"
                        description="Sistem verifikasi pengambilan makanan menggunakan QR code unik"
                    />
                    <FeatureCard
                        icon={<Users className="w-5 h-5" />}
                        color="indigo"
                        title="Photo Check-in"
                        description="Capture foto saat check-in dengan webcam untuk verifikasi identitas"
                    />
                    <FeatureCard
                        icon={<Building className="w-5 h-5" />}
                        color="purple"
                        title="Department Access"
                        description="Kontrol akses shift berdasarkan struktur Company/Division/Department"
                    />
                    <FeatureCard
                        icon={<Bell className="w-5 h-5" />}
                        color="teal"
                        title="Real-time Updates"
                        description="Server-Sent Events (SSE) untuk update status order secara real-time"
                    />
                    <FeatureCard
                        icon={<Shield className="w-5 h-5" />}
                        color="red"
                        title="Blacklist System"
                        description="Sistem strike otomatis untuk pengguna yang tidak mengambil pesanan"
                    />
                    <FeatureCard
                        icon={<Clock className="w-5 h-5" />}
                        color="indigo"
                        title="NTP Time Sync"
                        description="Sinkronisasi waktu server dengan NTP untuk akurasi cutoff time"
                    />
                    <FeatureCard
                        icon={<Settings className="w-5 h-5" />}
                        color="pink"
                        title="Holiday Management"
                        description="Konfigurasi hari libur untuk semua shift atau shift tertentu"
                    />
                </div>
            </div>

            {/* User Features */}
            <div className="card">
                <div className="flex items-center gap-3 mb-6">
                    <div className="w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center">
                        <Users className="w-6 h-6 text-blue-500" />
                    </div>
                    <h2 className="text-xl font-bold text-[#1a1f37]">Fitur Pengguna</h2>
                </div>

                <div className="space-y-3">
                    {[
                        'Pemesanan katering dengan pemilihan shift dan tanggal',
                        'QR code unik untuk setiap pesanan',
                        'Riwayat pesanan lengkap dengan filter status',
                        'Pembatalan pesanan sebelum cutoff time',
                        'Notifikasi real-time untuk perubahan status pesanan',
                        'Wajib ganti password untuk pengguna baru',
                    ].map((item, index) => (
                        <div key={index} className="flex items-center gap-3 p-3 rounded-xl bg-slate-50">
                            <CheckCircle className="w-5 h-5 text-emerald-500 flex-shrink-0" />
                            <span className="text-slate-700">{item}</span>
                        </div>
                    ))}
                </div>
            </div>

            {/* Admin Features */}
            <div className="card">
                <div className="flex items-center gap-3 mb-6">
                    <div className="w-10 h-10 rounded-xl bg-purple-50 flex items-center justify-center">
                        <Shield className="w-6 h-6 text-purple-500" />
                    </div>
                    <h2 className="text-xl font-bold text-[#1a1f37]">Fitur Administrator</h2>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="space-y-3">
                        <h3 className="font-semibold text-blue-600">Manajemen Pengguna</h3>
                        <ul className="space-y-2 text-sm text-slate-500">
                            <li className="flex items-center gap-2"><span className="w-1.5 h-1.5 rounded-full bg-blue-500" /> Import/Export pengguna via Excel</li>
                            <li className="flex items-center gap-2"><span className="w-1.5 h-1.5 rounded-full bg-blue-500" /> Reset password dengan konfirmasi admin</li>
                            <li className="flex items-center gap-2"><span className="w-1.5 h-1.5 rounded-full bg-blue-500" /> Manajemen strike dan blacklist</li>
                            <li className="flex items-center gap-2"><span className="w-1.5 h-1.5 rounded-full bg-blue-500" /> Audit log aktivitas pengguna</li>
                        </ul>
                    </div>
                    <div className="space-y-3">
                        <h3 className="font-semibold text-emerald-600">Konfigurasi Sistem</h3>
                        <ul className="space-y-2 text-sm text-slate-500">
                            <li className="flex items-center gap-2"><span className="w-1.5 h-1.5 rounded-full bg-emerald-500" /> Pengaturan shift dan waktu cutoff</li>
                            <li className="flex items-center gap-2"><span className="w-1.5 h-1.5 rounded-full bg-emerald-500" /> Konfigurasi blacklist (strikes & durasi)</li>
                            <li className="flex items-center gap-2"><span className="w-1.5 h-1.5 rounded-full bg-emerald-500" /> Batas maksimal hari order ke depan</li>
                            <li className="flex items-center gap-2"><span className="w-1.5 h-1.5 rounded-full bg-emerald-500" /> Sinkronisasi waktu NTP</li>
                        </ul>
                    </div>
                    <div className="space-y-3">
                        <h3 className="font-semibold text-orange-600">Struktur Organisasi</h3>
                        <ul className="space-y-2 text-sm text-slate-500">
                            <li className="flex items-center gap-2"><span className="w-1.5 h-1.5 rounded-full bg-orange-500" /> Manajemen Company/Division/Department</li>
                            <li className="flex items-center gap-2"><span className="w-1.5 h-1.5 rounded-full bg-orange-500" /> Konfigurasi allowed shifts per department</li>
                            <li className="flex items-center gap-2"><span className="w-1.5 h-1.5 rounded-full bg-orange-500" /> Import otomatis dari data pengguna</li>
                        </ul>
                    </div>
                    <div className="space-y-3">
                        <h3 className="font-semibold text-purple-600">Operasional</h3>
                        <ul className="space-y-2 text-sm text-slate-500">
                            <li className="flex items-center gap-2"><span className="w-1.5 h-1.5 rounded-full bg-purple-500" /> Check-in manual dan QR scanner</li>
                            <li className="flex items-center gap-2"><span className="w-1.5 h-1.5 rounded-full bg-purple-500" /> Dashboard statistik real-time</li>
                            <li className="flex items-center gap-2"><span className="w-1.5 h-1.5 rounded-full bg-purple-500" /> Export transaksi ke Excel</li>
                            <li className="flex items-center gap-2"><span className="w-1.5 h-1.5 rounded-full bg-purple-500" /> Manajemen hari libur</li>
                        </ul>
                    </div>
                </div>
            </div>



            {/* Developer Info */}
            <div className="card">
                <div className="flex items-center gap-3 mb-6">
                    <div className="w-10 h-10 rounded-xl bg-teal-50 flex items-center justify-center">
                        <Users className="w-6 h-6 text-teal-500" />
                    </div>
                    <h2 className="text-xl font-bold text-[#1a1f37]">Pengembang</h2>
                </div>

                <div className="flex flex-col items-center text-center p-6 rounded-xl bg-slate-50">
                    <div className="w-16 h-16 rounded-full bg-gradient-to-br from-orange-400 to-orange-600 flex items-center justify-center mb-4">
                        <span className="text-2xl font-bold text-white">YO</span>
                    </div>
                    <h3 className="text-lg font-semibold text-[#1a1f37] mb-2">Yohanes Octavian Rizky</h3>
                    <p className="text-slate-500 mb-4 italic">"Peningkatan kecil setiap hari pada akhirnya menghasilkan hasil yang besar."</p>

                    <div className="flex flex-col sm:flex-row gap-3">
                        <a
                            href="https://github.com/torpedoliar/"
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-slate-200 hover:bg-slate-300 transition-colors"
                        >
                            <Github className="w-5 h-5 text-slate-700" />
                            <span className="text-sm text-slate-700">github.com/torpedoliar</span>
                        </a>
                        <a
                            href="mailto:yohanesorizky@gmail.com"
                            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-slate-200 hover:bg-slate-300 transition-colors"
                        >
                            <Mail className="w-5 h-5 text-orange-500" />
                            <span className="text-sm text-slate-700">yohanesorizky@gmail.com</span>
                        </a>
                    </div>
                </div>
            </div>

            {/* Footer */}
            <div className="text-center py-6">
                <p className="text-sm text-slate-500">© 2026 Catering Management System</p>
                <p className="text-xs text-slate-400 mt-1">Developed with care for efficient catering operations</p>
            </div>
        </div>
    );
}

function FeatureCard({ icon, color, title, description }: {
    icon: React.ReactNode;
    color: 'blue' | 'green' | 'orange' | 'purple' | 'teal' | 'red' | 'indigo' | 'pink';
    title: string;
    description: string
}) {
    const colorClasses = {
        blue: 'bg-blue-50 text-blue-500',
        green: 'bg-emerald-50 text-emerald-500',
        orange: 'bg-orange-50 text-orange-500',
        purple: 'bg-purple-50 text-purple-500',
        teal: 'bg-teal-50 text-teal-500',
        red: 'bg-red-50 text-red-500',
        indigo: 'bg-indigo-50 text-indigo-500',
        pink: 'bg-pink-50 text-pink-500',
    };

    return (
        <div className="flex gap-4 p-4 rounded-xl bg-slate-50 border border-slate-100 hover:border-slate-200 transition-colors">
            <div className={`flex-shrink-0 w-10 h-10 rounded-xl flex items-center justify-center ${colorClasses[color]}`}>
                {icon}
            </div>
            <div>
                <h3 className="font-semibold text-[#1a1f37] mb-1">{title}</h3>
                <p className="text-sm text-slate-500">{description}</p>
            </div>
        </div>
    );
}
