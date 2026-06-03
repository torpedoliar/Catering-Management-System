# Simplify Root Route Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove redundant VENDOR check from the root route in App.tsx.

**Architecture:** Rely on `ProtectedRoute` wrapper for role-based redirection.

**Tech Stack:** React, React Router.

---

### Task 1: Simplify App.tsx Route

**Files:**
- Modify: `frontend/src/App.tsx:94-96`

- [ ] **Step 1: Replace ternary check with simple element**

```tsx
// old: <Route path="/" element={user?.role === 'VENDOR' ? <Navigate to="/vendor" replace /> : <OrderPage />} />
<Route path="/" element={<OrderPage />} />
```

- [ ] **Step 2: Commit change**

```bash
git add frontend/src/App.tsx
git commit -m "refactor(routing): remove redundant VENDOR check from root route"
```

### Task 2: Verify ProtectedRoute Logic

**Files:**
- Read: `frontend/src/App.tsx:50-80`

- [ ] **Step 1: Verify logic coverage**

Confirm `ProtectedRoute` logic:
```tsx
    if (roles && !roles.includes(user.role)) {
        if (user.role === 'VENDOR') {
            return <Navigate to="/vendor" replace />;
        }
        return <Navigate to="/" replace />;
    }
```
Since the root route is inside a `<Route>` with `roles={['USER', 'ADMIN', 'CANTEEN']}`, VENDOR will be caught by `!roles.includes(user.role)` and redirected to `/vendor`.

- [ ] **Step 2: Cleanup docs**

Add the spec and plan to the repository.

```bash
git add docs/superpowers/specs/2026-06-03-simplify-root-route.md docs/superpowers/plans/2026-06-03-simplify-root-route.md
git commit -m "docs: add spec and plan for root route simplification"
```
