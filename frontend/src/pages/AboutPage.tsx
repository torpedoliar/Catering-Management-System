import { Shield, Clock, Calendar, Users, Bell, FileText, CheckCircle, Settings, QrCode, Building, Github, Mail } from 'lucide-react';

export default function AboutPage() {
    return (
        <div className="max-w-4xl mx-auto space-y-6 animate-fade-in">
            {/* Header */}
            <div className="card py-12 text-center">
                <div className="w-20 h-20 mx-auto mb-6 rounded-apple-xl bg-apple-blue flex items-center justify-center shadow-apple-lg">
                    <FileText className="w-10 h-10 text-white" />
                </div>
                <h1 className="text-title-1 text-white mb-2">Catering Management System</h1>
                <p className="text-title-3 text-apple-blue mb-4">Version 1.2</p>
                <p className="text-body text-dark-text-secondary max-w-2xl mx-auto">
                    Sistem manajemen pemesanan katering yang modern dan efisien dengan fitur multi-shift,
                    multi-day ordering, QR code check-in, dan kontrol administratif yang lengkap.
                </p>
            </div>

            {/* Key Features */}
            <div className="card">
                <div className="flex items-center gap-3 mb-6">
                    <div className="stat-icon bg-apple-green/15">
                        <CheckCircle className="w-6 h-6 text-apple-green" />
                    </div>
                    <h2 className="text-title-2 text-white">Fitur Utama</h2>
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
                    <div className="stat-icon bg-apple-blue/15">
                        <Users className="w-6 h-6 text-apple-blue" />
                    </div>
                    <h2 className="text-title-2 text-white">Fitur Pengguna</h2>
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
                        <div key={index} className="flex items-center gap-3 p-3 rounded-apple bg-dark-bg-tertiary">
                            <CheckCircle className="w-5 h-5 text-apple-green flex-shrink-0" />
                            <span className="text-body text-white">{item}</span>
                        </div>
                    ))}
                </div>
            </div>

            {/* Admin Features */}
            <div className="card">
                <div className="flex items-center gap-3 mb-6">
                    <div className="stat-icon bg-apple-purple/15">
                        <Shield className="w-6 h-6 text-apple-purple" />
                    </div>
                    <h2 className="text-title-2 text-white">Fitur Administrator</h2>
                </div>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="space-y-3">
                        <h3 className="text-body font-semibold text-apple-blue">Manajemen Pengguna</h3>
                        <ul className="space-y-2 text-callout text-dark-text-secondary">
                            <li className="flex items-center gap-2"><span className="w-1.5 h-1.5 rounded-full bg-apple-blue" /> Import/Export pengguna via Excel</li>
                            <li className="flex items-center gap-2"><span className="w-1.5 h-1.5 rounded-full bg-apple-blue" /> Reset password dengan konfirmasi admin</li>
                            <li className="flex items-center gap-2"><span className="w-1.5 h-1.5 rounded-full bg-apple-blue" /> Manajemen strike dan blacklist</li>
                            <li className="flex items-center gap-2"><span className="w-1.5 h-1.5 rounded-full bg-apple-blue" /> Audit log aktivitas pengguna</li>
                        </ul>
                    </div>
                    <div className="space-y-3">
                        <h3 className="text-body font-semibold text-apple-green">Konfigurasi Sistem</h3>
                        <ul className="space-y-2 text-callout text-dark-text-secondary">
                            <li className="flex items-center gap-2"><span className="w-1.5 h-1.5 rounded-full bg-apple-green" /> Pengaturan shift dan waktu cutoff</li>
                            <li className="flex items-center gap-2"><span className="w-1.5 h-1.5 rounded-full bg-apple-green" /> Konfigurasi blacklist (strikes & durasi)</li>
                            <li className="flex items-center gap-2"><span className="w-1.5 h-1.5 rounded-full bg-apple-green" /> Batas maksimal hari order ke depan</li>
                            <li className="flex items-center gap-2"><span className="w-1.5 h-1.5 rounded-full bg-apple-green" /> Sinkronisasi waktu NTP</li>
                        </ul>
                    </div>
                    <div className="space-y-3">
                        <h3 className="text-body font-semibold text-apple-orange">Struktur Organisasi</h3>
                        <ul className="space-y-2 text-callout text-dark-text-secondary">
                            <li className="flex items-center gap-2"><span className="w-1.5 h-1.5 rounded-full bg-apple-orange" /> Manajemen Company/Division/Department</li>
                            <li className="flex items-center gap-2"><span className="w-1.5 h-1.5 rounded-full bg-apple-orange" /> Konfigurasi allowed shifts per department</li>
                            <li className="flex items-center gap-2"><span className="w-1.5 h-1.5 rounded-full bg-apple-orange" /> Import otomatis dari data pengguna</li>
                        </ul>
                    </div>
                    <div className="space-y-3">
                        <h3 className="text-body font-semibold text-apple-purple">Operasional</h3>
                        <ul className="space-y-2 text-callout text-dark-text-secondary">
                            <li className="flex items-center gap-2"><span className="w-1.5 h-1.5 rounded-full bg-apple-purple" /> Check-in manual dan QR scanner</li>
                            <li className="flex items-center gap-2"><span className="w-1.5 h-1.5 rounded-full bg-apple-purple" /> Dashboard statistik real-time</li>
                            <li className="flex items-center gap-2"><span className="w-1.5 h-1.5 rounded-full bg-apple-purple" /> Export transaksi ke Excel</li>
                            <li className="flex items-center gap-2"><span className="w-1.5 h-1.5 rounded-full bg-apple-purple" /> Manajemen hari libur</li>
                        </ul>
                    </div>
                </div>
            </div>

            {/* Technical Info */}
            <div className="card">
                <div className="flex items-center gap-3 mb-6">
                    <div className="stat-icon bg-dark-bg-tertiary">
                        <Settings className="w-6 h-6 text-dark-text-secondary" />
                    </div>
                    <h2 className="text-title-2 text-white">Informasi Teknis</h2>
                </div>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="p-4 rounded-apple bg-dark-bg-tertiary">
                        <h3 className="text-body font-semibold text-white mb-3">Backend</h3>
                        <ul className="space-y-2 text-callout text-dark-text-secondary">
                            <li>Node.js + Express</li>
                            <li>PostgreSQL Database</li>
                            <li>Prisma ORM</li>
                            <li>JWT Authentication</li>
                            <li>Server-Sent Events (SSE)</li>
                        </ul>
                    </div>
                    <div className="p-4 rounded-apple bg-dark-bg-tertiary">
                        <h3 className="text-body font-semibold text-white mb-3">Frontend</h3>
                        <ul className="space-y-2 text-callout text-dark-text-secondary">
                            <li>React + TypeScript</li>
                            <li>Vite Build Tool</li>
                            <li>Tailwind CSS</li>
                            <li>React Router</li>
                            <li>QRCode.react</li>
                        </ul>
                    </div>
                </div>
            </div>

            {/* Developer Info */}
            <div className="card">
                <div className="flex items-center gap-3 mb-6">
                    <div className="stat-icon bg-apple-teal/15">
                        <Users className="w-6 h-6 text-apple-teal" />
                    </div>
                    <h2 className="text-title-2 text-white">Pengembang</h2>
                </div>
                
                <div className="flex flex-col items-center text-center p-6 rounded-apple bg-dark-bg-tertiary">
                    <div className="w-16 h-16 rounded-full bg-gradient-to-br from-apple-blue to-apple-purple flex items-center justify-center mb-4">
                        <span className="text-2xl font-bold text-white">YO</span>
                    </div>
                    <h3 className="text-title-3 text-white mb-2">Yohanes Octavian Rizky</h3>
                    <p className="text-body text-dark-text-secondary mb-4 italic">"Peningkatan kecil setiap hari pada akhirnya menghasilkan hasil yang besar."</p>
                    
                    <div className="flex flex-col sm:flex-row gap-3">
                        <a 
                            href="https://github.com/torpedoliar/" 
                            target="_blank" 
                            rel="noopener noreferrer"
                            className="flex items-center gap-2 px-4 py-2 rounded-apple bg-dark-bg-secondary hover:bg-white/10 transition-colors"
                        >
                            <Github className="w-5 h-5 text-white" />
                            <span className="text-callout text-white">github.com/torpedoliar</span>
                        </a>
                        <a 
                            href="mailto:yohanesorizky@gmail.com"
                            className="flex items-center gap-2 px-4 py-2 rounded-apple bg-dark-bg-secondary hover:bg-white/10 transition-colors"
                        >
                            <Mail className="w-5 h-5 text-apple-blue" />
                            <span className="text-callout text-white">yohanesorizky@gmail.com</span>
                        </a>
                    </div>
                </div>
            </div>

            {/* Footer */}
            <div className="text-center py-6">
                <p className="text-callout text-dark-text-secondary">© 2026 Catering Management System</p>
                <p className="text-caption text-dark-text-secondary mt-1">Developed with care for efficient catering operations</p>
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
        blue: 'bg-apple-blue/15 text-apple-blue',
        green: 'bg-apple-green/15 text-apple-green',
        orange: 'bg-apple-orange/15 text-apple-orange',
        purple: 'bg-apple-purple/15 text-apple-purple',
        teal: 'bg-apple-teal/15 text-apple-teal',
        red: 'bg-apple-red/15 text-apple-red',
        indigo: 'bg-apple-indigo/15 text-apple-indigo',
        pink: 'bg-apple-pink/15 text-apple-pink',
    };

    return (
        <div className="flex gap-4 p-4 rounded-apple bg-dark-bg-tertiary border border-white/5 hover:border-white/10 transition-colors">
            <div className={`flex-shrink-0 w-10 h-10 rounded-apple-sm flex items-center justify-center ${colorClasses[color]}`}>
                {icon}
            </div>
            <div>
                <h3 className="text-body font-semibold text-white mb-1">{title}</h3>
                <p className="text-callout text-dark-text-secondary">{description}</p>
            </div>
        </div>
    );
}
