import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
    Upload,
    Download,
    FileDown,
    Plus,
    Camera,
    X,
    Users,
} from 'lucide-react';
import toast from 'react-hot-toast';
import Webcam from 'react-webcam';
import { api } from '../../contexts/AuthContext';
import { useSSERefresh, USER_EVENTS } from '../../contexts/SSEContext';
import {
    PageHeader,
    Button,
    DataTable,
    Pagination,
    Modal,
    Field,
    Input,
    Select,
    RoleBadge,
    Card,
} from '../../components/ui';
import type { DataTableColumn, DataTableFilter, DataTableBulkAction, DataTableRowAction } from '../../components/ui';

interface User {
    id: string;
    externalId: string;
    nik: string | null;
    name: string;
    email: string | null;
    company: string;
    division: string;
    department: string;
    departmentId: string | null;
    role: string;
    noShowCount: number;
    isBlacklisted: boolean;
    isActive: boolean;
    photo?: string;
    preferredCanteenId?: string | null;
    vendorId?: string | null;
    preferredCanteen?: {
        id: string;
        name: string;
        location: string | null;
    } | null;
}

interface Canteen {
    id: string;
    name: string;
    location: string | null;
    isActive: boolean;
}

interface Department {
    id: string;
    name: string;
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

function getInitials(name: string): string {
    const parts = name.trim().split(/\s+/);
    if (parts.length === 1) return parts[0].charAt(0).toUpperCase();
    return (parts[0].charAt(0) + parts[1].charAt(0)).toUpperCase();
}

export default function UserManagementPage() {
    const [users, setUsers] = useState<User[]>([]);
    const [total, setTotal] = useState(0);
    const [isLoading, setIsLoading] = useState(true);
    const [search, setSearch] = useState('');
    const [page, setPage] = useState(1);
    const [limit, setLimit] = useState(25);
    const [isUploading, setIsUploading] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const [companies, setCompanies] = useState<Company[]>([]);
    const [canteens, setCanteens] = useState<Canteen[]>([]);
    const [vendors, setVendors] = useState<{ id: string; name: string }[]>([]);

    // Filter state
    const [filterCompany, setFilterCompany] = useState('');
    const [filterDepartment, setFilterDepartment] = useState('');
    const [filterRole, setFilterRole] = useState('');
    const [filterStatus, setFilterStatus] = useState('all');

    // Selection & bulk modals
    const [selectedIds, setSelectedIds] = useState<string[]>([]);
    const [sortKey, setSortKey] = useState<string>('name');
    const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
    const [bulkActionModal, setBulkActionModal] = useState<'deactivate' | 'reset-strike' | 'reset-password' | null>(null);
    const [bulkPassword, setBulkPassword] = useState('');
    const [bulkReason, setBulkReason] = useState('');
    const [bulkNewPassword, setBulkNewPassword] = useState('');
    const [bulkSubmitting, setBulkSubmitting] = useState(false);

    // Edit/Add modal
    const [editingUser, setEditingUser] = useState<User | null>(null);
    const [showAddModal, setShowAddModal] = useState(false);
    const [photoPreview, setPhotoPreview] = useState<string | null>(null);
    const [photoFile, setPhotoFile] = useState<File | null>(null);
    const [showCamera, setShowCamera] = useState(false);
    const [savingUser, setSavingUser] = useState(false);
    const webcamRef = useRef<Webcam>(null);

    // Confirm modals
    const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string } | null>(null);
    const [deletePassword, setDeletePassword] = useState('');
    const [strikeResetTarget, setStrikeResetTarget] = useState<{ id: string; name: string; count: number } | null>(null);
    const [strikeResetForm, setStrikeResetForm] = useState({ password: '', reason: '', reduceBy: '' });
    const [passwordResetTarget, setPasswordResetTarget] = useState<{ id: string; name: string } | null>(null);
    const [newPasswordInput, setNewPasswordInput] = useState('');

    const [formData, setFormData] = useState({
        externalId: '',
        nik: '',
        name: '',
        email: '',
        departmentId: '',
        role: 'USER',
        password: '',
        preferredCanteenId: '',
        vendorId: '',
    });
    const [selectedCompany, setSelectedCompany] = useState('');
    const [selectedDivision, setSelectedDivision] = useState('');

    const loadUsers = useCallback(async () => {
        setIsLoading(true);
        try {
            const params = new URLSearchParams({
                page: page.toString(),
                limit: limit.toString(),
                status: filterStatus,
            });
            if (search) params.append('search', search);
            if (filterCompany) params.append('company', filterCompany);
            if (filterDepartment) params.append('department', filterDepartment);
            if (filterRole) params.append('role', filterRole);

            const res = await api.get(`/api/users?${params}`);
            setUsers(res.data.users || []);
            setTotal(res.data.pagination?.total || 0);
        } catch (error) {
            console.error('Failed to load users:', error);
            toast.error('Gagal memuat daftar pengguna');
        } finally {
            setIsLoading(false);
        }
    }, [page, limit, search, filterCompany, filterDepartment, filterRole, filterStatus]);

