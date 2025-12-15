import { useState, useEffect, useCallback } from 'react';
import { api } from '../../contexts/AuthContext';
import { useSSERefresh, SHIFT_EVENTS } from '../../contexts/SSEContext';
import { Building2, ChevronDown, ChevronRight, Plus, Edit2, Trash2, Save, X, Loader2, Clock, Calendar, FileSpreadsheet, Upload } from 'lucide-react';
import toast from 'react-hot-toast';

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
    { value: '0', label: 'Min', fullLabel: 'Minggu' },
    { value: '1', label: 'Sen', fullLabel: 'Senin' },
    { value: '2', label: 'Sel', fullLabel: 'Selasa' },
    { value: '3', label: 'Rab', fullLabel: 'Rabu' },
    { value: '4', label: 'Kam', fullLabel: 'Kamis' },
    { value: '5', label: 'Jum', fullLabel: 'Jumat' },
    { value: '6', label: 'Sab', fullLabel: 'Sabtu' },
];

export default function CompanyManagementPage() {
    const [companies, setCompanies] = useState<Company[]>([]);
    const [shifts, setShifts] = useState<Shift[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [expandedCompanies, setExpandedCompanies] = useState<Set<string>>(new Set());
    const [expandedDivisions, setExpandedDivisions] = useState<Set<string>>(new Set());

    // Modal states
    const [showAddCompany, setShowAddCompany] = useState(false);
    const [showAddDivision, setShowAddDivision] = useState<string | null>(null);
    const [showAddDepartment, setShowAddDepartment] = useState<string | null>(null);
    const [editingDepartment, setEditingDepartment] = useState<Department | null>(null);

    // Form states
    const [newName, setNewName] = useState('');
    const [editWorkDays, setEditWorkDays] = useState<string[]>([]);
    const [editShiftIds, setEditShiftIds] = useState<string[]>([]);

    const loadData = useCallback(async () => {
        try {
            const [companiesRes, shiftsRes] = await Promise.all([
                api.get('/api/companies'),
                api.get('/api/shifts')
            ]);
            setCompanies(companiesRes.data.companies);
            setShifts(shiftsRes.data.shifts.filter((s: Shift) => s));
        } catch (error) {
            console.error('Failed to load data:', error);
            toast.error('Failed to load data');
        } finally {
            setIsLoading(false);
        }
    }, []);

    useEffect(() => {
        loadData();
    }, [loadData]);

    // Auto-refresh when shift data changes (SSE)
    useSSERefresh(SHIFT_EVENTS, loadData);

    const toggleCompany = (id: string) => {
        const newSet = new Set(expandedCompanies);
        if (newSet.has(id)) newSet.delete(id);
        else newSet.add(id);
        setExpandedCompanies(newSet);
    };

    const toggleDivision = (id: string) => {
        const newSet = new Set(expandedDivisions);
        if (newSet.has(id)) newSet.delete(id);
        else newSet.add(id);
        setExpandedDivisions(newSet);
    };

    // Company CRUD
    const createCompany = async () => {
        if (!newName.trim()) return;
        try {
            await api.post('/api/companies', { name: newName.trim() });
            toast.success('Company created');
            setNewName('');
            setShowAddCompany(false);
            loadData();
        } catch (error: any) {
            toast.error(error.response?.data?.error || 'Failed to create company');
        }
    };

    const deleteCompany = async (id: string) => {
        if (!confirm('Delete this company and all its divisions/departments?')) return;
        try {
            await api.delete(`/api/companies/${id}`);
            toast.success('Company deleted');
            loadData();
        } catch (error: any) {
            toast.error(error.response?.data?.error || 'Failed to delete');
        }
    };

    // Division CRUD
    const createDivision = async (companyId: string) => {
        if (!newName.trim()) return;
        try {
            await api.post(`/api/companies/${companyId}/divisions`, { name: newName.trim() });
            toast.success('Division created');
            setNewName('');
            setShowAddDivision(null);
            loadData();
        } catch (error: any) {
            toast.error(error.response?.data?.error || 'Failed to create division');
        }
    };

    const deleteDivision = async (id: string) => {
        if (!confirm('Delete this division and all its departments?')) return;
        try {
            await api.delete(`/api/companies/divisions/${id}`);
            toast.success('Division deleted');
            loadData();
        } catch (error: any) {
            toast.error(error.response?.data?.error || 'Failed to delete');
        }
    };

    // Department CRUD
    const createDepartment = async (divisionId: string) => {
        if (!newName.trim()) return;
        try {
            await api.post(`/api/companies/divisions/${divisionId}/departments`, {
                name: newName.trim(),
                workDays: '1,2,3,4,5'
            });
            toast.success('Department created');
            setNewName('');
            setShowAddDepartment(null);
            loadData();
        } catch (error: any) {
            toast.error(error.response?.data?.error || 'Failed to create department');
        }
    };

    const deleteDepartment = async (id: string) => {
        if (!confirm('Delete this department?')) return;
        try {
            await api.delete(`/api/companies/departments/${id}`);
            toast.success('Department deleted');
            loadData();
        } catch (error: any) {
            toast.error(error.response?.data?.error || 'Failed to delete');
        }
    };

    const startEditDepartment = (dept: Department) => {
        setEditingDepartment(dept);
        setEditWorkDays(dept.workDays.split(',').filter(d => d));
        // Extract shift IDs from allowedShifts
        const shiftIds = dept.allowedShifts?.map(ds => ds.shift.id) || [];
        setEditShiftIds(shiftIds);
    };

    const saveDepartment = async () => {
        if (!editingDepartment) return;
        try {
            await api.put(`/api/companies/departments/${editingDepartment.id}`, {
                workDays: editWorkDays.join(','),
                shiftIds: editShiftIds
            });
            toast.success('Department updated');
            setEditingDepartment(null);
            loadData();
        } catch (error: any) {
            toast.error(error.response?.data?.error || 'Failed to update');
        }
    };

    const toggleWorkDay = (day: string) => {
        setEditWorkDays(prev =>
            prev.includes(day)
                ? prev.filter(d => d !== day)
                : [...prev, day].sort()
        );
    };

    const migrateFromUsers = async () => {
        if (!confirm('Create Company/Division/Department structure from existing user data?')) return;
        try {
            const res = await api.post('/api/companies/migrate-from-users');
            toast.success(`Migration complete: ${res.data.results.companiesCreated} companies, ${res.data.results.divisionsCreated} divisions, ${res.data.results.departmentsCreated} departments created`);
            loadData();
        } catch (error: any) {
            toast.error(error.response?.data?.error || 'Migration failed');
        }
    };

    if (isLoading) {
        return (
            <div className="flex items-center justify-center h-[60vh]">
                <Loader2 className="w-8 h-8 animate-spin text-orange-500" />
            </div>
        );
    }

    return (
        <div className="space-y-6 animate-fade-in">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-[#1a1f37]">Company Management</h1>
                    <p className="text-slate-500">Manage organizational structure and department settings</p>
                </div>
                <div className="flex gap-3">
                    <button
                        onClick={migrateFromUsers}
                        className="btn-secondary flex items-center gap-2"
                        title="Create structure from existing users match"
                    >
                        <Building2 className="w-4 h-4" />
                        <span className="hidden sm:inline">From All Users</span>
                    </button>

                    {/* Template & Import */}
                    <a
                        href={`${import.meta.env.VITE_API_URL ?? 'http://localhost:3012'}/api/companies/export/template?token=${localStorage.getItem('token')}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="btn-secondary flex items-center gap-2"
                    >
                        <FileSpreadsheet className="w-4 h-4" />
                        <span className="hidden sm:inline">Template</span>
                    </a>

                    <label className="btn-secondary flex items-center gap-2 cursor-pointer">
                        <Upload className="w-4 h-4" />
                        <span className="hidden sm:inline">Import Excel</span>
                        <input
                            type="file"
                            accept=".xlsx"
                            className="hidden"
                            onChange={async (e) => {
                                const file = e.target.files?.[0];
                                if (!file) return;

                                const formData = new FormData();
                                formData.append('file', file);

                                const toastId = toast.loading('Importing...');
                                try {
                                    const res = await api.post('/api/companies/import', formData);
                                    toast.success(
                                        `Imported: ${res.data.results.companiesCreated} companies, ` +
                                        `${res.data.results.divisionsCreated} divisions, ` +
                                        `${res.data.results.departmentsCreated} depts`,
                                        { id: toastId }
                                    );
                                    loadData();
                                } catch (error: any) {
                                    toast.error(error.response?.data?.error || 'Import failed', { id: toastId });
                                }
                                // Reset input
                                e.target.value = '';
                            }}
                        />
                    </label>

                    <button
                        onClick={() => setShowAddCompany(true)}
                        className="bg-orange-500 hover:bg-orange-600 text-white px-4 py-2 rounded-xl flex items-center gap-2 font-medium transition-colors"
                    >
                        <Plus className="w-4 h-4" />
                        Add Company
                    </button>
                </div>
            </div>

            {/* Add Company Modal */}
            {showAddCompany && (
                <div className="card p-4">
                    <div className="flex items-center gap-3">
                        <input
                            type="text"
                            placeholder="Company name..."
                            value={newName}
                            onChange={(e) => setNewName(e.target.value)}
                            onKeyPress={(e) => e.key === 'Enter' && createCompany()}
                            className="input-field flex-1"
                            autoFocus
                        />
                        <button onClick={createCompany} className="bg-emerald-500 hover:bg-emerald-600 text-white p-2 rounded-xl transition-colors">
                            <Save className="w-4 h-4" />
                        </button>
                        <button onClick={() => { setShowAddCompany(false); setNewName(''); }} className="btn-secondary p-2">
                            <X className="w-4 h-4" />
                        </button>
                    </div>
                </div>
            )}

            {/* Companies Tree */}
            <div className="space-y-4">
                {companies.length === 0 ? (
                    <div className="card p-12 text-center">
                        <Building2 className="w-12 h-12 mx-auto text-slate-300 mb-4" />
                        <p className="text-slate-500">No companies yet. Create one or import from existing users.</p>
                    </div>
                ) : (
                    companies.map((company) => (
                        <div key={company.id} className="card overflow-hidden">
                            {/* Company Header */}
                            <div className="flex items-center justify-between p-4 bg-slate-50">
                                <button
                                    onClick={() => toggleCompany(company.id)}
                                    className="flex items-center gap-3 flex-1 text-left"
                                >
                                    {expandedCompanies.has(company.id) ? (
                                        <ChevronDown className="w-5 h-5 text-orange-500" />
                                    ) : (
                                        <ChevronRight className="w-5 h-5 text-slate-400" />
                                    )}
                                    <Building2 className="w-5 h-5 text-orange-500" />
                                    <span className="text-lg font-semibold text-[#1a1f37]">{company.name}</span>
                                    <span className="text-sm text-slate-500">
                                        ({company.divisions.length} divisions)
                                    </span>
                                </button>
                                <div className="flex items-center gap-2">
                                    <button
                                        onClick={() => setShowAddDivision(company.id)}
                                        className="p-2 hover:bg-slate-200 rounded-lg transition-colors"
                                        title="Add Division"
                                    >
                                        <Plus className="w-4 h-4 text-slate-400 hover:text-orange-500" />
                                    </button>
                                    <button
                                        onClick={() => deleteCompany(company.id)}
                                        className="p-2 hover:bg-red-100 rounded-lg transition-colors"
                                        title="Delete Company"
                                    >
                                        <Trash2 className="w-4 h-4 text-slate-400 hover:text-red-500" />
                                    </button>
                                </div>
                            </div>

                            {/* Divisions */}
                            {expandedCompanies.has(company.id) && (
                                <div className="border-t border-slate-100">
                                    {/* Add Division Form */}
                                    {showAddDivision === company.id && (
                                        <div className="p-4 bg-slate-50 border-b border-slate-100">
                                            <div className="flex items-center gap-3 ml-8">
                                                <input
                                                    type="text"
                                                    placeholder="Division name..."
                                                    value={newName}
                                                    onChange={(e) => setNewName(e.target.value)}
                                                    onKeyPress={(e) => e.key === 'Enter' && createDivision(company.id)}
                                                    className="input-field flex-1"
                                                    autoFocus
                                                />
                                                <button onClick={() => createDivision(company.id)} className="bg-emerald-500 hover:bg-emerald-600 text-white p-2 rounded-xl transition-colors">
                                                    <Save className="w-4 h-4" />
                                                </button>
                                                <button onClick={() => { setShowAddDivision(null); setNewName(''); }} className="btn-secondary p-2">
                                                    <X className="w-4 h-4" />
                                                </button>
                                            </div>
                                        </div>
                                    )}

                                    {company.divisions.map((division) => (
                                        <div key={division.id}>
                                            {/* Division Header */}
                                            <div className="flex items-center justify-between p-3 pl-8 hover:bg-slate-50">
                                                <button
                                                    onClick={() => toggleDivision(division.id)}
                                                    className="flex items-center gap-3 flex-1 text-left"
                                                >
                                                    {expandedDivisions.has(division.id) ? (
                                                        <ChevronDown className="w-4 h-4 text-orange-500" />
                                                    ) : (
                                                        <ChevronRight className="w-4 h-4 text-slate-400" />
                                                    )}
                                                    <span className="text-[#1a1f37]">{division.name}</span>
                                                    <span className="text-sm text-slate-500">
                                                        ({division.departments.length} departments)
                                                    </span>
                                                </button>
                                                <div className="flex items-center gap-2">
                                                    <button
                                                        onClick={() => setShowAddDepartment(division.id)}
                                                        className="p-1.5 hover:bg-slate-200 rounded transition-colors"
                                                        title="Add Department"
                                                    >
                                                        <Plus className="w-4 h-4 text-slate-400 hover:text-orange-500" />
                                                    </button>
                                                    <button
                                                        onClick={() => deleteDivision(division.id)}
                                                        className="p-1.5 hover:bg-red-100 rounded transition-colors"
                                                        title="Delete Division"
                                                    >
                                                        <Trash2 className="w-4 h-4 text-slate-400 hover:text-red-500" />
                                                    </button>
                                                </div>
                                            </div>

                                            {/* Departments */}
                                            {expandedDivisions.has(division.id) && (
                                                <div className="bg-slate-50/50">
                                                    {/* Add Department Form */}
                                                    {showAddDepartment === division.id && (
                                                        <div className="p-3 pl-16 border-b border-slate-100">
                                                            <div className="flex items-center gap-3">
                                                                <input
                                                                    type="text"
                                                                    placeholder="Department name..."
                                                                    value={newName}
                                                                    onChange={(e) => setNewName(e.target.value)}
                                                                    onKeyPress={(e) => e.key === 'Enter' && createDepartment(division.id)}
                                                                    className="input-field flex-1"
                                                                    autoFocus
                                                                />
                                                                <button onClick={() => createDepartment(division.id)} className="bg-emerald-500 hover:bg-emerald-600 text-white p-2 rounded-xl transition-colors">
                                                                    <Save className="w-4 h-4" />
                                                                </button>
                                                                <button onClick={() => { setShowAddDepartment(null); setNewName(''); }} className="btn-secondary p-2">
                                                                    <X className="w-4 h-4" />
                                                                </button>
                                                            </div>
                                                        </div>
                                                    )}

                                                    {division.departments.map((dept) => (
                                                        <div key={dept.id} className="p-3 pl-16 border-b border-slate-100 last:border-b-0">
                                                            {editingDepartment?.id === dept.id ? (
                                                                /* Edit Mode */
                                                                <div className="space-y-4">
                                                                    <div className="flex items-center gap-2">
                                                                        <span className="text-[#1a1f37] font-medium">{dept.name}</span>
                                                                        <span className="text-xs text-slate-500">({dept._count.users} users)</span>
                                                                    </div>

                                                                    {/* Work Days */}
                                                                    <div>
                                                                        <label className="text-sm text-slate-500 mb-2 flex items-center gap-2">
                                                                            <Calendar className="w-4 h-4" />
                                                                            Work Days
                                                                        </label>
                                                                        <div className="flex flex-wrap gap-2 mt-2">
                                                                            {DAYS.map((day) => (
                                                                                <button
                                                                                    key={day.value}
                                                                                    onClick={() => toggleWorkDay(day.value)}
                                                                                    className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${editWorkDays.includes(day.value)
                                                                                        ? 'bg-orange-500 text-white'
                                                                                        : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                                                                                        }`}
                                                                                >
                                                                                    {day.label}
                                                                                </button>
                                                                            ))}
                                                                        </div>
                                                                    </div>

                                                                    {/* Allowed Shifts */}
                                                                    <div>
                                                                        <label className="text-sm text-slate-500 mb-2 flex items-center gap-2">
                                                                            <Clock className="w-4 h-4" />
                                                                            Allowed Shifts
                                                                        </label>
                                                                        <div className="flex flex-wrap gap-2 mt-2">
                                                                            {shifts.filter(s => s.isActive !== false).map((shift) => (
                                                                                <button
                                                                                    key={shift.id}
                                                                                    type="button"
                                                                                    onClick={() => {
                                                                                        setEditShiftIds((prev: string[]) =>
                                                                                            prev.includes(shift.id)
                                                                                                ? prev.filter((id: string) => id !== shift.id)
                                                                                                : [...prev, shift.id]
                                                                                        );
                                                                                    }}
                                                                                    className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${editShiftIds.includes(shift.id)
                                                                                        ? 'bg-orange-500 text-white'
                                                                                        : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                                                                                        }`}
                                                                                >
                                                                                    {shift.name} ({shift.startTime} - {shift.endTime})
                                                                                </button>
                                                                            ))}
                                                                        </div>
                                                                        {editShiftIds.length === 0 && (
                                                                            <p className="text-xs text-slate-500 mt-1">
                                                                                No shifts selected - users will see all active shifts
                                                                            </p>
                                                                        )}
                                                                    </div>

                                                                    {/* Actions */}
                                                                    <div className="flex gap-2">
                                                                        <button onClick={saveDepartment} className="bg-emerald-500 hover:bg-emerald-600 text-white px-4 py-2 rounded-xl flex items-center gap-2 font-medium transition-colors">
                                                                            <Save className="w-4 h-4" />
                                                                            Save
                                                                        </button>
                                                                        <button onClick={() => setEditingDepartment(null)} className="btn-secondary">
                                                                            Cancel
                                                                        </button>
                                                                    </div>
                                                                </div>
                                                            ) : (
                                                                /* View Mode */
                                                                <div className="flex items-center justify-between">
                                                                    <div>
                                                                        <span className="text-[#1a1f37]">{dept.name}</span>
                                                                        <div className="flex items-center gap-4 mt-1">
                                                                            <span className="text-xs text-slate-500">
                                                                                {dept._count.users} users
                                                                            </span>
                                                                            {dept.allowedShifts && dept.allowedShifts.length > 0 && (
                                                                                <span className="text-xs text-orange-500 flex items-center gap-1">
                                                                                    <Clock className="w-3 h-3" />
                                                                                    {dept.allowedShifts.map(ds => ds.shift.name).join(', ')}
                                                                                </span>
                                                                            )}
                                                                            <span className="text-xs text-slate-500 flex items-center gap-1">
                                                                                <Calendar className="w-3 h-3" />
                                                                                {dept.workDays.split(',').map(d =>
                                                                                    DAYS.find(day => day.value === d)?.label
                                                                                ).filter(Boolean).join(', ')}
                                                                            </span>
                                                                        </div>
                                                                    </div>
                                                                    <div className="flex items-center gap-2">
                                                                        <button
                                                                            onClick={() => startEditDepartment(dept)}
                                                                            className="p-1.5 hover:bg-slate-200 rounded transition-colors"
                                                                            title="Edit"
                                                                        >
                                                                            <Edit2 className="w-4 h-4 text-slate-400 hover:text-orange-500" />
                                                                        </button>
                                                                        <button
                                                                            onClick={() => deleteDepartment(dept.id)}
                                                                            className="p-1.5 hover:bg-red-100 rounded transition-colors"
                                                                            title="Delete"
                                                                        >
                                                                            <Trash2 className="w-4 h-4 text-slate-400 hover:text-red-500" />
                                                                        </button>
                                                                    </div>
                                                                </div>
                                                            )}
                                                        </div>
                                                    ))}

                                                    {division.departments.length === 0 && (
                                                        <div className="p-4 pl-16 text-sm text-slate-500">
                                                            No departments yet
                                                        </div>
                                                    )}
                                                </div>
                                            )}
                                        </div>
                                    ))}

                                    {company.divisions.length === 0 && (
                                        <div className="p-4 pl-12 text-sm text-slate-500">
                                            No divisions yet
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    ))
                )}
            </div>
        </div>
    );
}
