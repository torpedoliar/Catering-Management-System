import { useEffect, useRef } from 'react';
import JsBarcode from 'jsbarcode';

/**
 * Renders an order code as a 1D Code 128 barcode (SVG, vector — scales crisply).
 * The encoded string is unchanged (`ORDER-...`), so check-in matching on the
 * backend and the camera scanner (html5-qrcode reads Code 128 by default)
 * keep working without any API change.
 */
export default function OrderBarcode({ value, id }: { value: string; id?: string }) {
    const ref = useRef<SVGSVGElement>(null);

    useEffect(() => {
        if (ref.current) {
            JsBarcode(ref.current, value, {
                format: 'CODE128',
                width: 1,
                height: 80,
                margin: 16,
                displayValue: true,
                fontSize: 13,
                font: 'monospace',
                fontOptions: 'bold',
                background: '#ffffff',
                lineColor: '#000000',
            });
        }
    }, [value]);

    return <svg ref={ref} id={id} className="mx-auto block h-auto max-w-full" />;
}
