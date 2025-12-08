# Multi-Day Order Feature - Implementation Plan

## Overview
Enable users to order catering for multiple future dates using a date picker, with admin control over how far in advance orders can be placed.

## User Review Required

> [!IMPORTANT]
> **Default Maximum Days Ahead**: I will set the default to **7 days**. Please confirm or specify a different default value.

> [!IMPORTANT]  
> **Cutoff Time Behavior**: For future date orders, the cutoff will be calculated relative to that date's shift time. For example, if ordering for tomorrow's 08:00 shift with a 6-hour cutoff, the deadline is tomorrow at 02:00.

> [!WARNING]
> **Existing Orders**: Users can currently only have one order per day. This constraint will remain - if a user already has an order for a date, they must cancel it before placing a new one.

## Proposed Changes

### Backend

#### [MODIFY] [schema.prisma](file:///e:/Vibe/Catering%20Management/backend/prisma/schema.prisma)
Add `maxOrderDaysAhead` to Settings model:
```prisma
model Settings {
  // ... existing fields
  maxOrderDaysAhead Int @default(7) // Maximum days in future for ordering
}
```

#### [MODIFY] [settings.routes.ts](file:///e:/Vibe/Catering%20Management/backend/src/routes/settings.routes.ts)
- Update GET `/api/settings` to return `maxOrderDaysAhead`
- Update PUT `/api/settings` to accept and save `maxOrderDaysAhead`

#### [MODIFY] [order.routes.ts](file:///e:/Vibe/Catering%20Management/backend/src/routes/order.routes.ts)

**POST `/api/orders`** - Accept optional `orderDate`:
- Parse `orderDate` from request body (defaults to today if not provided)
- Validate date is not in past
- Validate date is within `maxOrderDaysAhead` range
- Update cutoff validation to use selected date
- Update `orderDate` field in database with selected date
- Check for existing order on that specific date

**GET `/api/orders/today`** → **GET `/api/orders/for-date`**:
- Accept `date` query parameter (defaults to today)
- Return order for specified date
- Maintain backward compatibility

---

### Frontend

#### [MODIFY] [SettingsPage.tsx](file:///e:/Vibe/Catering%20Management/frontend/src/pages/admin/SettingsPage.tsx)
Add input field for `maxOrderDaysAhead`:
- Label: "Maximum Advance Order Days"
- Input type: number
- Min: 1, Max: 30
- Default: 7

#### [MODIFY] [OrderPage.tsx](file:///e:/Vibe/Catering%20Management/frontend/src/pages/OrderPage.tsx)

Add date selection:
- Date picker component (HTML5 `<input type="date">`)
- Set `min` to today's date
- Set `max` to today + `maxOrderDaysAhead`
- Default to today
- On date change:
  - Load existing order for that date
  - Reload shifts with cutoff info for that date

Update order creation:
- Include selected `orderDate` in POST body
- Update success message to show date

Update UI labels:
- Change "Today's Order" to "Order for [Selected Date]"
- Show selected date in order confirmation

## Verification Plan

### Automated Tests
- Test order creation with date parameter
- Test date validation (past, too far future)
- Test cutoff calculation for future dates
- Test duplicate order prevention per date

### Manual Verification
1. **Settings**: Configure max days (e.g., 7 days)
2. **Order Page**: 
   - Select today - should work as before
   - Select tomorrow - should create order for tomorrow
   - Try selecting 8 days ahead (should be disabled/rejected)
   - Try selecting yesterday (should be disabled)
3. **Cutoff Validation**: 
   - Select future date and shift
   - Verify cutoff is calculated for that date, not today
4. **Multiple Orders**:
   - Order for tomorrow
   - Check History shows tomorrow's order
   - Try ordering for tomorrow again (should show existing order)
5. **Cancel Future Order**: Cancel tomorrow's order, verify can re-order
