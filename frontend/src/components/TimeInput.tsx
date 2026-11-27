import { useState, useRef, useEffect } from 'react';
import { Clock, ChevronUp, ChevronDown } from 'lucide-react';
import { createPortal } from 'react-dom';

interface TimeInputProps {
    value: string;
    onChange: (value: string) => void;
    className?: string;
}

export default function TimeInput({ value, onChange, className = '' }: TimeInputProps) {
    const [showPicker, setShowPicker] = useState(false);
    const containerRef = useRef<HTMLDivElement>(null);
    const [pickerPosition, setPickerPosition] = useState({ top: 0, left: 0 });

    const [hours, minutes] = (value || '00:00').split(':').map(Number);

    useEffect(() => {
        if (showPicker && containerRef.current) {
            const rect = containerRef.current.getBoundingClientRect();
            setPickerPosition({
                top: rect.top - 8,
                left: rect.left,
            });
        }
    }, [showPicker]);

    useEffect(() => {
        const handleClickOutside = (e: MouseEvent) => {
            if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
                const pickerEl = document.getElementById('time-picker-portal');
                if (pickerEl && !pickerEl.contains(e.target as Node)) {
                    setShowPicker(false);
                }
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const updateTime = (newHours: number, newMinutes: number) => {
        const h = Math.max(0, Math.min(23, isNaN(newHours) ? 0 : newHours));
        const m = Math.max(0, Math.min(59, isNaN(newMinutes) ? 0 : newMinutes));
        onChange(`${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`);
    };

    const pickerContent =
        showPicker &&
        createPortal(
            <div
                id="time-picker-portal"
                className="fixed bg-[#fff] border border-[#e7e5e4] rounded-[12px] shadow-xl p-3"
                style={{
                    top: pickerPosition.top,
                    left: pickerPosition.left,
                    transform: 'translateY(-100%)',
                    zIndex: 9999,
                }}
            >
                <div className="flex gap-4">
                    <div
                        className="flex flex-col items-center"
                        onWheel={(e) => {
                            e.preventDefault();
                            updateTime(hours + (e.deltaY < 0 ? 1 : -1), minutes);
                        }}
                    >
                        <button
                            type="button"
                            aria-label="Tambah jam"
                            onClick={() => updateTime(hours + 1, minutes)}
                            className="p-1 hover:bg-[#f5f5f4] rounded-[6px] border-0 bg-transparent cursor-pointer text-[#57534e]"
                        >
                            <ChevronUp className="w-4 h-4" />
                        </button>
                        <div className="text-[24px] font-bold font-mono text-[#b45309] tabular-nums min-w-[44px] text-center py-1">
                            {String(isNaN(hours) ? 0 : hours).padStart(2, '0')}
                        </div>
                        <button
                            type="button"
                            aria-label="Kurangi jam"
                            onClick={() => updateTime(hours - 1, minutes)}
                            className="p-1 hover:bg-[#f5f5f4] rounded-[6px] border-0 bg-transparent cursor-pointer text-[#57534e]"
                        >
                            <ChevronDown className="w-4 h-4" />
                        </button>
                        <span className="text-[11px] text-[#78716c] mt-0.5">Jam</span>
                    </div>

                    <div className="text-[24px] font-mono text-[#a8a29e] py-2 self-center">:</div>

                    <div
                        className="flex flex-col items-center"
                        onWheel={(e) => {
                            e.preventDefault();
                            updateTime(hours, minutes + (e.deltaY < 0 ? 1 : -1));
                        }}
                    >
                        <button
                            type="button"
                            aria-label="Tambah menit"
                            onClick={() => updateTime(hours, minutes + 1)}
                            className="p-1 hover:bg-[#f5f5f4] rounded-[6px] border-0 bg-transparent cursor-pointer text-[#57534e]"
                        >
                            <ChevronUp className="w-4 h-4" />
                        </button>
                        <div className="text-[24px] font-bold font-mono text-[#b45309] tabular-nums min-w-[44px] text-center py-1">
                            {String(isNaN(minutes) ? 0 : minutes).padStart(2, '0')}
                        </div>
                        <button
                            type="button"
                            aria-label="Kurangi menit"
                            onClick={() => updateTime(hours, minutes - 1)}
                            className="p-1 hover:bg-[#f5f5f4] rounded-[6px] border-0 bg-transparent cursor-pointer text-[#57534e]"
                        >
                            <ChevronDown className="w-4 h-4" />
                        </button>
                        <span className="text-[11px] text-[#78716c] mt-0.5">Menit</span>
                    </div>
                </div>

                <div className="mt-2.5 pt-2.5 border-t border-[#f5f5f4] flex flex-wrap gap-1.5 max-w-[200px]">
                    {['06:00', '08:00', '12:00', '15:00', '17:00', '20:00'].map((preset) => (
                        <button
                            key={preset}
                            type="button"
                            onClick={() => {
                                onChange(preset);
                                setShowPicker(false);
                            }}
                            className={`px-2 py-1 text-[11.5px] font-semibold rounded-[6px] border cursor-pointer ${
                                value === preset
                                    ? 'bg-[#fffbeb] text-[#b45309] border-[#fde68a]'
                                    : 'bg-[#fafaf9] text-[#57534e] border-[#e7e5e4] hover:bg-[#f5f5f4]'
                            }`}
                        >
                            {preset}
                        </button>
                    ))}
                </div>
            </div>,
            document.body
        );

    return (
        <div ref={containerRef} className={`relative ${className}`}>
            <button
                type="button"
                onClick={() => setShowPicker(!showPicker)}
                className="w-full h-10 px-3 rounded-[10px] border border-[#d6d3d1] bg-[#fff] hover:border-[#a8a29e] focus:outline-none focus:border-[#f59e0b] focus:ring-2 focus:ring-[#f59e0b]/25 flex items-center justify-between text-[14px] text-[#1c1917] cursor-pointer"
            >
                <span className="font-mono tabular-nums">
                    {String(isNaN(hours) ? 0 : hours).padStart(2, '0')}:
                    {String(isNaN(minutes) ? 0 : minutes).padStart(2, '0')}
                </span>
                <Clock className="w-4 h-4 text-[#78716c]" aria-hidden="true" />
            </button>
            {pickerContent}
        </div>
    );
}
