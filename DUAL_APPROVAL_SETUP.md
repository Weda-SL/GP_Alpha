# Dual-Approval Processing Workflow - Setup Guide

This document provides comprehensive instructions for setting up the Dual-Approval Processing workflow that requires both sample inspection acceptance and financial approval before orders can proceed to processing status.

## Overview

The Dual-Approval Processing workflow implements a two-step approval system where orders can only transition to `processing` status when **BOTH** conditions are met:

1. **Sample Inspection Status** = `accepted` (Lab staff inspects and accepts the physical sample)
2. **Financial Status** = `approved` (Finance team approves payment/budget)

### Key Features

- **Order-Agnostic**: Approvals can happen in ANY order - sample first or finance first
- **Automatic Transition**: Database trigger automatically moves order to processing when both approvals complete
- **No Manual Override**: Orders cannot be manually set to processing status, preventing circumvention
- **Complete Audit Trail**: All approval events logged to status trail and audit logs
- **Clear UI Feedback**: Visual indicators show approval status and requirements at all times

---

## Manual Database Setup Required

⚠️ **CRITICAL**: You must execute the SQL migration file manually in your Supabase SQL Editor.

### Step 1: Execute Database Migration

**File:** `dual_approval_processing_migration.sql` (located in project root)

⚠️ **IMPORTANT FIX**: The migration has been updated to include `changed_by_role` and `changed_by_name` fields required by the `order_status_trail` table. Make sure you use the latest version of the file.

This migration creates:
- Function `check_and_update_order_processing_status` - Evaluates dual-approval criteria and logs to status trail with all required fields
- Trigger `trigger_check_dual_approval_after_update` - Automatically fires when approvals change
- Index `idx_orders_approval_status` - Optimizes approval status queries
- Column comments documenting the dual-approval workflow

**To Execute:**

1. Open your Supabase Dashboard
2. Navigate to SQL Editor
3. Open the file `dual_approval_processing_migration.sql`
4. Copy the entire contents
5. Paste into a new SQL query in Supabase
6. Execute the query
7. Verify success - you should see "Success. No rows returned"

**Verification:**

Run these queries to confirm the migration was successful:

```sql
-- Check if function was created
SELECT routine_name, routine_type
FROM information_schema.routines
WHERE routine_name = 'check_and_update_order_processing_status';

-- Check if trigger was created
SELECT trigger_name, event_object_table
FROM information_schema.triggers
WHERE trigger_name = 'trigger_check_dual_approval_after_update';

-- Check if index was created
SELECT indexname FROM pg_indexes
WHERE indexname = 'idx_orders_approval_status';
```

All three queries should return results. If any query returns no rows, the migration did not complete successfully.

---

## How It Works

### Workflow Scenarios

#### Scenario A: Sample Accepted First, Then Finance Approves

```
1. Order created
   └─ status: 'pending'
   └─ sample_inspection_status: NULL
   └─ financial_status: 'pending_approval'

2. Sample shipped
   └─ status: 'sample_shipped'

3. Lab staff accepts sample
   └─ sample_inspection_status: 'accepted'
   └─ status: REMAINS 'sample_shipped'
   └─ Status trail: "Sample accepted. Awaiting financial approval for processing."

4. Finance approves ✅ BOTH CONDITIONS MET
   └─ financial_status: 'approved'
   └─ 🔄 TRIGGER FIRES AUTOMATICALLY
   └─ status: AUTOMATICALLY CHANGES TO 'processing'
   └─ Status trail: "Automatic transition to processing: both sample inspection accepted and financial approval granted"
```

#### Scenario B: Finance Approves First, Then Sample Accepted

```
1. Order created
   └─ status: 'pending'
   └─ sample_inspection_status: NULL
   └─ financial_status: 'pending_approval'

2. Finance approves early
   └─ financial_status: 'approved'
   └─ status: REMAINS 'pending'
   └─ Waiting for sample...

3. Sample shipped
   └─ status: 'sample_shipped'

4. Lab staff accepts sample ✅ BOTH CONDITIONS MET
   └─ sample_inspection_status: 'accepted'
   └─ 🔄 TRIGGER FIRES AUTOMATICALLY
   └─ status: AUTOMATICALLY CHANGES TO 'processing'
   └─ Status trail: "Automatic transition to processing: both sample inspection accepted and financial approval granted"
```

#### Scenario C: Sample Rejected

