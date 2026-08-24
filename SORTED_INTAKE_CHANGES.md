# Sorted Plastic Intake - Implementation Summary

## Overview
This document summarizes all changes made to the Sorted Plastic Intake feature to implement waste batch allocation tracking and other required modifications.

## Database Changes

### Migration Files Created (Execute in Order)

#### 1. `20251020000000_add_colour_to_sorted_intake.sql`
- Adds a `colour` field to the `sorted_plastic_intake` table
- Available values: RED, GREEN, BLUE, YELLOW, MULTI, CLEAR
- Default value: CLEAR

#### 2. `20251020000001_change_plastic_type_to_single.sql`
- Changes `plastic_type_names` from a text array to a single text field
- Each sorted intake batch now tracks only one plastic type
- **IMPORTANT**: This migration drops the existing column. If you have existing data, manually migrate it before running this migration.

#### 3. `20251020000002_remove_buyer_field.sql`
- Removes the `buyer` field from the `sorted_plastic_intake` table
- This field has been replaced with waste intake batch references

#### 4. `20251020000003_create_sorted_intake_allocations.sql`
- Creates a new table `sorted_plastic_intake_allocations` to track which waste intake batches are allocated to each sorted intake
- Includes the following columns:
  - `id`: Primary key
  - `sorted_intake_id`: Foreign key to sorted_plastic_intake (CASCADE DELETE)
  - `waste_intake_batch_id`: Foreign key to waste_plastic_intake (RESTRICT DELETE)
  - `waste_intake_batch_reference`: Denormalized batch reference for quick lookup
  - `allocated_weight_kg`: Weight allocated from the waste batch (must be > 0)
  - `created_at`: Timestamp
  - `created_by`: User ID
- Includes RLS policies for secure access
- Creates indexes for optimal query performance
- Adds a PostgreSQL function `get_waste_intake_remaining_weight(batch_id)` to calculate remaining weight for waste intake batches

## Frontend Changes

### Key Features Implemented

#### 1. Removed Buyer Field
- The buyer input field has been completely removed from the form
- The buyer column has been removed from the table display

#### 2. Changed Plastic Types to Single Selection
- Plastic types field changed from multi-select checkboxes to a single dropdown
- Only one plastic type can be selected per sorted intake batch
- The table now displays a single plastic type badge instead of multiple

#### 3. Added Colour Field
- New dropdown field with options: RED, GREEN, BLUE, YELLOW, MULTI, CLEAR
- Default value: CLEAR
- Displayed in both the table view and detail modal

#### 4. Removed Pelletized from Condition Options
- Condition dropdown now only includes: Clean, Baled, Shredded

#### 5. Waste Intake Batch Allocation Interface
- **Dynamic Filtering**: Waste intake batches are filtered based on the selected plastic type
- **Available Batches Display**: Shows all waste intake batches that:
  - Contain the selected plastic type
  - Have remaining weight available (not fully allocated)
- **Batch Information**: Each batch displays:
  - Batch reference number
  - Intake date
  - Remaining available weight
- **Weight Allocation**:
  - Users can select multiple waste batches
  - For each selected batch, users enter the allocated weight
  - Real-time validation prevents allocating more than the available weight
  - Running totals show allocated vs required weights
- **Validation**:
  - Sum of allocated weights must equal the total quantity entered
  - Cannot submit if allocations don't match
  - Cannot exceed remaining weight of any batch

#### 6. Updated Batch Reference Generation
- New format: `BUSINESSCODE-Type(Numerical)-Grade(Numerical)-MMYYYY-001`
- Example: `ABC-1-A-102025-001`
- Components:
  - Business code from user profile
  - Plastic type number (e.g., "1" for PET)
  - Plastic grade number (e.g., "A" for Grade A)
  - Month and year (MMYYYY format)
  - Sequential counter (001-999)

#### 7. Detail View Modal Enhancements
- Displays the single plastic type
- Shows the colour field
- Lists all waste intake batch allocations with their weights
- Shows total allocated weight

