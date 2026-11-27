import { useState, useEffect, useCallback } from 'react';
import {
    Building2,
    ChevronDown,
    ChevronRight,
    Plus,
    Edit2,
    Trash2,
    Save,
    Clock,
    Calendar,
    FileSpreadsheet,
    Upload,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { api } from '../../contexts/AuthContext';
import { useSSERefresh, SHIFT_EVENTS } from '../../contexts/SSEContext';
import {
    PageHeader,
    Button,
    Card,
    Badge,
    Modal,
    Input,
    EmptyState,
    Skeleton,
} from '../../components/ui';

interface Shift {
    id: string;
    name: string;
    startTime: string;
    endTime: string;
    isActive?: boolean;
}

interface DepartmentShift {
    shift: Shift;
}

interface Department {
    id: string;
    name: string;
    defaultShiftId: string | null;
    workDays: string;
    defaultShift: Shift | null;
    allowedShifts: DepartmentShift[];
    _count: { users: number };
}

interface Division {
    id: string;
    name: string;
    departments: Department[];
}

interface Company {
    id: string;
    name: string;
    divisions: Division[];
}

const DAYS = [
    { value: '0', label: 'Min' },
    { value: '1', label: 'Sen' },
    { value: '2', label: 'Sel' },
    { value: '3', label: 'Rab' },
    { value: '4', label: 'Kam' },
    { value: '5', label: 'Jum' },
    { value: '6', label: 'Sab' },
];

export default function CompanyManagementPage() {
    const [companies, setCompanies] = useState<Company[]>([]);
    const [shifts, setShifts] = useState<Shift[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [expandedCompanies, setExpandedCompanies] = useState<Set<string>>(new Set());
    const [expandedDivisions, setExpandedDivisions] = useState<Set<string>>(new Set());

    const [showAddCompany, setShowAddCompany] = useState(false);
    const [showAddDivision, setShowAddDivision] = useState<string | null>(null);
    const [showAddDepartment, setShowAddDepartment] = useState<string | null>(null);
    const [editingDepartment, setEditingDepartment] = useState<Department | null>(null);
    const [deleteConfirm, setDeleteConfirm] = useState<{
        type: 'company' | 'division' | 'department';
        id: string;
        name: string;
    } | null>(null);
    const [showMigrateConfirm, setShowMigrateConfirm] = useState(false);

    const [newName, setNewName] = useState('');
    const [editWorkDays, setEditWorkDays] = useState<string[]>([]);
    const [editShiftIds, setEditShiftIds] = useState<string[]>([]);

    const loadData = useCallback(async () => {
        try {
            const [companiesRes, shiftsRes] = await Promise.all([
                api.get('/api/companies'),
                api.get('/api/shifts'),
            ]);
            setCompanies(companiesRes.data.companies || []);
            setShifts((shiftsRes.data.shifts || []).filter(Boolean));
        } catch (error) {
            console.error('Failed to load data:', error);
            toast.error('Gagal memuat data struktur organisasi');
        } finally {
            setIsLoading(false);
        }
    }, []);

    useEffect(() => {
        loadData();
    }, [loadData]);

    useSSERefresh(SHIFT_EVENTS, loadData);

    const toggleCompany = (id: string) => {
        setExpandedCompanies((prev) => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    };

    const toggleDivision = (id: string) => {
        setExpandedDivisions((prev) => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    };

    const createCompany = async () => {
        if (!newName.trim()) return;
        try {
            await api.post('/api/companies', { name: newName.trim() });
            toast.success('Perusahaan ditambahkan');
            setNewName('');
            setShowAddCompany(false);
            loadData();
        } catch (error: any) {
            toast.error(error.response?.data?.error || 'Gagal membuat perusahaan');
        }
    };

    const createDivision = async (companyId: string) => {
        if (!newName.trim()) return;
        try {
            await api.post(`/api/companies/${companyId}/divisions`, { name: newName.trim() });
            toast.success('Divisi ditambahkan');
            setNewName('');
            setShowAddDivision(null);
            loadData();
        } catch (error: any) {
            toast.error(error.response?.data?.error || 'Gagal membuat divisi');
        }
    };

    const createDepartment = async (divisionId: string) => {
        if (!newName.trim()) return;
        try {
            await api.post(`/api/companies/divisions/${divisionId}/departments`, {
                name: newName.trim(),
                workDays: '1,2,3,4,5',
            });
            toast.success('Departemen ditambahkan');
            setNewName('');
            setShowAddDepartment(null);
            loadData();
        } catch (error: any) {
            toast.error(error.response?.data?.error || 'Gagal membuat departemen');
        }
    };

    const executeDelete = async () => {
        if (!deleteConfirm) return;
        try {
            if (deleteConfirm.type === 'company') {
                await api.delete(`/api/companies/${deleteConfirm.id}`);
                toast.success('Perusahaan dihapus');
            } else if (deleteConfirm.type === 'division') {
                await api.delete(`/api/companies/divisions/${deleteConfirm.id}`);
                toast.success('Divisi dihapus');
            } else {
                await api.delete(`/api/companies/departments/${deleteConfirm.id}`);
                toast.success('Departemen dihapus');
            }
            setDeleteConfirm(null);
            loadData();
        } catch (error: any) {
            toast.error(error.response?.data?.error || 'Gagal menghapus');
        }
    };

    const startEditDepartment = (dept: Department) => {
        setEditingDepartment(dept);
        setEditWorkDays(dept.workDays.split(',').filter(Boolean));
        setEditShiftIds(dept.allowedShifts?.map((ds) => ds.shift.id) || []);
    };

    const saveDepartment = async () => {
        if (!editingDepartment) return;
        try {
            await api.put(`/api/companies/departments/${editingDepartment.id}`, {
                workDays: editWorkDays.join(','),
                shiftIds: editShiftIds,
            });
            toast.success('Departemen diperbarui');
            setEditingDepartment(null);
            loadData();
        } catch (error: any) {
            toast.error(error.response?.data?.error || 'Gagal memperbarui departemen');
        }
    };

    const toggleWorkDay = (day: string) => {
        setEditWorkDays((prev) =>
            prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day].sort()
        );
    };

    const migrateFromUsers = async () => {
        try {
            const res = await api.post('/api/companies/migrate-from-users');
            toast.success(
                `Sinkronisasi selesai: ${res.data.results.companiesCreated} perusahaan, ${res.data.results.divisionsCreated} divisi, ${res.data.results.departmentsCreated} departemen`
            );
            setShowMigrateConfirm(false);
            loadData();
        } catch (error: any) {
            toast.error(error.response?.data?.error || 'Gagal menyinkronkan dari data pengguna');
        }
    };

    const downloadTemplate = async () => {
        try {
            const response = await api.get('/api/companies/export/template', { responseType: 'blob' });
            const url = window.URL.createObjectURL(response.data);
            const a = document.createElement('a');
            a.href = url;
            a.download = 'company_migration_template.xlsx';
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            window.URL.revokeObjectURL(url);
            toast.success('Template diunduh');
        } catch {
            toast.error('Gagal mengunduh template');
        }
    };

    if (isLoading) {
        return (
            <div className="space-y-4">
                <Skeleton className="h-9 w-64" />
                <Skeleton className="h-28 w-full" />
                <Skeleton className="h-28 w-full" />
            </div>
        );
    }

    return (
        <div className="space-y-4">
            <PageHeader
                title="Perusahaan & departemen"
                subtitle="Kelola hierarki perusahaan, divisi, departemen, hari kerja, dan shift yang diizinkan"
                actions={
                    <>
                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setShowMigrateConfirm(true)}
                            leftIcon={<Building2 className="w-3.5 h-3.5" aria-hidden="true" />}
                        >
                            Tarik dari pengguna
                        </Button>
                        <Button
                            variant="secondary"
                            size="sm"
                            onClick={downloadTemplate}
                            leftIcon={<FileSpreadsheet className="w-3.5 h-3.5" aria-hidden="true" />}
                        >
                            Template
                        </Button>
                        <label className="inline-flex items-center gap-1.5 h-[34px] px-3 rounded-[9px] text-[13px] font-semibold bg-[#fff] hover:bg-[#fafaf9] text-[#1c1917] border border-[#e7e5e4] cursor-pointer">
                            <Upload className="w-3.5 h-3.5" aria-hidden="true" />
                            <span>Impor Excel</span>
                            <input
                                type="file"
                                accept=".xlsx"
                                className="hidden"
                                onChange={async (e) => {
                                    const file = e.target.files?.[0];
                                    if (!file) return;
                                    const fd = new FormData();
                                    fd.append('file', file);
                                    const toastId = toast.loading('Mengimpor...');
                                    try {
                                        const res = await api.post('/api/companies/import', fd);
                                        toast.success(
                                            `Terimpor: ${res.data.results.companiesCreated} perusahaan, ${res.data.results.divisionsCreated} divisi, ${res.data.results.departmentsCreated} departemen`,
                                            { id: toastId }
                                        );
                                        loadData();
                                    } catch (error: any) {
                                        toast.error(error.response?.data?.error || 'Gagal mengimpor', { id: toastId });
                                    }
                                    e.target.value = '';
                                }}
                            />
                        </label>
                        <Button
                            variant="primary"
                            size="sm"
                            onClick={() => {
                                setNewName('');
                                setShowAddCompany(true);
                            }}
                            leftIcon={<Plus className="w-3.5 h-3.5" aria-hidden="true" />}
                        >
                            Tambah perusahaan
                        </Button>
                    </>
                }
            />

            {showAddCompany && (
                <Card padding="sm">
                    <div className="flex flex-wrap items-center gap-2.5">
                        <Input
                            placeholder="Nama perusahaan baru..."
                            value={newName}
                            onChange={(e) => setNewName(e.target.value)}
                            onKeyDown={(e) => e.key === 'Enter' && createCompany()}
                            className="flex-1 min-w-[200px]"
                            autoFocus
                        />
                        <Button variant="primary" size="sm" onClick={createCompany} leftIcon={<Save className="w-3.5 h-3.5" />}>
                            Simpan
                        </Button>
                        <Button
                            variant="secondary"
                            size="sm"
                            onClick={() => {
                                setShowAddCompany(false);
                                setNewName('');
                            }}
                        >
                            Batal
                        </Button>
                    </div>
                </Card>
            )}

            {companies.length === 0 ? (
                <Card>
                    <EmptyState
                        icon={<Building2 className="w-6 h-6" />}
                        title="Belum ada data perusahaan"
                        description="Buat perusahaan baru atau tarik otomatis dari data pengguna yang sudah terdaftar."
                    />
                </Card>
            ) : (
                <div className="space-y-3">
                    {companies.map((company) => {
                        const expanded = expandedCompanies.has(company.id);
                        return (
                            <Card key={company.id} padding="none">
                                <div className="flex items-center justify-between px-4 py-3 bg-[#fafaf9]">
                                    <button
                                        type="button"
                                        onClick={() => toggleCompany(company.id)}
                                        className="flex items-center gap-2.5 flex-1 text-left bg-transparent border-0 cursor-pointer p-0"
                                    >
                                        {expanded ? (
                                            <ChevronDown className="w-4 h-4 text-[#b45309]" />
                                        ) : (
                                            <ChevronRight className="w-4 h-4 text-[#78716c]" />
                                        )}
                                        <Building2 className="w-4 h-4 text-[#b45309]" />
                                        <span className="text-[14.5px] font-bold text-[#1c1917]">{company.name}</span>
                                        <Badge variant="neutral">{company.divisions.length} divisi</Badge>
                                    </button>
                                    <div className="flex items-center gap-1">
                                        <Button
                                            variant="ghost"
                                            size="sm"
                                            onClick={() => {
                                                setNewName('');
                                                setShowAddDivision(company.id);
                                                if (!expanded) toggleCompany(company.id);
                                            }}
                                            leftIcon={<Plus className="w-3.5 h-3.5" />}
                                        >
                                            Divisi
                                        </Button>
                                        <Button
                                            variant="ghost"
                                            size="sm"
                                            aria-label={`Hapus ${company.name}`}
                                            onClick={() =>
                                                setDeleteConfirm({ type: 'company', id: company.id, name: company.name })
                                            }
                                        >
                                            <Trash2 className="w-3.5 h-3.5 text-[#b91c1c]" />
                                        </Button>
                                    </div>
                                </div>

                                {expanded && (
                                    <div className="border-t border-[#e7e5e4]">
                                        {showAddDivision === company.id && (
                                            <div className="px-4 py-3 pl-10 bg-[#fffbeb]/50 border-b border-[#f5f5f4] flex flex-wrap items-center gap-2">
                                                <Input
                                                    placeholder="Nama divisi baru..."
                                                    value={newName}
                                                    onChange={(e) => setNewName(e.target.value)}
                                                    onKeyDown={(e) => e.key === 'Enter' && createDivision(company.id)}
                                                    className="flex-1 min-w-[200px]"
                                                    autoFocus
                                                />
                                                <Button variant="primary" size="sm" onClick={() => createDivision(company.id)}>
                                                    Simpan
                                                </Button>
                                                <Button
                                                    variant="secondary"
                                                    size="sm"
                                                    onClick={() => {
                                                        setShowAddDivision(null);
                                                        setNewName('');
                                                    }}
                                                >
                                                    Batal
                                                </Button>
                                            </div>
                                        )}

                                        {company.divisions.length === 0 ? (
                                            <div className="px-4 py-4 pl-10 text-[13px] text-[#78716c]">
                                                Belum ada divisi
                                            </div>
                                        ) : (
                                            company.divisions.map((division) => {
                                                const divExpanded = expandedDivisions.has(division.id);
                                                return (
                                                    <div key={division.id} className="border-b border-[#f5f5f4] last:border-b-0">
                                                        <div className="flex items-center justify-between px-4 py-2.5 pl-9 hover:bg-[#fafaf9]">
                                                            <button
                                                                type="button"
                                                                onClick={() => toggleDivision(division.id)}
                                                                className="flex items-center gap-2 flex-1 text-left bg-transparent border-0 cursor-pointer p-0"
                                                            >
                                                                {divExpanded ? (
                                                                    <ChevronDown className="w-4 h-4 text-[#b45309]" />
                                                                ) : (
                                                                    <ChevronRight className="w-4 h-4 text-[#78716c]" />
                                                                )}
                                                                <span className="text-[13.5px] font-semibold text-[#1c1917]">
                                                                    {division.name}
                                                                </span>
                                                                <span className="text-[12px] text-[#78716c]">
                                                                    ({division.departments.length} departemen)
                                                                </span>
                                                            </button>
                                                            <div className="flex items-center gap-1">
                                                                <Button
                                                                    variant="ghost"
                                                                    size="sm"
                                                                    onClick={() => {
                                                                        setNewName('');
                                                                        setShowAddDepartment(division.id);
                                                                        if (!divExpanded) toggleDivision(division.id);
                                                                    }}
                                                                    leftIcon={<Plus className="w-3.5 h-3.5" />}
                                                                >
                                                                    Dept
                                                                </Button>
                                                                <Button
                                                                    variant="ghost"
                                                                    size="sm"
                                                                    aria-label={`Hapus divisi ${division.name}`}
                                                                    onClick={() =>
                                                                        setDeleteConfirm({
                                                                            type: 'division',
                                                                            id: division.id,
                                                                            name: division.name,
                                                                        })
                                                                    }
                                                                >
                                                                    <Trash2 className="w-3.5 h-3.5 text-[#b91c1c]" />
                                                                </Button>
                                                            </div>
                                                        </div>

                                                        {divExpanded && (
                                                            <div className="bg-[#fafaf9]/70 border-t border-[#f5f5f4]">
                                                                {showAddDepartment === division.id && (
                                                                    <div className="px-4 py-2.5 pl-14 border-b border-[#f5f5f4] flex flex-wrap items-center gap-2">
                                                                        <Input
                                                                            placeholder="Nama departemen baru..."
                                                                            value={newName}
                                                                            onChange={(e) => setNewName(e.target.value)}
                                                                            onKeyDown={(e) =>
                                                                                e.key === 'Enter' && createDepartment(division.id)
                                                                            }
                                                                            className="flex-1 min-w-[200px]"
                                                                            autoFocus
                                                                        />
                                                                        <Button
                                                                            variant="primary"
                                                                            size="sm"
                                                                            onClick={() => createDepartment(division.id)}
                                                                        >
                                                                            Simpan
                                                                        </Button>
                                                                        <Button
                                                                            variant="secondary"
                                                                            size="sm"
                                                                            onClick={() => {
                                                                                setShowAddDepartment(null);
                                                                                setNewName('');
                                                                            }}
                                                                        >
                                                                            Batal
                                                                        </Button>
                                                                    </div>
                                                                )}

                                                                {division.departments.length === 0 ? (
                                                                    <div className="px-4 py-3 pl-14 text-[12.5px] text-[#78716c]">
                                                                        Belum ada departemen
                                                                    </div>
                                                                ) : (
                                                                    division.departments.map((dept) => (
                                                                        <div
                                                                            key={dept.id}
                                                                            className="px-4 py-3 pl-14 border-b border-[#f5f5f4] last:border-b-0"
                                                                        >
                                                                            {editingDepartment?.id === dept.id ? (
                                                                                <div className="space-y-3 bg-[#fff] p-3 rounded-[10px] border border-[#e7e5e4]">
                                                                                    <div className="font-semibold text-[13.5px] text-[#1c1917]">
                                                                                        {dept.name} ({dept._count.users} pengguna)
                                                                                    </div>
                                                                                    <div>
                                                                                        <div className="text-[12px] font-semibold text-[#57534e] mb-1.5">
                                                                                            Hari kerja
                                                                                        </div>
                                                                                        <div className="flex flex-wrap gap-1.5">
                                                                                            {DAYS.map((day) => {
                                                                                                const on = editWorkDays.includes(day.value);
                                                                                                return (
                                                                                                    <button
                                                                                                        key={day.value}
                                                                                                        type="button"
                                                                                                        onClick={() => toggleWorkDay(day.value)}
                                                                                                        className={`h-8 px-3 rounded-[8px] text-[12px] font-semibold border cursor-pointer ${
                                                                                                            on
                                                                                                                ? 'bg-[#f59e0b] text-[#1c1917] border-[#f59e0b]'
                                                                                                                : 'bg-[#fff] text-[#57534e] border-[#e7e5e4]'
                                                                                                        }`}
                                                                                                    >
                                                                                                        {day.label}
                                                                                                    </button>
                                                                                                );
                                                                                            })}
                                                                                        </div>
                                                                                    </div>

                                                                                    <div>
                                                                                        <div className="text-[12px] font-semibold text-[#57534e] mb-1.5">
                                                                                            Shift yang diizinkan (kosong = semua aktif)
                                                                                        </div>
                                                                                        <div className="flex flex-wrap gap-1.5">
                                                                                            {shifts
                                                                                                .filter((s) => s.isActive !== false)
                                                                                                .map((shift) => {
                                                                                                    const on = editShiftIds.includes(shift.id);
                                                                                                    return (
                                                                                                        <button
                                                                                                            key={shift.id}
                                                                                                            type="button"
                                                                                                            onClick={() =>
                                                                                                                setEditShiftIds((prev) =>
                                                                                                                    prev.includes(shift.id)
                                                                                                                        ? prev.filter((id) => id !== shift.id)
                                                                                                                        : [...prev, shift.id]
                                                                                                                )
                                                                                                            }
                                                                                                            className={`h-8 px-3 rounded-[8px] text-[12px] font-semibold border cursor-pointer ${
                                                                                                                on
                                                                                                                    ? 'bg-[#f59e0b] text-[#1c1917] border-[#f59e0b]'
                                                                                                                    : 'bg-[#fff] text-[#57534e] border-[#e7e5e4]'
                                                                                                            }`}
                                                                                                        >
                                                                                                            {shift.name} ({shift.startTime}–{shift.endTime})
                                                                                                        </button>
                                                                                                    );
                                                                                                })}
                                                                                        </div>
                                                                                    </div>

                                                                                    <div className="flex gap-2">
                                                                                        <Button variant="primary" size="sm" onClick={saveDepartment}>
                                                                                            Simpan
                                                                                        </Button>
                                                                                        <Button
                                                                                            variant="secondary"
                                                                                            size="sm"
                                                                                            onClick={() => setEditingDepartment(null)}
                                                                                        >
                                                                                            Batal
                                                                                        </Button>
                                                                                    </div>
                                                                                </div>
                                                                            ) : (
                                                                                <div className="flex flex-wrap items-center justify-between gap-2">
                                                                                    <div>
                                                                                        <div className="text-[13px] font-semibold text-[#1c1917]">
                                                                                            {dept.name}
                                                                                        </div>
                                                                                        <div className="flex flex-wrap items-center gap-3 mt-1 text-[11.5px] text-[#78716c]">
                                                                                            <span>{dept._count.users} pengguna</span>
                                                                                            {dept.allowedShifts && dept.allowedShifts.length > 0 && (
                                                                                                <span className="inline-flex items-center gap-1 text-[#b45309] font-medium">
                                                                                                    <Clock className="w-3 h-3" aria-hidden="true" />
                                                                                                    {dept.allowedShifts.map((ds) => ds.shift.name).join(', ')}
                                                                                                </span>
                                                                                            )}
                                                                                            <span className="inline-flex items-center gap-1">
                                                                                                <Calendar className="w-3 h-3" aria-hidden="true" />
                                                                                                {dept.workDays
                                                                                                    .split(',')
                                                                                                    .map((d) => DAYS.find((x) => x.value === d)?.label)
                                                                                                    .filter(Boolean)
                                                                                                    .join(', ')}
                                                                                            </span>
                                                                                        </div>
                                                                                    </div>
                                                                                    <div className="flex items-center gap-1">
                                                                                        <Button
                                                                                            variant="ghost"
                                                                                            size="sm"
                                                                                            aria-label={`Edit ${dept.name}`}
                                                                                            onClick={() => startEditDepartment(dept)}
                                                                                        >
                                                                                            <Edit2 className="w-3.5 h-3.5" />
                                                                                        </Button>
                                                                                        <Button
                                                                                            variant="ghost"
                                                                                            size="sm"
                                                                                            aria-label={`Hapus ${dept.name}`}
                                                                                            onClick={() =>
                                                                                                setDeleteConfirm({
                                                                                                    type: 'department',
                                                                                                    id: dept.id,
                                                                                                    name: dept.name,
                                                                                                })
                                                                                            }
                                                                                        >
                                                                                            <Trash2 className="w-3.5 h-3.5 text-[#b91c1c]" />
                                                                                        </Button>
                                                                                    </div>
                                                                                </div>
                                                                            )}
                                                                        </div>
                                                                    ))
                                                                )}
                                                            </div>
                                                        )}
                                                    </div>
                                                );
                                            })
                                        )}
                                    </div>
                                )}
                            </Card>
                        );
                    })}
                </div>
            )}

            {/* Delete Confirm Modal */}
            <Modal
                open={Boolean(deleteConfirm)}
                onClose={() => setDeleteConfirm(null)}
                title="Hapus struktur organisasi?"
                size="sm"
                footer={
                    <>
                        <Button variant="secondary" onClick={() => setDeleteConfirm(null)}>
                            Batal
                        </Button>
                        <Button variant="danger" onClick={executeDelete}>
                            Hapus
                        </Button>
                    </>
                }
            >
                <p className="text-[13.5px] text-[#57534e]">
                    Hapus <b>{deleteConfirm?.name}</b> beserta seluruh sub-unit di bawahnya?
                </p>
            </Modal>

            {/* Migrate from users Modal */}
            <Modal
                open={showMigrateConfirm}
                onClose={() => setShowMigrateConfirm(false)}
                title="Tarik struktur dari data pengguna?"
                size="sm"
                footer={
                    <>
                        <Button variant="secondary" onClick={() => setShowMigrateConfirm(false)}>
                            Batal
                        </Button>
                        <Button variant="primary" onClick={migrateFromUsers}>
                            Sinkronkan
                        </Button>
                    </>
                }
            >
                <p className="text-[13.5px] text-[#57534e]">
                    Sistem akan membuat entri perusahaan, divisi, dan departemen otomatis dari profil pengguna yang sudah ada.
                </p>
            </Modal>
        </div>
    );
}
