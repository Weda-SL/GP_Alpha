# Order Completion Enhancement - Quick Reference

## Migration Files (Execute in Order)

| File | Purpose | Size |
|------|---------|------|
| `20251119000000_add_completion_notes_to_orders.sql` | Adds completion_notes column | 360B |
| `20251119000001_create_order_status_trail.sql` | Creates status trail table + RLS | 2.9KB |
| `20251119000002_create_status_trail_functions.sql` | Creates helper functions | 3.5KB |
| `20251119000003_populate_existing_status_trail.sql` | Backfills existing orders | 1.3KB |

## New Business Rules

### Technician
- ❌ Cannot complete without ALL test results
- 🔒 Button disabled until tests complete
- 📊 Progress indicator shown
- 📝 No notes required

### Manager/Admin
- ✅ Can complete anytime (override)
- 📝 MUST provide notes (mandatory)
- 💾 Notes saved to DB
- 📋 Notes logged in trail

## Database Functions

```sql
-- Check if all tests completed
SELECT check_order_tests_completed('order-id');
-- Returns: boolean

-- Get completion details
SELECT get_order_test_completion_status('order-id');
-- Returns: { total_tests, completed_tests, all_completed, completion_percentage }

-- Log status change
SELECT log_order_status_change('order-id', 'processing', 'completed', 'user-id', 'notes');
-- Returns: trail_record_id
```

## Frontend Integration Points

```typescript
// 1. Check test completion
const { data } = await supabase.rpc('get_order_test_completion_status', {
  p_order_id: orderId
});

// 2. Log status change
await supabase.rpc('log_order_status_change', {
  p_order_id: orderId,
  p_old_status: 'processing',
  p_new_status: 'completed',
  p_changed_by: user.id,
  p_notes: completionNotes
});

// 3. Fetch status trail
const { data: trail } = await supabase
  .from('order_status_trail')
  .select('*')
  .eq('order_id', orderId)
  .order('created_at', { ascending: false });

// 4. Update order with completion notes
await supabase
  .from('orders')
  .update({ 
    status: 'completed',
    completion_notes: notes 
  })
  .eq('id', orderId);
```

## UI Components Needed

- [ ] Test completion progress indicator
- [ ] Disabled button with tooltip (Technician)
- [ ] Completion notes modal (Manager/Admin)
- [ ] Status trail timeline component
- [ ] Test results validation badge

## Button Logic

```typescript
// Technician
disabled={userRole === 'technician' && !testCompletionStatus?.all_completed}

// Manager/Admin
onClick={() => {
  if (userRole === 'manager' || userRole === 'admin') {
    setShowCompletionNotesModal(true);
  } else {
    handleMarkCompleted(orderId);
  }
}}
```

## Verification Queries

```sql
-- Check column added
SELECT column_name FROM information_schema.columns 
WHERE table_name = 'orders' AND column_name = 'completion_notes';

-- Check table created
SELECT table_name FROM information_schema.tables 
WHERE table_name = 'order_status_trail';

-- Check functions created
SELECT routine_name FROM information_schema.routines 
WHERE routine_name IN (
  'log_order_status_change',
  'check_order_tests_completed',
  'get_order_test_completion_status'
);

-- Check trail populated
SELECT COUNT(*) FROM order_status_trail;
```

## Common Errors & Solutions

### Error: "Function does not exist"
**Solution:** Run migration 20251119000002

### Error: "Column completion_notes not found"
**Solution:** Run migration 20251119000000

### Error: "Permission denied for table order_status_trail"
**Solution:** Check RLS policies in migration 20251119000001

### Technician can complete without all tests
**Solution:** Check button disabled logic in frontend

### Manager/Admin can skip notes
**Solution:** Add required validation to completion notes modal

## Testing Commands

```bash
# Test in staging first
supabase db push --dry-run

# Execute migrations
supabase migration up

# Verify
psql -c "SELECT * FROM order_status_trail LIMIT 5;"
```

## Rollback (Emergency Only)

```sql
DROP FUNCTION IF EXISTS get_order_test_completion_status(uuid);
DROP FUNCTION IF EXISTS check_order_tests_completed(uuid);
DROP FUNCTION IF EXISTS log_order_status_change(uuid, text, text, uuid, text);
DROP TABLE IF EXISTS order_status_trail CASCADE;
ALTER TABLE orders DROP COLUMN IF EXISTS completion_notes;
```

## Key Files

- 📄 `MIGRATION_GUIDE_ORDER_COMPLETION.md` - Full guide
- 📄 `ORDER_COMPLETION_SUMMARY.md` - Implementation details
- 📄 `QUICK_REFERENCE_ORDER_COMPLETION.md` - This file
- 📁 `supabase/migrations/20251119*.sql` - Migration files

## Status

✅ Migrations Created  
⏸️ NOT Executed (awaiting approval)  
⏳ Frontend Changes Pending  
📅 Next: Review → Execute → Implement → Test

---
**Last Updated:** November 19, 2024  
**Version:** 1.0  
**Status:** Ready for Implementation