#### 8. Edit Functionality
- When editing a sorted intake record:
  - Existing waste batch allocations are loaded and displayed
  - Users can modify allocations while respecting remaining weights
  - Old allocations are deleted and new ones inserted on update

#### 9. Delete Functionality
- Deleting a sorted intake record also removes associated allocation records (CASCADE)
- This frees up the allocated weights for reuse

## Technical Implementation Details

### State Management
- Added `wasteIntakeBatches` state to store available waste intake batches
- Added `batchAllocations` state to track selected batches and their allocated weights
- Added `viewingAllocations` state for displaying allocations in the view modal

### Data Flow
1. User selects a plastic type → Triggers fetch of matching waste intake batches
2. System calculates remaining weight for each batch by querying allocations table
3. Only batches with remaining weight > 0 are displayed
4. User selects batches and enters weights → Real-time validation
5. On submit → Validates total matches quantity, then creates sorted intake + allocations atomically

### Database Queries
- **Fetching Waste Batches**: Filters by plastic type using `contains` on the array field
- **Calculating Remaining Weight**: Sums all allocations per batch and subtracts from original quantity
- **Creating Records**: Uses transaction-like approach (insert sorted intake, get ID, insert allocations)
- **Editing Records**: Deletes old allocations, updates sorted intake, inserts new allocations

## Manual Steps Required

### Before Running Migrations
1. **Backup your database** - These migrations modify existing tables
2. **Review existing data**:
   - Check if any sorted intake records exist with multiple plastic types
   - Manually decide which plastic type to keep for each record
   - Export buyer information if needed for reference

### Migration Execution Order
Execute the migration files in this exact order:
```bash
# Run each migration file manually through Supabase dashboard or CLI
1. 20251020000000_add_colour_to_sorted_intake.sql
2. 20251020000001_change_plastic_type_to_single.sql
3. 20251020000002_remove_buyer_field.sql
4. 20251020000003_create_sorted_intake_allocations.sql
```

### After Running Migrations
1. Verify the new table structure in Supabase dashboard
2. Test the allocation tracking by creating a new sorted intake
3. Verify that remaining weights are calculated correctly
4. Test edit and delete functionality

## Testing Checklist

- [ ] Create a new sorted plastic intake with single plastic type
- [ ] Verify batch reference follows new format (BUSINESSCODE-Type-Grade-MMYYYY-001)
- [ ] Select waste intake batches and allocate weights
- [ ] Verify validation prevents over-allocation
- [ ] Verify validation requires total to match quantity
- [ ] Submit form and verify both sorted intake and allocations are created
- [ ] View the created record in detail modal
- [ ] Verify waste batch allocations are displayed correctly
- [ ] Edit a sorted intake and modify allocations
- [ ] Verify remaining weights update correctly after allocation
- [ ] Delete a sorted intake and verify allocations are removed
- [ ] Verify colour field displays correctly in all views

## Known Limitations

1. **Data Migration**: The migration from array to single text field for plastic_type_names is destructive. Existing records with multiple types will need manual intervention.

2. **Batch Reference Format**: The new format requires both plastic type and grade to have a `number` field. Ensure these exist in your plastic_types and plastic_grades tables.

3. **Edit Constraints**: When editing, the system allows changing allocations but doesn't prevent creating circular dependencies. Ensure waste batches are not modified while being referenced.

## Security Considerations

- All RLS policies have been properly set up for the allocations table
- Users can only view and manage their own allocations
- Admins can view all allocations
- DELETE RESTRICT on waste_intake_batch_id prevents accidental data loss

## Performance Considerations

- Indexes created on sorted_intake_id and waste_intake_batch_id for fast lookups
- Remaining weight calculation happens in real-time (consider caching for large datasets)
- Allocation queries are optimized with proper foreign key indexes

---

**Implementation Date**: October 20, 2025
**Status**: Completed - Ready for manual migration execution
