# Spec: Simplify Root Route in App.tsx

## Background
A previous change (5f473d5) added `VENDOR` role restrictions. 
`ProtectedRoute` was updated to redirect `VENDOR` users to `/vendor` if they try to access restricted routes.
However, the `/` route still contains a manual ternary check for `VENDOR`, which is now redundant.

## Objectives
1. Remove redundant ternary check from the `/` route in `App.tsx`.
2. Ensure `ProtectedRoute` correctly handles the redirection for unauthorized roles, specifically for `VENDOR`.

## Design
- Path: `frontend/src/App.tsx`
- Change:
  ```tsx
  // From:
  <Route path="/" element={user?.role === 'VENDOR' ? <Navigate to="/vendor" replace /> : <OrderPage />} />
  // To:
  <Route path="/" element={<OrderPage />} />
  ```

## Verification Plan
1. Manual check of `ProtectedRoute` logic:
   - If `user.role` is `VENDOR` and `roles` is `['USER', 'ADMIN', 'CANTEEN']`, it hits:
     ```tsx
     if (roles && !roles.includes(user.role)) {
         if (user.role === 'VENDOR') {
             return <Navigate to="/vendor" replace />;
         }
         return <Navigate to="/" replace />;
     }
     ```
   - This correctly redirects to `/vendor`.
2. Logic is sound. No automated tests exist for routing in this repo currently, will rely on logic verification.
