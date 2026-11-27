import { useState, useEffect, useCallback } from 'react';
import { api } from '../contexts/AuthContext';
import { formatDateTimeShortWIB } from '../utils/timezone';
import { AlertTriangle, ChevronDown } from 'lucide-react';
import { Card, PageHeader, Badge, EmptyState, SkeletonCard } from '../components/ui';

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
            const res = await api.get('/api/announcements/active');
            const allItems: Agreement[] = res.data.announcements || [];
            const activeAgreements = allItems.filter((item) => item.type === 'AGREEMENT' && item.isActive);
            setAgreements(activeAgreements);
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
        setExpandedIds((prev) => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    };

    if (isLoading) {
        return (
            <div className="max-w-[960px] space-y-4">
                <SkeletonCard lines={3} />
                <SkeletonCard lines={4} />
            </div>
        );
    }

    return (
        <div className="max-w-[960px] w-full space-y-[18px]">
            <PageHeader
                title="Syarat & Ketentuan"
                subtitle="Kebijakan penggunaan sistem katering"
            />

            {agreements.length === 0 ? (
                <Card>
                    <EmptyState
                        title="Belum ada ketentuan"
                        description="Syarat dan ketentuan penggunaan sistem belum tersedia."
                    />
                </Card>
            ) : (
                <div className="space-y-3.5">
                    {agreements.map((agreement) => {
                        const isExpanded = expandedIds.has(agreement.id);
                        return (
                            <Card key={agreement.id} padding="none" className="overflow-hidden">
                                <button
                                    type="button"
                                    aria-expanded={isExpanded}
                                    onClick={() => toggleExpanded(agreement.id)}
                                    className="w-full px-5 py-4 flex items-start justify-between gap-4 text-left bg-transparent border-0 cursor-pointer hover:bg-[#fafaf9] transition-colors"
                                >
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-2 mb-1">
                                            {agreement.priority === 'urgent' && <Badge variant="danger">Penting</Badge>}
                                            {agreement.priority === 'high' && <Badge variant="warning">Prioritas tinggi</Badge>}
                                        </div>
                                        <h2 className="m-0 text-[16px] font-bold text-[#1c1917]">{agreement.title}</h2>
                                        <div className="text-[12px] text-[#78716c] mt-1 tabular-nums">
                                            Diperbarui: {formatDateTimeShortWIB(agreement.createdAt)}
                                        </div>
                                    </div>
                                    <span
                                        className={`p-2 rounded-[8px] bg-[#f5f5f4] text-[#57534e] transition-transform duration-200 ${
                                            isExpanded ? 'rotate-180' : ''
                                        }`}
                                    >
                                        <ChevronDown className="w-4 h-4" aria-hidden="true" />
                                    </span>
                                </button>

                                {isExpanded && (
                                    <div className="border-t border-[#f0efed] p-5 space-y-4">
                                        <div className="text-[#1c1917] whitespace-pre-wrap leading-relaxed text-[14px]">
                                            {agreement.content}
                                        </div>
                                        <div className="flex items-start gap-3 p-3.5 rounded-[10px] bg-[#fffbeb] border border-[#fef3c7]">
                                            <AlertTriangle className="w-4 h-4 text-[#b45309] flex-shrink-0 mt-0.5" aria-hidden="true" />
                                            <p className="m-0 text-[12.5px] text-[#92400e]">
                                                Dengan menggunakan sistem ini, Anda dianggap telah membaca dan menyetujui syarat dan ketentuan yang berlaku.
                                            </p>
                                        </div>
                                    </div>
                                )}
                            </Card>
                        );
                    })}
                </div>
            )}
        </div>
    );
}
