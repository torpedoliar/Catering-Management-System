import { useState } from 'react';
import { FileDown, Calendar } from 'lucide-react';
import toast from 'react-hot-toast';
import { api } from '../../contexts/AuthContext';
import { getLocalDateString, addDays } from '../../utils/dateHelpers';
import {
    PageHeader,
    Button,
    Card,
    Field,
    Input,
    Select,
} from '../../components/ui';

export default function ExportPage() {
    const [startDate, setStartDate] = useState(() => addDays(getLocalDateString(), -30));
    const [endDate, setEndDate] = useState(() => getLocalDateString());
    const [status, setStatus] = useState('');
    const [isExporting, setIsExporting] = useState(false);

    const handleExport = async () => {
        setIsExporting(true);
        try {
            const params = new URLSearchParams();
            if (startDate) params.append('startDate', startDate);
            if (endDate) params.append('endDate', endDate);
            if (status) params.append('status', status);

            const response = await api.get(`/api/orders/export?${params}`, {
                responseType: 'blob',
            });

            const filename = `transaksi_${startDate}_${endDate}.xlsx`;
            const url = URL.createObjectURL(response.data);
            const a = document.createElement('a');
            a.href = url;
            a.download = filename;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
            toast.success('Ekspor berhasil diunduh');
        } catch (error) {
            console.error('Export error:', error);
            toast.error('Gagal mengekspor transaksi');
        } finally {
            setIsExporting(false);
        }
    };

    const setPreset = (days: number) => {
        const today = getLocalDateString();
        setStartDate(days === 0 ? today : addDays(today, -days));
        setEndDate(today);
    };

    return (
        <div className="space-y-4 max-w-4xl">
            <PageHeader
                title="Ekspor transaksi"
                subtitle="Unduh riwayat pemesanan makanan dalam format Excel (.xlsx)"
            />

            <Card>
                <div className="space-y-5">
                    <div className="flex flex-wrap items-center gap-2">
                        <span className="text-[12.5px] font-semibold text-[#57534e] mr-1">Preset cepat:</span>
                        {[
                            { label: 'Hari ini', days: 0 },
                            { label: '7 hari terakhir', days: 6 },
                            { label: '30 hari terakhir', days: 30 },
                        ].map((p) => (
                            <Button
                                key={p.label}
                                variant="secondary"
                                size="sm"
                                onClick={() => setPreset(p.days)}
                            >
                                {p.label}
                            </Button>
                        ))}
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <Field label="Tanggal mulai" required>
                            <Input
                                type="date"
                                value={startDate}
                                onChange={(e) => setStartDate(e.target.value)}
                                leftIcon={<Calendar className="w-4 h-4" aria-hidden="true" />}
                            />
                        </Field>
                        <Field label="Tanggal selesai" required>
                            <Input
                                type="date"
                                value={endDate}
                                onChange={(e) => setEndDate(e.target.value)}
                                leftIcon={<Calendar className="w-4 h-4" aria-hidden="true" />}
                            />
                        </Field>
                    </div>

                    <Field label="Filter status">
                        <Select value={status} onChange={(e) => setStatus(e.target.value)}>
                            <option value="">Semua status</option>
                            <option value="PICKED_UP">Sudah diambil (PICKED_UP)</option>
                            <option value="ORDERED">Menunggu (ORDERED)</option>
                            <option value="NO_SHOW">Tidak diambil (NO_SHOW)</option>
                            <option value="CANCELLED">Dibatalkan (CANCELLED)</option>
                        </Select>
                    </Field>

                    <div className="flex justify-end pt-2 border-t border-[#f5f5f4]">
                        <Button
                            variant="primary"
                            loading={isExporting}
                            loadingText="Menyiapkan file..."
                            onClick={handleExport}
                            leftIcon={<FileDown className="w-4 h-4" aria-hidden="true" />}
                        >
                            Unduh laporan Excel
                        </Button>
                    </div>
                </div>
            </Card>
        </div>
    );
}