```
1. Lab staff rejects sample
   └─ sample_inspection_status: 'rejected'
   └─ status: 'pending'
   └─ Order CANNOT proceed to processing regardless of financial status
   └─ Customer must correct issues and resend sample
```

#### Scenario D: Finance Rejected

```
1. Finance rejects order
   └─ financial_status: 'rejected'
   └─ Order CANNOT proceed to processing regardless of sample inspection
   └─ Customer must resolve payment/budget issues
```

### Technical Implementation

**Database Trigger Logic:**

The trigger fires AFTER UPDATE on the `orders` table when:
- `sample_inspection_status` OR `financial_status` columns change
- The order is NOT already in `processing` status
- At least one approval is now complete

**Function Logic:**

The `check_and_update_order_processing_status` function:
1. Locks the order row to prevent race conditions
2. Checks if BOTH approvals are complete
3. If yes, updates status to `processing`
4. Logs the transition to `order_status_trail`
5. Returns `true` if status was changed, `false` otherwise

---

## User Interface Changes

### 1. Dual-Approval Status Display

A new prominent section appears in order details showing both approval statuses:

**For Staff Users:**
- Visual card showing Sample Inspection status (Accepted/Rejected/Pending)
- Visual card showing Financial Approval status (Approved/Rejected/Pending)
- Green checkmarks for completed approvals
- Yellow clock icons for pending approvals
- Red X icons for rejections
- Inspector/approver names and dates displayed
- Clear indicator of whether both approvals are complete
- Automatic transition message when both approvals are met

**For Customers:**
- Section is hidden (no financial details visible)

### 2. Sample Inspection Handler Changes

**Previous Behavior:**
- Accepting sample → status changes to `sample_shipped`

**New Behavior:**
- Accepting sample → status STAYS at current value
- Database trigger checks if financial approval is also granted
- If both approvals complete → trigger automatically sets status to `processing`
- Status trail message indicates if awaiting financial approval

**Rejection Behavior:**
- Unchanged - rejecting sample → status returns to `pending`

### 3. Finance Approval Handler Changes

**Previous Behavior:**
- Had incomplete code trying to set processing status

**New Behavior:**
- Only updates `financial_status`, `approved_by`, `approved_at`, and `approval_notes`
- Does NOT touch `status` field
- Database trigger handles status transition when both approvals complete
- Orders refresh to show updated status from trigger

### 4. Manual Status Change Prevention

**New Validation:**
- Attempting to manually set order status to `processing` is blocked
- Error message explains dual-approval requirement
- All other status changes work normally
- Ensures workflow integrity and prevents circumvention

---

## User Roles and Permissions

### Sample Inspection

**Who Can Inspect:**
- Admin
- Manager
- Technician

**Process:**
1. Order must be in `sample_shipped` status
2. Inspector clicks "Accept Sample" or "Reject Sample"
3. Provides inspection notes (min 10 characters)
4. Optionally uploads photo
5. System updates `sample_inspection_status`
6. Trigger checks dual-approval criteria

### Financial Approval

**Who Can Approve:**
- Admin
- Finance

**Process:**
1. View order in Finance Approval page
2. Review order details and cost
3. Add approval notes (required)
4. Click "Approve" or "Reject"
5. System updates `financial_status`
6. Trigger checks dual-approval criteria

### Viewing Approval Status

**Staff (Admin, Manager, Technician, Finance):**
- See full dual-approval status display
- View both sample inspection and financial approval details
- See complete approval timeline
- Access all approval notes and documentation

**Customers:**
- Dual-approval section hidden
- Can see general order status
- Cannot view financial approval details

---

## Status Trail Integration

### Approval Events Logged

**Sample Inspection Acceptance:**
```
Old Status: sample_shipped
New Status: sample_shipped (no change)
Notes: "Sample accepted: [inspection notes]. [Awaiting financial approval for processing OR Order will automatically transition to processing]"
```

**Sample Inspection Rejection:**
```
Old Status: sample_shipped
New Status: pending
Notes: "Sample rejected: [inspection notes]"
```

**Automatic Processing Transition:**
```
Old Status: sample_shipped (or pending)
New Status: processing
Notes: "Automatic transition to processing: both sample inspection accepted and financial approval granted"
Changed By: [User who completed the second approval]
```

### Viewing Status Trail

1. Open order details
2. Look for status trail section
3. View chronological list of status changes
4. Dual-approval completion event is highlighted
5. See which approval happened first and second
6. View all approval-related notes

