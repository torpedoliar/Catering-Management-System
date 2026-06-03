# Vendor Role Restriction Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Menghilangkan akses fitur pemesanan bagi role VENDOR dan mengarahkan mereka secara eksklusif ke dashboard vendor serta settings.

**Architecture:** Frontend menggunakan filter pada Sidebar dan redirection pada App routing. Backend menggunakan pengecekan role pada endpoint sensitif (Order).

**Tech Stack:** React (Vite), TypeScript, Express.js, Prisma.

---

### Task 1: Modifikasi Sidebar (Frontend)

**Files:**
- Modify: `frontend/src/components/Layout/Sidebar.tsx`

- [ ] **Step 1: Tambahkan konstanta vendorLinks**

```typescript
// Tambahkan di bagian atas komponen Sidebar bersama konstanta links lainnya
const vendorLinks = [
    { path: '/vendor', icon: LayoutDashboard, label: 'Dashboard' },
    { path: '/vendor/pickup-stats', icon: Activity, label: 'Statistik Pickup' },
];
```

- [ ] **Step 2: Update logika render menu**

```typescript
// Modifikasi bagian Navigasi (Nav)
// Bungkus userLinks dengan kondisi role
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

// Tambahkan section baru untuk Vendor
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

- [ ] **Step 3: Commit perubahan sidebar**

```bash
git add frontend/src/components/Layout/Sidebar.tsx
git commit -m "feat(sidebar): restrict user menu and add vendor menu for VENDOR role"
```

---

### Task 2: Modifikasi Routing & Redirect (Frontend)

**Files:**
- Modify: `frontend/src/App.tsx`

- [ ] **Step 1: Tambahkan logika redirect pada path `/`**

```typescript
// Di dalam AppRoutes component
<Route path="/" element={
    user?.role === 'VENDOR' ? <Navigate to="/vendor" replace /> : <OrderPage />
} />
```

- [ ] **Step 2: Update ProtectedRoute untuk membatasi akses user pages**

```typescript
// Update route group User agar mengecualikan VENDOR
<Route element={<ProtectedRoute roles={['USER', 'ADMIN', 'CANTEEN']}><Outlet /></ProtectedRoute>}>
    <Route path="/" element={<OrderPage />} />
    <Route path="/menu" element={<FoodMenuPage />} />
    <Route path="/history" element={<HistoryPage />} />
    {/* Settings dipindah keluar agar VENDOR bisa akses */}
</Route>

// Pindahkan /settings ke grup yang bisa diakses VENDOR
<Route element={<ProtectedRoute roles={['USER', 'ADMIN', 'CANTEEN', 'VENDOR']}><Outlet /></ProtectedRoute>}>
    <Route path="/settings" element={<SettingsPage />} />
    <Route path="/about" element={<AboutPage />} />
    <Route path="/terms" element={<TermsPage />} />
</Route>
```

- [ ] **Step 3: Commit perubahan routing**

```bash
git add frontend/src/App.tsx
git commit -m "fix(routing): redirect VENDOR from home and restrict access to user pages"
```

---

### Task 3: Penguatan Keamanan API (Backend)

**Files:**
- Modify: `backend/src/routes/order/index.ts` (atau file route order utama)

- [ ] **Step 1: Tambahkan pengecekan role pada pembuatan order**

```typescript
// Pada route POST /
router.post('/', authMiddleware, async (req: AuthRequest, res: Response) => {
    if (req.user?.role === 'VENDOR') {
        return res.status(403).json({ error: 'Vendor tidak diizinkan membuat order' });
    }
    // ... logic pembuatan order ...
});
```

- [ ] **Step 2: Commit perubahan backend**

```bash
git add backend/src/routes/order/*.ts
git commit -m "security(api): block VENDOR from creating orders"
```

---

### Task 4: Verifikasi Akhir

- [ ] **Step 1: Jalankan aplikasi dan login sebagai Vendor**
- [ ] **Step 2: Verifikasi Sidebar hanya muncul Vendor Menu & Settings**
- [ ] **Step 3: Verifikasi akses manual ke `/history` memicu redirect**
- [ ] **Step 4: Jalankan tes manual API untuk order menggunakan token Vendor**
