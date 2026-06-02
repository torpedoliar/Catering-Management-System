# Design Spec: Sidebar Vendor Menu Modification

## Goal
Restrict user-specific menu items for the `VENDOR` role and add a dedicated "Vendor Menu" section in the sidebar.

## Changes

### 1. `frontend/src/components/Layout/Sidebar.tsx`

#### Constants
Add `vendorLinks` constant:
```typescript
const vendorLinks = [
    { path: '/vendor', icon: LayoutDashboard, label: 'Dashboard' },
    { path: '/vendor/pickup-stats', icon: Activity, label: 'Statistik Pickup' },
];
```

#### State
Add `vendorExpanded` state:
```typescript
const [vendorExpanded, setVendorExpanded] = useState(true);
```

#### JSX Structure
- **User Menu**: Wrap with `{user?.role !== 'VENDOR' && (...)}`.
- **Vendor Menu**: Add new section:
```typescript
{user?.role === 'VENDOR' && (
    <div className="mb-3">
        <div
            onClick={() => setVendorExpanded(!vendorExpanded)}
            className="flex items-center justify-between px-3 py-2.5 cursor-pointer rounded-xl transition-all duration-200 mb-2 bg-white/[0.03] border border-white/[0.05] backdrop-blur-sm hover:bg-white/[0.08] hover:border-white/[0.1]"
        >
            <p className="text-[10px] font-semibold text-teal-400 uppercase tracking-wider">
                Vendor Menu
            </p>
            {vendorExpanded ? <ChevronDown className="w-3.5 h-3.5 text-slate-400" /> : <ChevronRight className="w-3.5 h-3.5 text-slate-400" />}
        </div>
        {vendorExpanded && (
            <div className="space-y-2">
                {vendorLinks.map((link, index) => (
                    <NavLink key={link.path} {...link} colorIndex={index + 5} />
                ))}
            </div>
        )}
    </div>
)}
```

## Verification Plan
- Manual audit: Ensure `VENDOR` role logic is correct.
- Code review: Check for any syntax errors or missing imports (none expected as icons are already imported).