    const loadMeta = useCallback(async () => {
        try {
            const [cRes, canRes, vRes] = await Promise.all([
                api.get('/api/companies'),
                api.get('/api/canteens'),
                api.get('/api/vendors'),
            ]);
            setCompanies(cRes.data.companies || []);
            setCanteens(canRes.data.canteens || []);
            setVendors(vRes.data || []);
        } catch (error) {
            console.error('Failed to load metadata:', error);
        }
    }, []);

    useEffect(() => {
        loadUsers();
    }, [loadUsers]);

    useEffect(() => {
        loadMeta();
    }, [loadMeta]);

    useSSERefresh(USER_EVENTS, loadUsers);

    const downloadTemplate = async () => {
        try {
            const response = await api.get('/api/users/export/template', { responseType: 'blob' });
            const url = URL.createObjectURL(response.data);
            const a = document.createElement('a');
            a.href = url;
            a.download = 'user_import_template.xlsx';
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
            toast.success('Template diunduh');
        } catch {
            toast.error('Gagal mengunduh template');
        }
    };

    const handleExportCsv = () => {
        const headers = ['ID HRIS', 'NIK', 'Nama', 'Email', 'Perusahaan', 'Divisi', 'Departemen', 'Role', 'Strike', 'Status'];
        const lines = users.map((u) => [
            u.externalId,
            u.nik || '',
            u.name,
            u.email || '',
            u.company || '',
            u.division || '',
            u.department || '',
            u.role,
            u.noShowCount,
            u.isBlacklisted ? 'Diblokir' : u.isActive ? 'Aktif' : 'Nonaktif',
        ]);
        const csv = [headers, ...lines]
            .map((row) => row.map((v) => `"${String(v ?? '').replace(/"/g, '""')}"`).join(','))
            .join('\n');
        const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `pengguna-halaman-${page}.csv`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        toast.success('Daftar pengguna diekspor');
    };

