import { useState, useEffect, useCallback } from 'react';
import { api } from '../contexts/AuthContext';
import { formatDateTimeShortWIB } from '../utils/timezone';
import {
    FileText,
    Loader2,
    Clock,
    AlertTriangle,
    ChevronDown
} from 'lucide-react';

interface Agreement {
    id: string;
    title: string;
    content: string;
    priority: string;
    isActive: boolean;
    expiresAt: string | null;
    createdAt: string;
    type: string;
    createdBy: {
        name: string;
        externalId: string;
    };
}

export default function TermsPage() {
    const [agreements, setAgreements] = useState<Agreement[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

    const loadAgreements = useCallback(async () => {
        try {
            const res = await api.get('/api/announcements');
            // Filter strictly for AGREEMENT type and active only
            const allItems: Agreement[] = res.data.announcements || [];
            const activeAgreements = allItems.filter(item => item.type === 'AGREEMENT' && item.isActive);
            setAgreements(activeAgreements);

            // Auto-expand first agreement
            if (activeAgreements.length > 0) {
                setExpandedIds(new Set([activeAgreements[0].id]));
            }
        } catch (error) {
            console.error('Failed to load agreements:', error);
        } finally {
            setIsLoading(false);
        }
    }, []);

    useEffect(() => {
        loadAgreements();
    }, [loadAgreements]);

    const toggleExpanded = (id: string) => {
        setExpandedIds(prev => {
            const newSet = new Set(prev);
            if (newSet.has(id)) {
                newSet.delete(id);
            } else {
                newSet.add(id);
            }
            return newSet;
        });
    };

    const getPriorityBadge = (priority: string) => {
        switch (priority) {
            case 'urgent':
                return (
                    <span className="px-2 py-0.5 rounded text-xs font-medium bg-red-50 text-red-600 border border-red-200">
                        Penting
                    </span>
                );
            case 'high':
                return (
                    <span className="px-2 py-0.5 rounded text-xs font-medium bg-amber-50 text-amber-600 border border-amber-200">
                        Prioritas Tinggi
                    </span>
                );
            default:
                return null;
        }
    };

    if (isLoading) {
        return (
            <div className="flex items-center justify-center h-[60vh]">
                <div className="text-center">
                    <Loader2 className="w-12 h-12 animate-spin text-orange-500 mx-auto" />
                    <p className="text-slate-500 mt-4">Memuat data...</p>
                </div>
            </div>
        );
    }

    return (
        <div className="max-w-4xl mx-auto animate-fade-in">
            {/* Header */}
            <div className="flex items-center gap-4 mb-8">
                <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center shadow-lg shadow-indigo-500/20">
                    <FileText className="w-7 h-7 text-white" />
                </div>
                <div>
                    <h1 className="text-2xl font-bold text-[#1a1f37]">Syarat & Ketentuan</h1>
                    <p className="text-slate-500">Kebijakan penggunaan sistem catering</p>
                </div>
            </div>

            {/* Content */}
            {agreements.length === 0 ? (
                <div className="card text-center py-16">
                    <div className="w-20 h-20 mx-auto mb-4 rounded-full bg-slate-100 flex items-center justify-center">
                        <FileText className="w-10 h-10 text-slate-300" />
                    </div>
                    <h2 className="text-xl font-bold text-[#1a1f37] mb-2">Belum Ada Ketentuan</h2>
                    <p className="text-slate-500">
                        Syarat dan ketentuan penggunaan sistem belum tersedia.
                    </p>
                </div>
            ) : (
                <div className="space-y-4">
                    {agreements.map((agreement) => {
                        const isExpanded = expandedIds.has(agreement.id);

                        return (
                            <div
                                key={agreement.id}
                                className="card p-0 overflow-hidden transition-all duration-300"
                            >
                                {/* Header - Clickable */}
                                <button
                                    onClick={() => toggleExpanded(agreement.id)}
                                    className="w-full p-5 flex items-start justify-between gap-4 text-left hover:bg-slate-50 transition-colors"
                                >
                                    <div className="flex-1">
                                        <div className="flex items-center gap-2 mb-2">
                                            {getPriorityBadge(agreement.priority)}
                                        </div>
                                        <h3 className="text-lg font-semibold text-[#1a1f37]">
                                            {agreement.title}
                                        </h3>
                                        <div className="flex items-center gap-4 mt-2 text-xs text-slate-400">
                                            <div className="flex items-center gap-1">
                                                <Clock className="w-3 h-3" />
                                                <span>Diperbarui: {formatDateTimeShortWIB(agreement.createdAt)}</span>
                                            </div>
                                        </div>
                                    </div>
                                    <div className={`p-2 rounded-lg bg-slate-100 transition-transform duration-300 ${isExpanded ? 'rotate-180' : ''}`}>
                                        <ChevronDown className="w-5 h-5 text-slate-500" />
                                    </div>
                                </button>

                                {/* Content - Expandable */}
                                {isExpanded && (
                                    <div className="border-t border-slate-100">
                                        <div className="p-5">
                                            <div className="prose prose-slate max-w-none">
                                                <div className="text-slate-800 whitespace-pre-wrap leading-relaxed text-[15px]">
                                                    {agreement.content}
                                                </div>
                                            </div>
                                        </div>

                                        {/* Footer notice */}
                                        <div className="px-5 pb-5">
                                            <div className="flex items-start gap-3 p-4 rounded-xl bg-amber-50 border border-amber-100">
                                                <AlertTriangle className="w-5 h-5 text-amber-500 flex-shrink-0 mt-0.5" />
                                                <div>
                                                    <p className="text-sm font-medium text-amber-700">Penting</p>
                                                    <p className="text-xs text-amber-600 mt-1">
                                                        Dengan menggunakan sistem ini, Anda dianggap telah membaca dan menyetujui syarat dan ketentuan yang berlaku.
                                                    </p>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
}