---

## Testing Checklist

After completing the setup, verify the following:

### Database Setup
- [ ] Migration executed successfully in Supabase SQL Editor
- [ ] Function `check_and_update_order_processing_status` exists
- [ ] Trigger `trigger_check_dual_approval_after_update` exists
- [ ] Index `idx_orders_approval_status` exists
- [ ] Column comments updated on orders table

### Scenario A: Sample First, Finance Second
- [ ] Create new order (status: pending)
- [ ] Ship sample (status: sample_shipped)
- [ ] Accept sample (sample_inspection_status: accepted, status stays sample_shipped)
- [ ] Verify status trail shows "Awaiting financial approval"
- [ ] Approve financially (financial_status: approved)
- [ ] **Verify status AUTOMATICALLY changes to processing**
- [ ] Verify status trail shows automatic transition message
- [ ] Check both approvals show as complete in UI

### Scenario B: Finance First, Sample Second
- [ ] Create new order (status: pending)
- [ ] Approve financially early (financial_status: approved, status stays pending)
- [ ] Ship sample (status: sample_shipped)
- [ ] Accept sample (sample_inspection_status: accepted)
- [ ] **Verify status AUTOMATICALLY changes to processing**
- [ ] Verify status trail shows automatic transition message
- [ ] Check both approvals show as complete in UI

### Rejection Scenarios
- [ ] Reject sample (status goes to pending, cannot proceed)
- [ ] Reject financial approval (order cannot proceed)
- [ ] Verify orders cannot reach processing with any rejection

### Manual Override Prevention
- [ ] Try to manually set order status to "processing"
- [ ] Verify error message appears
- [ ] Verify status does NOT change
- [ ] Confirm other status changes still work

### UI Display
- [ ] Dual-approval section appears for staff users
- [ ] Dual-approval section hidden for customers
- [ ] Green checkmarks show for completed approvals
- [ ] Yellow clock icons show for pending approvals
- [ ] Red X icons show for rejections
- [ ] Inspector and approver names display correctly
- [ ] Dates display correctly
- [ ] Processing eligibility indicator shows correct message

### Audit Trail
- [ ] Sample acceptance logged to audit_logs
- [ ] Financial approval logged to audit_logs
- [ ] Status transition logged to order_status_trail
- [ ] All events have correct timestamps and user IDs

---

## Troubleshooting

### Issue: Trigger Not Firing

**Symptoms:**
- Approvals complete but status doesn't change to processing
- Status remains at sample_shipped or pending

**Solutions:**

1. Check trigger exists and is enabled:
```sql
SELECT tgname, tgenabled
FROM pg_trigger
JOIN pg_class ON pg_trigger.tgrelid = pg_class.oid
WHERE tgname = 'trigger_check_dual_approval_after_update'
  AND relname = 'orders';
```

2. Manually test the function:
```sql
SELECT check_and_update_order_processing_status('your-order-id-here');
```

3. Check both approvals are actually complete:
```sql
SELECT
  id,
  order_number,
  status,
  sample_inspection_status,
  financial_status
FROM orders
WHERE id = 'your-order-id-here';
```

4. Check trigger condition - verify one of the approval columns is being updated

### Issue: Function Returns False

**Symptoms:**
- Trigger fires but status doesn't change
- Function exists but returns false

**Solutions:**

1. Verify both conditions are met:
```sql
SELECT
  sample_inspection_status = 'accepted' as sample_ok,
  financial_status = 'approved' as finance_ok,
  status != 'processing' as not_already_processing
FROM orders
WHERE id = 'your-order-id-here';
```

All three should be `true`. If any are `false`, the condition is not met.

2. Check for typos in status values (case-sensitive!)

3. Enable function logging:
```sql
SET client_min_messages TO NOTICE;
SELECT check_and_update_order_processing_status('your-order-id-here');
```

Look for NOTICE messages explaining why the function didn't change status.

### Issue: Duplicate Status Trail Entries

**Symptoms:**
- Multiple identical entries in status trail for same transition
- Slow database performance

**Solutions:**

1. Check the de-duplication logic in the function - there's a WHERE clause preventing duplicates within 1 minute

2. If needed, manually clean up duplicates:
```sql
-- Find duplicates
SELECT order_id, old_status, new_status, created_at, COUNT(*)
FROM order_status_trail
GROUP BY order_id, old_status, new_status, created_at
HAVING COUNT(*) > 1;
```