    const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        const uploadData = new FormData();
        uploadData.append('file', file);
        setIsUploading(true);
        try {
            const res = await api.post('/api/users/import', uploadData, {
                headers: { 'Content-Type': 'multipart/form-data' },
            });
            toast.success(res.data.message);
            loadUsers();
        } catch (error) {
            toast.error((error as { response?: { data?: { error?: string } } })?.response?.data?.error || 'Gagal mengimpor pengguna');
        } finally {
            setIsUploading(false);
            if (fileInputRef.current) fileInputRef.current.value = '';
        }
    };

    const closeModal = () => {
        setEditingUser(null);
        setShowAddModal(false);
        setFormData({
            externalId: '',
            nik: '',
            name: '',
            email: '',
            departmentId: '',
            role: 'USER',
            password: '',
            preferredCanteenId: '',
            vendorId: '',
        });
        setPhotoPreview(null);
        setPhotoFile(null);
        setShowCamera(false);
        setSelectedCompany('');
        setSelectedDivision('');
    };

    const startEdit = (user: User) => {
        setEditingUser(user);
        setFormData({
            externalId: user.externalId,
            nik: user.nik || '',
            name: user.name,
            email: user.email || '',
            departmentId: user.departmentId || '',
            role: user.role,
            password: '',
            preferredCanteenId: user.preferredCanteenId || '',
            vendorId: user.vendorId || '',
        });
        const apiUrl = import.meta.env.VITE_API_URL || '';
        setPhotoPreview(user.photo ? `${apiUrl}${user.photo}` : null);
        setPhotoFile(null);

        if (user.departmentId) {
            for (const company of companies) {
                for (const division of company.divisions) {
                    const dept = division.departments.find((d) => d.id === user.departmentId);
                    if (dept) {
                        setSelectedCompany(company.id);
                        setSelectedDivision(division.id);
                        return;
                    }
                }
            }
        }
        setSelectedCompany('');
        setSelectedDivision('');
    };

    const openAddModal = () => {
        closeModal();
        setShowAddModal(true);
    };

    const saveUser = async () => {
        if (formData.nik && !/^\d+$/.test(formData.nik)) {
            toast.error('NIK harus berupa angka');
            return;
        }
        if (formData.role === 'VENDOR' && !formData.vendorId) {
            toast.error('Vendor wajib dipilih untuk role Vendor');
            return;
        }
        if (!editingUser && (!formData.externalId.trim() || !formData.name.trim())) {
            toast.error('ID Pengguna dan Nama wajib diisi');
            return;
        }

        setSavingUser(true);
        try {
            const data = new FormData();
            data.append('name', formData.name.trim());
            if (formData.nik) data.append('nik', formData.nik);
            if (formData.email) data.append('email', formData.email.trim());
            data.append('role', formData.role);

            if (formData.role === 'VENDOR') {
                data.append('company', 'VENDOR');
                data.append('division', 'VENDOR');
                data.append('department', 'VENDOR');
                data.append('vendorId', formData.vendorId);
            } else {
                if (formData.departmentId) data.append('departmentId', formData.departmentId);
                data.append('preferredCanteenId', formData.preferredCanteenId || '');
            }

            if (photoFile) data.append('photo', photoFile);

            if (editingUser) {
                await api.put(`/api/users/${editingUser.id}`, data, {
                    headers: { 'Content-Type': 'multipart/form-data' },
                });
                toast.success('Pengguna diperbarui');
            } else {
                data.append('externalId', formData.externalId.trim());
                data.append('password', formData.password || 'default123');
                await api.post('/api/users', data, {
                    headers: { 'Content-Type': 'multipart/form-data' },
                });
                toast.success('Pengguna ditambahkan');
            }
            closeModal();
            loadUsers();
        } catch (error) {
            toast.error((error as { response?: { data?: { error?: string } } })?.response?.data?.error || 'Gagal menyimpan pengguna');
        } finally {
            setSavingUser(false);
        }
    };

    const capturePhoto = useCallback(() => {
        const imageSrc = webcamRef.current?.getScreenshot();
        if (imageSrc) {
            setPhotoPreview(imageSrc);
            fetch(imageSrc)
                .then((res) => res.blob())
                .then((blob) => {
                    setPhotoFile(new File([blob], 'camera-capture.webp', { type: 'image/webp' }));
                });
            setShowCamera(false);
        }
    }, []);

    const toggleUserActive = async (user: User) => {
        const newStatus = !user.isActive;
        try {
            await api.put(`/api/users/${user.id}`, { isActive: newStatus });
            toast.success(newStatus ? `${user.name} diaktifkan` : `${user.name} dinonaktifkan`);
            loadUsers();
        } catch (error) {
            toast.error((error as { response?: { data?: { error?: string } } })?.response?.data?.error || 'Gagal mengubah status');
        }
    };

    const confirmDelete = async () => {
        if (!deleteTarget) return;
        if (!deletePassword) {
            toast.error('Masukkan password admin untuk konfirmasi');
            return;
        }
        try {
            await api.delete(`/api/users/${deleteTarget.id}`, { data: { password: deletePassword } });
            toast.success('Pengguna dihapus permanen');
            setDeleteTarget(null);
            setDeletePassword('');
            loadUsers();
        } catch (error) {
            toast.error((error as { response?: { data?: { error?: string } } })?.response?.data?.error || 'Gagal menghapus pengguna');
        }
    };

    const handleBulkExecute = async () => {
        const ids = selectedIds;
        if (ids.length === 0) return;

        if (bulkActionModal === 'reset-strike' && (!bulkPassword || bulkReason.trim().length < 5)) {
            toast.error('Password admin dan alasan wajib diisi');
            return;
        }
        if (bulkActionModal === 'reset-password' && !bulkNewPassword) {
            toast.error('Password baru wajib diisi');
            return;
        }

        setBulkSubmitting(true);
        let ok = 0;
        let fail = 0;
        for (const id of ids) {
            try {
                if (bulkActionModal === 'deactivate') {
                    await api.put(`/api/users/${id}`, { isActive: false });
                } else if (bulkActionModal === 'reset-strike') {
                    await api.post(`/api/blacklist/reset-strikes/${id}`, {
                        adminPassword: bulkPassword,
                        reason: bulkReason.trim(),
                    });
                } else if (bulkActionModal === 'reset-password') {
                    await api.post(`/api/users/${id}/reset-password`, {
                        newPassword: bulkNewPassword,
                    });
                }
                ok++;
            } catch {
                fail++;
            }
        }
        setBulkSubmitting(false);
        setBulkActionModal(null);
        setBulkPassword('');
        setBulkReason('');
        setBulkNewPassword('');
        setSelectedIds([]);
        toast.success(`${ok} berhasil diproses${fail > 0 ? `, ${fail} gagal` : ''}`);
        loadUsers();
    };

    const departmentOptions = useMemo(() => {
        const set = new Set<string>();
        const targetCompanies = filterCompany
            ? companies.filter((c) => c.name === filterCompany)
            : companies;
        targetCompanies.forEach((c) =>
            c.divisions.forEach((d) => d.departments.forEach((dept) => set.add(dept.name)))
        );
        return Array.from(set).sort().map((name) => ({ value: name, label: name }));
    }, [companies, filterCompany]);

    const filters: DataTableFilter[] = [
        {
            key: 'company',
            label: 'Semua perusahaan',
            value: filterCompany,
            onChange: (v) => {
                setFilterCompany(v);
                setFilterDepartment('');
                setPage(1);
            },
            options: companies.map((c) => ({ value: c.name, label: c.name })),
        },
        {
            key: 'department',
            label: 'Semua departemen',
            value: filterDepartment,
            onChange: (v) => {
                setFilterDepartment(v);
                setPage(1);
            },
            options: departmentOptions,
        },
        {
            key: 'role',
            label: 'Semua role',
            value: filterRole,
            onChange: (v) => {
                setFilterRole(v);
                setPage(1);
            },
            options: [
                { value: 'USER', label: 'Karyawan' },
                { value: 'CANTEEN', label: 'Operator Kantin' },
                { value: 'VENDOR', label: 'Vendor' },
                { value: 'ADMIN', label: 'Admin' },
            ],
        },
        {
            key: 'status',
            label: 'Semua status',
            value: filterStatus === 'all' ? '' : filterStatus,
            onChange: (v) => {
                setFilterStatus(v || 'all');
                setPage(1);
            },
            options: [
                { value: 'active', label: 'Aktif' },
                { value: 'inactive', label: 'Nonaktif' },
                { value: 'blacklisted', label: 'Diblokir' },
            ],
        },
    ];

    const bulkActions: DataTableBulkAction[] = [
        {
            label: 'Nonaktifkan',
            onClick: () => setBulkActionModal('deactivate'),
        },
        {
            label: 'Reset strike',
            onClick: () => setBulkActionModal('reset-strike'),
        },
        {
            label: 'Reset password',
            variant: 'danger',
            onClick: () => setBulkActionModal('reset-password'),
        },
    ];

    const sortedUsers = useMemo(() => {
        const copy = [...users];
        copy.sort((a, b) => {
            let cmp = 0;
            if (sortKey === 'name') cmp = a.name.localeCompare(b.name);
            else if (sortKey === 'company') cmp = (a.company || '').localeCompare(b.company || '');
            else if (sortKey === 'department') cmp = (a.department || '').localeCompare(b.department || '');
            else if (sortKey === 'strike') cmp = a.noShowCount - b.noShowCount;
            return sortDir === 'asc' ? cmp : -cmp;
        });
        return copy;
    }, [users, sortKey, sortDir]);

    const columns: DataTableColumn<User>[] = [
        {
            key: 'name',
            header: 'Nama',
            sortable: true,
            render: (u) => {
                const apiUrl = import.meta.env.VITE_API_URL || '';
                return (
                    <div className="flex items-center gap-2.5">
                        {u.photo ? (
                            <img
                                src={`${apiUrl}${u.photo}`}
                                alt=""
                                className="w-8 h-8 rounded-full object-cover border border-[#e7e5e4] flex-shrink-0"
                            />
                        ) : (
                            <div className="w-8 h-8 rounded-full bg-[#f5f5f4] text-[#57534e] text-[11px] font-bold flex items-center justify-center flex-shrink-0">
                                {getInitials(u.name)}
                            </div>
                        )}
                        <div className="min-w-0">
                            <div className="font-semibold text-[#1c1917] truncate">{u.name}</div>
                            <div className="text-[11.5px] font-mono text-[#78716c]">
                                {u.externalId}
                                {u.nik ? ` · ${u.nik}` : ''}
                            </div>
                        </div>
                    </div>
                );
            },
        },
        {
            key: 'company',
            header: 'Perusahaan',
            sortable: true,
            render: (u) => <span className="text-[#57534e]">{u.company || '-'}</span>,
        },
        {
            key: 'department',
            header: 'Departemen',
            sortable: true,
            render: (u) => <span className="text-[#57534e]">{u.department || '-'}</span>,
        },
        {
            key: 'role',
            header: 'Role',
            render: (u) => <RoleBadge role={u.role} />,
        },
        {
            key: 'strike',
            header: 'Strike',
            align: 'right',
            sortable: true,
            render: (u) => {
                const color =
                    u.noShowCount >= 3
                        ? 'text-[#b91c1c]'
                        : u.noShowCount >= 1
                            ? 'text-[#b45309]'
                            : 'text-[#a8a29e]';
                return <span className={`font-bold tabular-nums ${color}`}>{u.noShowCount}</span>;
            },
        },
        {
            key: 'status',
            header: 'Status',
            render: (u) => {
                if (u.isBlacklisted) {
                    return (
                        <span className="inline-flex items-center gap-1.5 text-[12.5px] font-semibold text-[#b91c1c]">
                            <span className="w-1.5 h-1.5 rounded-full bg-[#dc2626]" aria-hidden="true" />
                            Diblokir
                        </span>
                    );
                }
                if (!u.isActive) {
                    return (
                        <span className="inline-flex items-center gap-1.5 text-[12.5px] font-medium text-[#78716c]">
                            <span className="w-1.5 h-1.5 rounded-full bg-[#a8a29e]" aria-hidden="true" />
                            Nonaktif
                        </span>
                    );
                }
                return (
                    <span className="inline-flex items-center gap-1.5 text-[12.5px] font-semibold text-[#15803d]">
                        <span className="w-1.5 h-1.5 rounded-full bg-[#16a34a]" aria-hidden="true" />
                        Aktif
                    </span>
                );
            },
        },
    ];

    const rowActions: DataTableRowAction<User>[] = [
        { label: 'Edit', onClick: (u) => startEdit(u) },
        {
            label: 'Aktifkan',
            onClick: (u) => toggleUserActive(u),
            hidden: (u) => u.isActive,
        },
        {
            label: 'Nonaktifkan',
            onClick: (u) => toggleUserActive(u),
            hidden: (u) => !u.isActive,
        },
        {
            label: 'Reset strike',
            onClick: (u) => setStrikeResetTarget({ id: u.id, name: u.name, count: u.noShowCount }),
            hidden: (u) => u.noShowCount <= 0,
        },
        {
            label: 'Reset password',
            onClick: (u) => setPasswordResetTarget({ id: u.id, name: u.name }),
        },
        {
            label: 'Hapus permanen',
            danger: true,
            onClick: (u) => setDeleteTarget({ id: u.id, name: u.name }),
        },
    ];

    const currentCompany = companies.find((c) => c.id === selectedCompany);
    const currentDivision = currentCompany?.divisions.find((d) => d.id === selectedDivision);

    return (
        <div className="space-y-4">
            <PageHeader
                title="Pengguna"
                subtitle={`${total.toLocaleString('id-ID')} pengguna terdaftar`}
                actions={
                    <>
                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={downloadTemplate}
                            leftIcon={<FileDown className="w-3.5 h-3.5" aria-hidden="true" />}
                        >
                            Template
                        </Button>
                        <label className="inline-flex items-center gap-1.5 h-[34px] px-3 rounded-[9px] text-[13px] font-semibold bg-[#fff] hover:bg-[#fafaf9] text-[#1c1917] border border-[#e7e5e4] cursor-pointer transition-colors">
                            <Upload className="w-3.5 h-3.5" aria-hidden="true" />
                            <span>{isUploading ? 'Mengimpor...' : 'Impor Excel'}</span>
                            <input
                                ref={fileInputRef}
                                type="file"
                                accept=".xlsx"
                                onChange={handleFileUpload}
                                className="hidden"
                            />
                        </label>
                        <Button
                            variant="secondary"
                            size="sm"
                            onClick={handleExportCsv}
                            leftIcon={<Download className="w-3.5 h-3.5" aria-hidden="true" />}
                        >
                            Ekspor
                        </Button>
                        <Button
                            variant="primary"
                            size="sm"
                            onClick={openAddModal}
                            leftIcon={<Plus className="w-3.5 h-3.5" aria-hidden="true" />}
                        >
                            Tambah pengguna
                        </Button>
                    </>
                }
            />

            <Card padding="none">
                <DataTable
                    data={sortedUsers}
                    columns={columns}
                    getRowId={(u) => u.id}
                    loading={isLoading}
                    emptyTitle="Tidak ada pengguna ditemukan"
                    emptyDescription="Ubah kata kunci atau filter untuk melihat daftar pengguna."
                    searchValue={search}
                    onSearchChange={(v) => {
                        setSearch(v);
                        setPage(1);
                    }}
                    searchPlaceholder="Cari nama, ID, atau NIK..."
                    filters={filters}
                    onResetFilters={() => {
                        setSearch('');
                        setFilterCompany('');
                        setFilterDepartment('');
                        setFilterRole('');
                        setFilterStatus('all');
                        setPage(1);
                    }}
                    sortKey={sortKey}
                    sortDir={sortDir}
                    onSortChange={(k) => {
                        if (sortKey === k) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
                        else {
                            setSortKey(k);
                            setSortDir('asc');
                        }
                    }}
                    selectable
                    selectedIds={selectedIds}
                    onSelectionChange={setSelectedIds}
                    bulkActions={bulkActions}
                    rowActions={rowActions}
                    getRowLabel={(u) => u.name}
                    footer={
                        <Pagination
                            page={page}
                            limit={limit}
                            total={total}
                            onPageChange={setPage}
                            onLimitChange={(l) => {
                                setLimit(l);
                                setPage(1);
                            }}
                            variant="admin"
                            showJumpToPage
                        />
                    }
                />
            </Card>

            {/* Add / Edit User Modal */}
            <Modal
                open={Boolean(editingUser || showAddModal)}
                onClose={closeModal}
                title={editingUser ? 'Edit pengguna' : 'Tambah pengguna baru'}
                size="md"
                footer={
                    <>
                        <Button variant="secondary" onClick={closeModal}>
                            Batal
                        </Button>
                        <Button variant="primary" loading={savingUser} onClick={saveUser}>
                            {editingUser ? 'Simpan perubahan' : 'Buat pengguna'}
                        </Button>
                    </>
                }
            >
                <div className="space-y-4">
                    <div className="flex flex-col items-center gap-3 pb-2">
                        <div className="w-24 h-24 rounded-full overflow-hidden bg-[#f5f5f4] border border-[#e7e5e4] flex items-center justify-center">
                            {photoPreview ? (
                                <img src={photoPreview} alt="Foto pengguna" className="w-full h-full object-cover" />
                            ) : (
                                <Users className="w-9 h-9 text-[#a8a29e]" aria-hidden="true" />
                            )}
                        </div>
                        <div className="flex gap-2">
                            <label className="inline-flex items-center gap-1.5 h-[32px] px-3 rounded-[8px] text-[12.5px] font-semibold bg-[#fff] hover:bg-[#fafaf9] text-[#1c1917] border border-[#e7e5e4] cursor-pointer">
                                <Upload className="w-3.5 h-3.5" aria-hidden="true" />
                                Unggah foto
                                <input
                                    type="file"
                                    accept="image/*"
                                    onChange={(e) => {
                                        const file = e.target.files?.[0];
                                        if (file) {
                                            setPhotoFile(file);
                                            setPhotoPreview(URL.createObjectURL(file));
                                        }
                                    }}
                                    className="hidden"
                                />
                            </label>
                            <Button
                                type="button"
                                variant="secondary"
                                size="sm"
                                onClick={() => setShowCamera(true)}
                                leftIcon={<Camera className="w-3.5 h-3.5" aria-hidden="true" />}
                            >
                                Kamera
                            </Button>
                        </div>
                    </div>

                    {showCamera && (
                        <div className="fixed inset-0 bg-[#000]/90 z-[60] flex flex-col items-center justify-center p-4">
                            <div className="relative w-full max-w-md bg-[#000] rounded-[14px] overflow-hidden aspect-[3/4]">
                                <Webcam
                                    audio={false}
                                    ref={webcamRef}
                                    screenshotFormat="image/webp"
                                    className="w-full h-full object-cover"
                                    videoConstraints={{ facingMode: 'user' }}
                                />
                                <button
                                    type="button"
                                    aria-label="Tutup kamera"
                                    onClick={() => setShowCamera(false)}
                                    className="absolute top-3 right-3 p-2 bg-[#000]/60 text-[#fff] rounded-full border-0 cursor-pointer"
                                >
                                    <X className="w-5 h-5" />
                                </button>
                                <button
                                    type="button"
                                    aria-label="Ambil foto"
                                    onClick={capturePhoto}
                                    className="absolute bottom-5 left-1/2 -translate-x-1/2 w-14 h-14 bg-[#fff] rounded-full border-4 border-[#d6d3d1] cursor-pointer"
                                />
                            </div>
                        </div>
                    )}

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <Field label="ID Pengguna" required>
                            <Input
                                value={formData.externalId}
                                disabled={Boolean(editingUser)}
                                onChange={(e) => setFormData((f) => ({ ...f, externalId: e.target.value }))}
                            />
                        </Field>
                        <Field label="NIK" hint="Angka saja (opsional)">
                            <Input
                                value={formData.nik}
                                onChange={(e) =>
                                    setFormData((f) => ({ ...f, nik: e.target.value.replace(/\D/g, '') }))
                                }
                            />
                        </Field>
                    </div>

                    <Field label="Nama lengkap" required>
                        <Input
                            value={formData.name}
                            onChange={(e) => setFormData((f) => ({ ...f, name: e.target.value }))}
                        />
                    </Field>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <Field label="Email">
                            <Input
                                type="email"
                                value={formData.email}
                                onChange={(e) => setFormData((f) => ({ ...f, email: e.target.value }))}
                            />
                        </Field>
                        <Field label="Role" required>
                            <Select
                                value={formData.role}
                                onChange={(e) => setFormData((f) => ({ ...f, role: e.target.value }))}
                            >
                                <option value="USER">Karyawan</option>
                                <option value="CANTEEN">Operator Kantin</option>
                                <option value="VENDOR">Vendor</option>
                                <option value="ADMIN">Admin</option>
                            </Select>
                        </Field>
                    </div>

                    {formData.role !== 'VENDOR' ? (
                        <>
                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                                <Field label="Perusahaan">
                                    <Select
                                        value={selectedCompany}
                                        onChange={(e) => {
                                            setSelectedCompany(e.target.value);
                                            setSelectedDivision('');
                                            setFormData((f) => ({ ...f, departmentId: '' }));
                                        }}
                                    >
                                        <option value="">Pilih...</option>
                                        {companies.map((c) => (
                                            <option key={c.id} value={c.id}>
                                                {c.name}
                                            </option>
                                        ))}
                                    </Select>
                                </Field>
                                <Field label="Divisi">
                                    <Select
                                        value={selectedDivision}
                                        disabled={!selectedCompany}
                                        onChange={(e) => {
                                            setSelectedDivision(e.target.value);
                                            setFormData((f) => ({ ...f, departmentId: '' }));
                                        }}
                                    >
                                        <option value="">Pilih...</option>
                                        {currentCompany?.divisions.map((d) => (
                                            <option key={d.id} value={d.id}>
                                                {d.name}
                                            </option>
                                        ))}
                                    </Select>
                                </Field>
                                <Field label="Departemen">
                                    <Select
                                        value={formData.departmentId}
                                        disabled={!selectedDivision}
                                        onChange={(e) =>
                                            setFormData((f) => ({ ...f, departmentId: e.target.value }))
                                        }
                                    >
                                        <option value="">Pilih...</option>
                                        {currentDivision?.departments.map((d) => (
                                            <option key={d.id} value={d.id}>
                                                {d.name}
                                            </option>
                                        ))}
                                    </Select>
                                </Field>
                            </div>

                            <Field label="Kantin default">
                                <Select
                                    value={formData.preferredCanteenId}
                                    onChange={(e) =>
                                        setFormData((f) => ({ ...f, preferredCanteenId: e.target.value }))
                                    }
                                >
                                    <option value="">Tidak ada</option>
                                    {canteens
                                        .filter((c) => c.isActive)
                                        .map((c) => (
                                            <option key={c.id} value={c.id}>
                                                {c.name} {c.location ? `(${c.location})` : ''}
                                            </option>
                                        ))}
                                </Select>
                            </Field>
                        </>
                    ) : (
                        <Field label="Vendor" required>
                            <Select
                                value={formData.vendorId}
                                onChange={(e) => setFormData((f) => ({ ...f, vendorId: e.target.value }))}
                            >
                                <option value="">Pilih Vendor...</option>
                                {vendors.map((v) => (
                                    <option key={v.id} value={v.id}>
                                        {v.name}
                                    </option>
                                ))}
                            </Select>
                        </Field>
                    )}

                    {!editingUser && (
                        <Field label="Password awal" hint="Kosongkan untuk default: default123">
                            <Input
                                type="password"
                                value={formData.password}
                                onChange={(e) => setFormData((f) => ({ ...f, password: e.target.value }))}
                            />
                        </Field>
                    )}
                </div>
            </Modal>

            {/* Delete Confirmation Modal */}
            <Modal
                open={Boolean(deleteTarget)}
                onClose={() => {
                    setDeleteTarget(null);
                    setDeletePassword('');
                }}
                title="Hapus pengguna permanen"
                size="md"
                footer={
                    <>
                        <Button
                            variant="secondary"
                            onClick={() => {
                                setDeleteTarget(null);
                                setDeletePassword('');
                            }}
                        >
                            Batal
                        </Button>
                        <Button variant="danger" onClick={confirmDelete}>
                            Hapus permanen
                        </Button>
                    </>
                }
            >
                <div className="space-y-4">
                    <div className="px-3.5 py-2.5 rounded-[10px] bg-[#fef2f2] border border-[#fecaca] text-[13px] text-[#991b1b]">
                        Pengguna <b>{deleteTarget?.name}</b> beserta seluruh riwayat pesanannya akan dihapus permanen.
                    </div>
                    <Field label="Password admin (konfirmasi)" required>
                        <Input
                            type="password"
                            value={deletePassword}
                            onChange={(e) => setDeletePassword(e.target.value)}
                            placeholder="Masukkan password Anda"
                        />
                    </Field>
                </div>
            </Modal>

            {/* Single Strike Reset Modal */}
            <Modal
                open={Boolean(strikeResetTarget)}
                onClose={() => {
                    setStrikeResetTarget(null);
                    setStrikeResetForm({ password: '', reason: '', reduceBy: '' });
                }}
                title={`Reset strike — ${strikeResetTarget?.name || ''}`}
                size="md"
                footer={
                    <>
                        <Button
                            variant="secondary"
                            onClick={() => {
                                setStrikeResetTarget(null);
                                setStrikeResetForm({ password: '', reason: '', reduceBy: '' });
                            }}
                        >
                            Batal
                        </Button>
                        <Button
                            variant="primary"
                            onClick={async () => {
                                if (!strikeResetTarget) return;
                                try {
                                    await api.post(`/api/blacklist/reset-strikes/${strikeResetTarget.id}`, {
                                        adminPassword: strikeResetForm.password,
                                        reason: strikeResetForm.reason,
                                        reduceBy: strikeResetForm.reduceBy || undefined,
                                    });
                                    toast.success('Strike berhasil direset');
                                    setStrikeResetTarget(null);
                                    setStrikeResetForm({ password: '', reason: '', reduceBy: '' });
                                    loadUsers();
                                } catch (error) {
                                    toast.error((error as { response?: { data?: { error?: string } } })?.response?.data?.error || 'Gagal reset strike');
                                }
                            }}
                        >
                            Konfirmasi
                        </Button>
                    </>
                }
            >
                <div className="space-y-3">
                    <p className="text-[13px] text-[#57534e]">
                        Strike saat ini: <b className="text-[#b45309]">{strikeResetTarget?.count}</b>
                    </p>
                    <Field label="Password admin" required>
                        <Input
                            type="password"
                            value={strikeResetForm.password}
                            onChange={(e) => setStrikeResetForm((f) => ({ ...f, password: e.target.value }))}
                        />
                    </Field>
                    <Field label="Alasan" required>
                        <Input
                            value={strikeResetForm.reason}
                            onChange={(e) => setStrikeResetForm((f) => ({ ...f, reason: e.target.value }))}
                            placeholder="Alasan reset strike..."
                        />
                    </Field>
                    <Field label="Kurangi jumlah" hint="Kosongkan untuk reset ke 0">
                        <Input
                            type="number"
                            min={1}
                            max={strikeResetTarget?.count}
                            value={strikeResetForm.reduceBy}
                            onChange={(e) => setStrikeResetForm((f) => ({ ...f, reduceBy: e.target.value }))}
                        />
                    </Field>
                </div>
            </Modal>

            {/* Single Password Reset Modal */}
            <Modal
                open={Boolean(passwordResetTarget)}
                onClose={() => {
                    setPasswordResetTarget(null);
                    setNewPasswordInput('');
                }}
                title={`Reset password — ${passwordResetTarget?.name || ''}`}
                size="md"
                footer={
                    <>
                        <Button
                            variant="secondary"
                            onClick={() => {
                                setPasswordResetTarget(null);
                                setNewPasswordInput('');
                            }}
                        >
                            Batal
                        </Button>
                        <Button
                            variant="primary"
                            onClick={async () => {
                                if (!passwordResetTarget || !newPasswordInput) {
                                    toast.error('Password baru wajib diisi');
                                    return;
                                }
                                try {
                                    await api.post(`/api/users/${passwordResetTarget.id}/reset-password`, {
                                        newPassword: newPasswordInput,
                                    });
                                    toast.success(`Password ${passwordResetTarget.name} direset`);
                                    setPasswordResetTarget(null);
                                    setNewPasswordInput('');
                                } catch (error) {
                                    toast.error((error as { response?: { data?: { error?: string } } })?.response?.data?.error || 'Gagal reset password');
                                }
                            }}
                        >
                            Reset password
                        </Button>
                    </>
                }
            >
                <div className="space-y-3">
                    <p className="text-[13px] text-[#57534e]">
                        Pengguna wajib mengganti password saat login berikutnya.
                    </p>
                    <Field label="Password baru" required>
                        <Input
                            type="password"
                            value={newPasswordInput}
                            onChange={(e) => setNewPasswordInput(e.target.value)}
                            placeholder="Minimal 6 karakter"
                        />
                    </Field>
                </div>
            </Modal>

            {/* Bulk Action Modal */}
            <Modal
                open={Boolean(bulkActionModal)}
                onClose={() => setBulkActionModal(null)}
                title={
                    bulkActionModal === 'deactivate'
                        ? `Nonaktifkan ${selectedIds.length} pengguna?`
                        : bulkActionModal === 'reset-strike'
                            ? `Reset strike ${selectedIds.length} pengguna`
                            : `Reset password ${selectedIds.length} pengguna`
                }
                size="md"
                footer={
                    <>
                        <Button variant="secondary" onClick={() => setBulkActionModal(null)}>
                            Batal
                        </Button>
                        <Button
                            variant={bulkActionModal === 'reset-password' ? 'danger' : 'primary'}
                            loading={bulkSubmitting}
                            onClick={handleBulkExecute}
                        >
                            Jalankan ({selectedIds.length})
                        </Button>
                    </>
                }
            >
                <div className="space-y-3">
                    {bulkActionModal === 'deactivate' && (
                        <p className="text-[13px] text-[#57534e]">
                            Seluruh pengguna yang dipilih akan dinonaktifkan dan tidak dapat memesan makanan hingga diaktifkan kembali.
                        </p>
                    )}
                    {bulkActionModal === 'reset-strike' && (
                        <>
                            <Field label="Password admin" required>
                                <Input
                                    type="password"
                                    value={bulkPassword}
                                    onChange={(e) => setBulkPassword(e.target.value)}
                                />
                            </Field>
                            <Field label="Alasan" required>
                                <Input
                                    value={bulkReason}
                                    onChange={(e) => setBulkReason(e.target.value)}
                                    placeholder="Alasan reset strike massal..."
                                />
                            </Field>
                        </>
                    )}
                    {bulkActionModal === 'reset-password' && (
                        <Field label="Password baru untuk semua yang dipilih" required>
                            <Input
                                type="password"
                                value={bulkNewPassword}
                                onChange={(e) => setBulkNewPassword(e.target.value)}
                                placeholder="Masukkan password baru"
                            />
                        </Field>
                    )}
                </div>
            </Modal>
        </div>
    );
}
