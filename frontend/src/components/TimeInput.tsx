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

    // Parse value to get hours and minutes
    const [hours, minutes] = (value || '00:00').split(':').map(Number);

    // Calculate picker position when showing
    useEffect(() => {
        if (showPicker && containerRef.current) {
            const rect = containerRef.current.getBoundingClientRect();
            // Position above the input
            setPickerPosition({
                top: rect.top - 10,
                left: rect.left
            });
        }
    }, [showPicker]);

    // Handle click outside to close picker
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
        const h = Math.max(0, Math.min(23, newHours));
        const m = Math.max(0, Math.min(59, newMinutes));
        onChange(`${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`);
    };

    const incrementHours = () => updateTime(hours + 1, minutes);
    const decrementHours = () => updateTime(hours - 1, minutes);
    const incrementMinutes = () => updateTime(hours, minutes + 1);
    const decrementMinutes = () => updateTime(hours, minutes - 1);

    // Handle wheel event
    const handleHoursWheel = (e: React.WheelEvent) => {
        e.preventDefault();
        e.stopPropagation();
        if (e.deltaY < 0) incrementHours();
        else decrementHours();
    };

    const handleMinutesWheel = (e: React.WheelEvent) => {
        e.preventDefault();
        e.stopPropagation();
        if (e.deltaY < 0) incrementMinutes();
        else decrementMinutes();
    };

    const pickerContent = showPicker && createPortal(
        <div
            id="time-picker-portal"
            className="fixed bg-slate-800 border border-slate-600 rounded-lg shadow-2xl p-3"
            style={{
                top: pickerPosition.top,
                left: pickerPosition.left,
                transform: 'translateY(-100%)',
                zIndex: 9999
            }}
        >
            <div className="flex gap-4">
                {/* Hours */}
                <div
                    className="flex flex-col items-center"
                    onWheel={handleHoursWheel}
                >
                    <button
                        type="button"
                        onClick={incrementHours}
                        className="p-1 hover:bg-slate-700 rounded"
                    >
                        <ChevronUp className="w-5 h-5 text-slate-400" />
                    </button>
                    <div className="text-3xl font-mono text-cyan-400 tabular-nums min-w-[48px] text-center py-2">
                        {hours.toString().padStart(2, '0')}
                    </div>
                    <button
                        type="button"
                        onClick={decrementHours}
                        className="p-1 hover:bg-slate-700 rounded"
                    >
                        <ChevronDown className="w-5 h-5 text-slate-400" />
                    </button>
                    <span className="text-xs text-slate-500 mt-1">Jam</span>
                </div>

                <div className="text-3xl font-mono text-slate-500 py-2 self-center">:</div>

                {/* Minutes */}
                <div
                    className="flex flex-col items-center"
                    onWheel={handleMinutesWheel}
                >
                    <button
                        type="button"
                        onClick={incrementMinutes}
                        className="p-1 hover:bg-slate-700 rounded"
                    >
                        <ChevronUp className="w-5 h-5 text-slate-400" />
                    </button>
                    <div className="text-3xl font-mono text-cyan-400 tabular-nums min-w-[48px] text-center py-2">
                        {minutes.toString().padStart(2, '0')}
                    </div>
                    <button
                        type="button"
                        onClick={decrementMinutes}
                        className="p-1 hover:bg-slate-700 rounded"
                    >
                        <ChevronDown className="w-5 h-5 text-slate-400" />
                    </button>
                    <span className="text-xs text-slate-500 mt-1">Menit</span>
                </div>
            </div>

            {/* Quick presets */}
            <div className="mt-3 pt-3 border-t border-slate-700 flex flex-wrap gap-2">
                {['06:00', '08:00', '12:00', '15:00', '17:00', '20:00'].map(preset => (
                    <button
                        key={preset}
                        type="button"
                        onClick={() => { onChange(preset); setShowPicker(false); }}
                        className={`px-2 py-1 text-xs rounded ${value === preset
                            ? 'bg-cyan-500/30 text-cyan-400'
                            : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
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
            <div
                onClick={() => setShowPicker(!showPicker)}
                className="input-field w-full flex items-center justify-between cursor-pointer"
            >
                <span className="text-white">
                    {hours.toString().padStart(2, '0')} : {minutes.toString().padStart(2, '0')}
                </span>
                <Clock className="w-4 h-4 text-slate-400" />
            </div>
            {pickerContent}
        </div>
    );
}