3. Contact database administrator to review trigger logic

### Issue: Orders Stuck in Sample_Shipped

**Symptoms:**
- Sample accepted but order doesn't progress
- Financial approval granted but status doesn't change

**Solutions:**

1. Check if one approval is missing:
```sql
SELECT
  order_number,
  status,
  sample_inspection_status,
  financial_status,
  CASE
    WHEN sample_inspection_status = 'accepted' AND financial_status = 'approved' THEN 'Should be processing!'
    WHEN sample_inspection_status != 'accepted' THEN 'Need sample acceptance'
    WHEN financial_status != 'approved' THEN 'Need financial approval'
    ELSE 'Unknown issue'
  END as diagnosis
FROM orders
WHERE status = 'sample_shipped';
```

2. Manually trigger the status check:
```sql
SELECT check_and_update_order_processing_status(id)
FROM orders
WHERE status != 'processing'
  AND sample_inspection_status = 'accepted'
  AND financial_status = 'approved';
```

3. Check audit logs for any error messages

### Issue: "Failed to process approval" Error

**Symptoms:**
- Error message: "Failed to process approval" when trying to finance approve an order
- Database error about null value in column "changed_by_role"
- Error: `null value in column "changed_by_role" of relation "order_status_trail" violates not-null constraint`

**Root Cause:**
The `order_status_trail` table requires `changed_by_role` and `changed_by_name` fields, but earlier versions of the migration function didn't populate these fields.

**Solutions:**

1. **Use the Latest Migration File**: Ensure you're using the updated `dual_approval_processing_migration.sql` that includes the fix for `changed_by_role` and `changed_by_name` fields.

2. **Re-run the Migration**: If you already ran the old version:
```sql
-- Drop the old function
DROP FUNCTION IF EXISTS check_and_update_order_processing_status(uuid);

-- Then execute the updated migration file completely
```

3. **Verify the Fix**: After re-running, check the function includes user info fetching:
```sql
SELECT routine_definition
FROM information_schema.routines
WHERE routine_name = 'check_and_update_order_processing_status'
AND routine_definition LIKE '%changed_by_role%';
```

If this returns a result, the fix is in place.

4. **Manual Fix for Stuck Orders**: If orders got stuck in an error state:
```sql
-- Check for orders that should be processing
SELECT id, order_number, status, sample_inspection_status, financial_status
FROM orders
WHERE sample_inspection_status = 'accepted'
  AND financial_status = 'approved'
  AND status != 'processing';

-- Manually transition them (after fixing the function)
SELECT check_and_update_order_processing_status(id)
FROM orders
WHERE sample_inspection_status = 'accepted'
  AND financial_status = 'approved'
  AND status != 'processing';
```

### Issue: Manual Override Still Works

**Symptoms:**
- Can still set orders to processing status manually
- Frontend validation not working

**Solutions:**

1. Clear browser cache and reload application

2. Check frontend console for JavaScript errors

3. Verify `handleStatusUpdate` function has validation code:
```javascript
if (newStatus === 'processing') {
  setError('Orders cannot be manually set to processing status...');
  return;
}
```

4. Check database-level constraints (add if missing):
```sql
-- This would need to be a custom trigger/constraint
-- Not included in current implementation
```

---

## Rollback Instructions

If you need to remove the dual-approval workflow:

### Step 1: Drop Database Objects

```sql
-- Drop trigger first (required before dropping function)
DROP TRIGGER IF EXISTS trigger_check_dual_approval_after_update ON orders;

-- Drop function
DROP FUNCTION IF EXISTS check_and_update_order_processing_status(uuid);

-- Drop index (optional, but good for cleanup)
DROP INDEX IF EXISTS idx_orders_approval_status;
```

### Step 2: Revert Frontend Changes

1. Restore `handleSampleInspection` to set status directly
2. Restore `handleApproval` to set status directly
3. Remove dual-approval validation from `handleStatusUpdate`
4. Remove dual-approval display section from order details modal

### Step 3: Handle Existing Data

Decide how to handle orders with both approvals:

```sql
-- Option A: Manually transition qualified orders to processing
UPDATE orders
SET status = 'processing'
WHERE sample_inspection_status = 'accepted'
  AND financial_status = 'approved'
  AND status != 'processing';

-- Option B: Reset to previous workflow state
UPDATE orders
SET status = 'sample_shipped'
WHERE sample_inspection_status = 'accepted'
  AND status != 'processing'
  AND status != 'completed';
```

