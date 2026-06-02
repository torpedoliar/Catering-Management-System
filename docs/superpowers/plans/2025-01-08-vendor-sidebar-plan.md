# Sidebar Vendor Menu Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restrict user menu and add vendor menu for VENDOR role in the sidebar.

**Architecture:** Conditional rendering based on `user.role` from `AuthContext`.

**Tech Stack:** React, TypeScript, Lucide React, Tailwind CSS.

---

### Task 1: Modifikasi Sidebar (Frontend)

**Files:**
- Modify: `frontend/src/components/Layout/Sidebar.tsx`

- [ ] **Step 1: Tambahkan konstanta vendorLinks dan state vendorExpanded**

Modify `frontend/src/components/Layout/Sidebar.tsx`:
Add `vendorLinks` near other link constants.
Add `vendorExpanded` state in `Sidebar` component.

```typescript
const vendorLinks = [
    { path: '/vendor', icon: LayoutDashboard, label: 'Dashboard' },
    { path: '/vendor/pickup-stats', icon: Activity, label: 'Statistik Pickup' },
];

// inside Sidebar component
const [vendorExpanded, setVendorExpanded] = useState(true);
```

- [ ] **Step 2: Update logika render menu**

Modify `frontend/src/components/Layout/Sidebar.tsx`:
Wrap User section with `{user?.role !== 'VENDOR' && (...)}`.
Add Vendor section after User section.

```typescript
{/* User section */}
{user?.role !== 'VENDOR' && (
    <div className="mb-3">
        {/* ... user section header ... */}
        {userExpanded && (
            <div className="space-y-2">
                {userLinks.map((link, index) => (
                    <NavLink key={link.path} {...link} colorIndex={index} />
                ))}
            </div>
        )}
    </div>
)}

{/* Vendor section */}
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

- [ ] **Step 3: Commit changes**

Run:
```bash
git add frontend/src/components/Layout/Sidebar.tsx
git commit -m "feat(sidebar): restrict user menu and add vendor menu for VENDOR role"
```
