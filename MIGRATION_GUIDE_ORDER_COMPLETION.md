# Order Completion Enhancement Migration Guide

## Overview
This guide covers the database migrations required for implementing enhanced order completion controls and status trail tracking system.

## Migration Files Created

### 1. `20251119000000_add_completion_notes_to_orders.sql`
**Purpose:** Adds a new field to store mandatory completion notes from Manager/Admin users.

**Changes:**
- Adds `completion_notes` text column to `orders` table
- Stores notes when Manager or Admin marks an order as completed

**Impact:** Non-breaking change, adds optional field to existing table

---

### 2. `20251119000001_create_order_status_trail.sql`
**Purpose:** Creates the order status trail table for complete audit tracking.

**Changes:**
- Creates `order_status_trail` table with the following fields:
  - `id` - Primary key
  - `order_id` - Foreign key to orders
  - `old_status` - Previous status
  - `new_status` - New status
  - `changed_by` - User who made the change
  - `changed_by_role` - Role of the user
  - `changed_by_name` - Full name of the user
  - `notes` - Additional notes or reason
  - `created_at` - Timestamp of change

**Features:**
- Cascading delete when order is deleted
- Indexes on order_id, created_at, and changed_by for optimal performance
- RLS policies for secure access control
- Customers can view trail for their orders
- Staff (admin, technician, manager, finance) can view trail for all orders
- Admins have full access to all trail records

**Impact:** New table, no impact on existing functionality

---

### 3. `20251119000002_create_status_trail_functions.sql`
**Purpose:** Creates PostgreSQL functions for status trail management and test completion validation.

**Functions Created:**

#### `log_order_status_change()`
- Logs order status changes to the audit trail
- Parameters:
  - `p_order_id` - Order being updated
  - `p_old_status` - Previous status
  - `p_new_status` - New status
  - `p_changed_by` - User making the change
  - `p_notes` - Optional notes
- Returns: UUID of the created trail record
- Automatically captures user role and name

#### `check_order_tests_completed()`
- Validates if all test results are completed for an order
- Parameters: `p_order_id`
- Returns: Boolean (true if all tests have results)
- Used to enable/disable Mark Completed button for Technicians

#### `get_order_test_completion_status()`
- Returns detailed test completion status
- Parameters: `p_order_id`
- Returns: JSON object with:
  - `total_tests` - Total number of tests in suite
  - `completed_tests` - Number of tests with results
  - `all_completed` - Boolean indicating completion
  - `completion_percentage` - Percentage completed

**Impact:** New functions, available for application use

---

### 4. `20251119000003_populate_existing_status_trail.sql`
**Purpose:** Backfills status trail for existing orders.

**Changes:**
- Loops through all existing orders
- Creates initial status trail record for each order
- Uses order creation timestamp
- Marks as "Initial order creation (populated by migration)"

**Impact:** Populates historical data, one-time operation

---

## Execution Order

**IMPORTANT:** Execute migrations in the following order:

1. `20251119000000_add_completion_notes_to_orders.sql`
2. `20251119000001_create_order_status_trail.sql`
3. `20251119000002_create_status_trail_functions.sql`
4. `20251119000003_populate_existing_status_trail.sql`

## How to Execute

### Via Supabase Dashboard:
1. Log in to Supabase Dashboard
2. Navigate to SQL Editor
3. Copy and paste each migration file content
4. Execute in order

### Via Supabase CLI:
```bash
supabase migration up
```

### Manual Execution:
```bash
psql -h [host] -U [user] -d [database] -f supabase/migrations/20251119000000_add_completion_notes_to_orders.sql
psql -h [host] -U [user] -d [database] -f supabase/migrations/20251119000001_create_order_status_trail.sql
psql -h [host] -U [user] -d [database] -f supabase/migrations/20251119000002_create_status_trail_functions.sql
psql -h [host] -U [user] -d [database] -f supabase/migrations/20251119000003_populate_existing_status_trail.sql
```

## Verification

After executing migrations, verify with these queries:

### Check completion_notes column exists:
```sql
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'orders' 
AND column_name = 'completion_notes';
```

### Check status_trail table exists:
```sql
SELECT table_name 
FROM information_schema.tables 
WHERE table_name = 'order_status_trail';
```

### Check functions exist:
```sql
SELECT routine_name 
FROM information_schema.routines 
WHERE routine_name IN (
  'log_order_status_change',
  'check_order_tests_completed',
  'get_order_test_completion_status'
);
```

### Check existing orders have status trail:
```sql
SELECT COUNT(*) as orders_count,
       (SELECT COUNT(*) FROM order_status_trail) as trail_count
FROM orders;
```

### Test the functions:
```sql
-- Test completion check (replace with actual order ID)
SELECT check_order_tests_completed('your-order-id-here');

-- Test completion status (replace with actual order ID)
SELECT get_order_test_completion_status('your-order-id-here');
```

## Rollback Instructions

If you need to rollback these migrations:

```sql
-- Drop functions
DROP FUNCTION IF EXISTS get_order_test_completion_status(uuid);
DROP FUNCTION IF EXISTS check_order_tests_completed(uuid);
DROP FUNCTION IF EXISTS log_order_status_change(uuid, text, text, uuid, text);

-- Drop table
DROP TABLE IF EXISTS order_status_trail CASCADE;

-- Remove column
ALTER TABLE orders DROP COLUMN IF EXISTS completion_notes;
```

## Next Steps

After executing these migrations:

1. Update frontend code in `Orders.tsx` to:
   - Call status trail logging function on status changes
   - Check test completion before enabling Mark Completed button
   - Show completion notes modal for Manager/Admin
   - Display status trail in order details

2. Test the new functionality:
   - Verify Technician cannot complete orders without all test results
   - Verify Manager/Admin must provide notes when completing
   - Verify status trail is populated correctly
   - Verify all users can view appropriate status trail records

3. Update API endpoints to use new functions

## Security Notes

- All tables have RLS enabled
- Status trail is read-only for customers (their orders only)
- Staff roles can view all status trails
- Only authenticated users can insert status trail records
- Functions use SECURITY DEFINER for proper access control

## Performance Notes

- Indexes added on frequently queried columns
- Functions optimized for quick lookups
- Status trail table designed for append-only operations
- Consider partitioning status_trail table if it grows very large (>1M records)

## Support

For issues or questions regarding these migrations:
1. Check migration execution logs for errors
2. Verify database user has necessary permissions
3. Ensure all prerequisite tables and enums exist
4. Review RLS policies if access issues occur

---

**Migration Author:** System  
**Migration Date:** November 19, 2024  
**Database Version Required:** PostgreSQL 12+  
**Supabase Compatible:** Yes