---

## Best Practices

### For Lab Staff

1. **Inspect samples promptly** when they arrive
2. **Take clear photos** documenting sample condition
3. **Write detailed notes** explaining acceptance or rejection
4. **Check financial status** before inspection if possible
5. **Communicate with finance** if sample quality affects cost

### For Finance Team

1. **Review orders early** when possible
2. **Add detailed approval notes** including payment references
3. **Check sample status** before approval if samples are critical
4. **Reject clearly** with specific reasons if issues exist
5. **Coordinate with lab** on problematic orders

### For Administrators

1. **Monitor status trail** for stuck orders
2. **Review approval turnaround times** regularly
3. **Train staff** on dual-approval workflow
4. **Check audit logs** for unusual patterns
5. **Verify trigger function** is working correctly

### For Developers

1. **Never bypass validation** in frontend code
2. **Test both approval orders** in development
3. **Monitor database logs** for trigger errors
4. **Document any customizations** to the workflow
5. **Update documentation** when making changes

---

## System Architecture

### Data Flow

```
┌─────────────────────────────────────────────────────────┐
│                    Orders Table                          │
│  ┌──────────────────────────────────────────────────┐  │
│  │ sample_inspection_status | financial_status     │  │
│  └──────────────┬──────────────────────┬────────────┘  │
│                 │                       │                │
│                 v                       v                │
│         [Update Detected]       [Update Detected]       │
│                 │                       │                │
│                 └───────────┬───────────┘                │
│                             v                            │
│              ┌──────────────────────────┐               │
│              │  Trigger Fires (AFTER)   │               │
│              └──────────┬───────────────┘               │
│                         v                                │
│         ┌───────────────────────────────┐               │
│         │  check_and_update_order_      │               │
│         │  processing_status()          │               │
│         └───────────┬───────────────────┘               │
│                     v                                    │
│         ┌───────────────────────────────┐               │
│         │  Both approvals complete?     │               │
│         └───────────┬───────────────────┘               │
│                     │                                    │
│         ┌───────────┴───────────┐                       │
│         v                       v                        │
│    ┌────────┐           ┌───────────┐                  │
│    │  YES   │           │    NO     │                   │
│    └────┬───┘           └─────┬─────┘                  │
│         v                     v                          │
│  ┌──────────────┐      ┌──────────────┐                │
│  │ Update status│      │  Do nothing  │                │
│  │ to processing│      │  Return false│                │
│  └──────┬───────┘      └──────────────┘                │
│         v                                                │
│  ┌──────────────┐                                       │
│  │ Log to status│                                       │
│  │  trail       │                                       │
│  └──────┬───────┘                                       │
│         v                                                │
│  ┌──────────────┐                                       │
│  │ Return true  │                                       │
│  └──────────────┘                                       │
└─────────────────────────────────────────────────────────┘
```

### Component Responsibilities

**Database Layer:**
- Function: Business logic for dual-approval check
- Trigger: Event detection and function invocation
- Index: Performance optimization for approval queries

**Frontend Layer:**
- Sample Inspection Handler: Updates sample_inspection_status
- Finance Approval Handler: Updates financial_status
- Status Update Handler: Prevents manual processing override
- Order Details Display: Shows approval status visually

**Audit Layer:**
- Status Trail: Records all status transitions
- Audit Logs: Records all approval events
- Timestamps: Tracks approval timing

---

## Migration History

**Date:** 2024-11-24
**Version:** 1.0
**Migration File:** `dual_approval_processing_migration.sql`
**Status:** Ready for manual execution

**Changes:**
- Added database function for dual-approval checking
- Added database trigger for automatic status transitions
- Updated frontend to support dual-approval workflow
- Added dual-approval status display to order details
- Added validation preventing manual processing status
- Created comprehensive documentation

**Backward Compatibility:**
- Existing orders unaffected
- Old approval workflows continue to work
- No data migration required
- Safe to roll back if needed

---

## Support and Contact

If you encounter issues not covered in this documentation:

1. Check Supabase logs for error details
2. Review status trail for approval events
3. Test function manually with verification queries
4. Check browser console for frontend errors
5. Contact your database administrator
6. Review audit logs for detailed event history

---

**Implementation Date:** 2024-11-24
**Version:** 1.0
**Status:** Ready for deployment after manual migration execution
