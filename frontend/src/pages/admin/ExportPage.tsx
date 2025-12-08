import { useState } from 'react';
import { format, subDays } from 'date-fns';
import { FileSpreadsheet, Download, Loader2, Calendar } from 'lucide-react';
import toast from 'react-hot-toast';


export default function ExportPage() {
    const [startDate, setStartDate] = useState(format(subDays(new Date(), 30), 'yyyy-MM-dd'));
    const [endDate, setEndDate] = useState(format(new Date(), 'yyyy-MM-dd'));
    const [status, setStatus] = useState('');
    const [isExporting, setIsExporting] = useState(false);

    const handleExport = async () => {
        setIsExporting(true);
        try {
            const params = new URLSearchParams();
            if (startDate) params.append('startDate', startDate);
            if (endDate) params.append('endDate', endDate);
            if (status) params.append('status', status);

            const token = localStorage.getItem('token');
            const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:3012';

            const response = await fetch(`${apiUrl}/api/orders/export?${params}`, {
                method: 'GET',
                headers: {
                    'Authorization': `Bearer ${token}`,
                },
            });

            if (!response.ok) {
                throw new Error('Export failed');
            }

            const blob = await response.blob();
            const filename = `transactions_${startDate}_to_${endDate}.xlsx`;

            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = filename;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);

            toast.success('Export downloaded successfully');
        } catch (error) {
            console.error('Export error:', error);
            toast.error('Failed to export transactions');
        } finally {
            setIsExporting(false);
        }
    };

    return (
        <div className="max-w-2xl mx-auto space-y-6 animate-fade-in">
            <div>
                <h1 className="text-2xl font-bold text-white">Export Transactions</h1>
                <p className="text-slate-400">Download order history as Excel file</p>
            </div>

            <div className="glass-dark rounded-xl p-6">
                <div className="flex items-center gap-3 mb-6">
                    <div className="w-12 h-12 rounded-xl bg-cyan-500/20 flex items-center justify-center">
                        <FileSpreadsheet className="w-6 h-6 text-cyan-400" />
                    </div>
                    <div>
                        <h2 className="text-lg font-semibold text-white">Transaction Export</h2>
                        <p className="text-sm text-slate-400">Select date range and filters</p>
                    </div>
                </div>

                <div className="space-y-6">
                    {/* Date Range */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                            <label className="block text-sm text-slate-400 mb-2 flex items-center gap-2">
                                <Calendar className="w-4 h-4" />
                                Start Date
                            </label>
                            <input
                                type="date"
                                value={startDate}
                                onChange={(e) => setStartDate(e.target.value)}
                                className="input-field"
                            />
                        </div>
                        <div>
                            <label className="block text-sm text-slate-400 mb-2 flex items-center gap-2">
                                <Calendar className="w-4 h-4" />
                                End Date
                            </label>
                            <input
                                type="date"
                                value={endDate}
                                onChange={(e) => setEndDate(e.target.value)}
                                className="input-field"
                            />
                        </div>
                    </div>

                    {/* Status Filter */}
                    <div>
                        <label className="block text-sm text-slate-400 mb-2">Status Filter</label>
                        <select
                            value={status}
                            onChange={(e) => setStatus(e.target.value)}
                            className="input-field"
                        >
                            <option value="">Semua Status</option>
                            <option value="PICKED_UP">Sudah Diambil</option>
                            <option value="ORDERED">Menunggu Diambil</option>
                            <option value="NO_SHOW">Tidak Diambil</option>
                            <option value="CANCELLED">Dibatalkan</option>
                        </select>
                    </div>

                    {/* Export Columns Info */}
                    <div className="p-4 rounded-xl bg-slate-800/50 border border-slate-700/50">
                        <h3 className="text-sm font-medium text-white mb-3">Kolom Export (Detail)</h3>
                        <div className="grid grid-cols-2 gap-2 text-sm text-slate-400">
                            <span>• ID Karyawan</span>
                            <span>• Nama Karyawan</span>
                            <span>• Perusahaan</span>
                            <span>• Divisi</span>
                            <span>• Departemen</span>
                            <span>• Shift & Jam Shift</span>
                            <span>• Tanggal & Jam Order</span>
                            <span>• Status Pesanan</span>
                            <span>• Tanggal & Jam Ambil</span>
                            <span>• Diambil di Canteen</span>
                            <span>• Diproses Oleh (Admin)</span>
                            <span>• Alasan Batal</span>
                            <span>• Keterangan</span>
                        </div>
                        <p className="text-xs text-slate-500 mt-3">
                            * Laporan mencakup lokasi canteen, siapa yang memproses check-in, dan waktu detail pengambilan
                        </p>
                    </div>

                    {/* Export Button */}
                    <button
                        onClick={handleExport}
                        disabled={isExporting}
                        className="btn-primary w-full flex items-center justify-center gap-2"
                    >
                        {isExporting ? (
                            <>
                                <Loader2 className="w-5 h-5 animate-spin" />
                                Generating Export...
                            </>
                        ) : (
                            <>
                                <Download className="w-5 h-5" />
                                Export to Excel
                            </>
                        )}
                    </button>
                </div>
            </div>
        </div>
    );
}
