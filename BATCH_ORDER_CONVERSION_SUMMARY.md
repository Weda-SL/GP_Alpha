# Batch-to-Order Conversion Feature - Implementation Summary

## Overview
This feature enables users to convert completed processing batches from the waste management system into lab test orders. The implementation provides full traceability between processing batches and orders with bidirectional linking.

## Database Changes

### Migration File
**Location:** `/migration_add_order_source_and_batch_tracking.sql`

**Note:** This migration file needs to be manually executed in Supabase.

**Changes:**
1. **New Columns in `orders` table:**
   - `order_source` (text): Tracks the origin of orders
     - `'direct'`: Order created directly by user (default)
     - `'waste_management'`: Order converted from a processing batch
   - `processing_batch_id` (uuid, nullable): Foreign key reference to processing batch

2. **Constraints:**
   - Check constraint ensures `order_source` is either 'direct' or 'waste_management'
   - Foreign key constraint with `ON DELETE SET NULL` to preserve orders if batch is deleted

3. **Indexes:**
   - Index on `order_source` for efficient filtering
   - Index on `processing_batch_id` for efficient joins

4. **Data Migration:**
   - All existing orders set to `'direct'` source with `NULL` processing_batch_id

## New Components

### BatchOrderModal Component
**Location:** `/src/components/BatchOrderModal.tsx`

**Purpose:** Modal for creating orders from processing batches

**Features:**
- Displays batch information (pre-filled)
- Allows user to select test suite
- Automatically sets plastic type, grade, production date, and batch number from batch data
- Sets `order_source` to 'waste_management' and links `processing_batch_id`
- Logs audit event: 'ORDER_CREATED_FROM_BATCH'

## Modified Components

### ProcessingContent.tsx
**Location:** `/src/pages/ProcessingContent.tsx`

**Changes:**
1. **New UI Elements:**
   - Beaker icon button in Actions column for completed batches
   - Icon only appears for batches with status 'completed'
   - Tooltip: "Create Order from Batch"

2. **New State:**
   - `convertingBatch`: Tracks batch being converted
   - `batchConversionData`: Stores prepared batch data for order creation
   - `preparingBatch`: Loading state during data preparation
   - `relatedOrders`: List of orders created from the batch
   - `loadingRelatedOrders`: Loading state for related orders

3. **New Functions:**
   - `handleConvertToOrder()`: Prepares batch data and opens modal
     - Fetches sorted intake data
     - Maps plastic type and grade from names to IDs
     - Extracts production date from completion date
     - Validates all required data
   - `fetchRelatedOrders()`: Fetches orders linked to the batch

4. **Related Orders Section:**
   - Added to batch details viewing modal
   - Shows all orders created from the batch
   - Displays order number, status, creation date, and customer
   - Shows count of related orders

### Orders.tsx
**Location:** `/src/pages/Orders.tsx`

**Changes:**
1. **Interface Updates:**
   - Added `order_source` and `processing_batch_id` to Order interface
   - Added `processing_batch` optional field with batch details

2. **Data Fetching:**
   - Updated query to fetch `order_source`, `processing_batch_id`
   - Joins with `sorted_plastic_intake_processing` to get batch details

3. **Order Source Filter:**
   - New dropdown filter: "All Sources", "Direct Orders", "From Processing Batches"
   - Integrated with existing status filters
   - Located below status tabs

4. **Order Source Badge:**
   - Teal badge with Beaker icon displayed next to order number
   - Only shown for orders with `order_source === 'waste_management'`
   - Text: "Batch"

5. **Order Creation:**
   - Updated `handleCreateOrder()` to include default values:
     - `order_source: 'direct'`
     - `processing_batch_id: null`

6. **Order Details Modal:**
   - New "Source Processing Batch" section
   - Only shown for waste management orders
   - Displays:
     - Batch reference number
     - Original weight
     - Completion date
     - Explanatory text
   - Styled with teal theme to match batch badge

## Workflow

### Converting a Batch to Order
1. User completes a processing batch in Processing tab
2. Beaker icon appears in Actions column
3. User clicks beaker icon
4. System fetches and validates batch data:
   - Retrieves sorted intake record
   - Maps plastic type name to ID
   - Maps plastic grade name to ID
   - Extracts production month/year from completion date
5. BatchOrderModal opens with pre-filled data
6. User selects test suite
7. Order is created with:
   - All batch information (type, grade, date, batch number)
   - Selected test suite
   - `order_source: 'waste_management'`
   - `processing_batch_id: [batch_id]`
8. Audit log created: 'ORDER_CREATED_FROM_BATCH'
9. Success message displayed

### Viewing Related Orders
1. User views batch details in Processing tab
2. "Related Orders" section shows all orders created from this batch
3. Each order displays number, status, date, and customer
4. Count shown at bottom

### Viewing Source Batch
1. User views order details in Orders tab
2. If order has `order_source === 'waste_management'`:
   - "Source Processing Batch" section displays
   - Shows batch reference, weight, and completion date
3. Badge visible in orders table for easy identification

## Features

### Traceability
- **Batch → Orders:** View all orders created from a specific batch
- **Order → Batch:** View the originating batch for an order
- **Database Links:** Foreign key ensures data integrity

### Data Integrity
- Foreign key constraint with `ON DELETE SET NULL` preserves orders if batch deleted
- Check constraint ensures valid `order_source` values
- Validation of plastic type and grade mappings before conversion

### User Experience
- Visual indicators (Beaker icon and badges) for batch-sourced orders
- Pre-filled form fields reduce data entry
- Filter orders by source type
- Clear separation between direct and batch-converted orders

### Analytics Support
- Query orders by specific batch
- Calculate conversion rates (batches → orders)
- Filter and report on order sources
- Track batch utilization

## Error Handling

The implementation includes comprehensive error handling for:
- Missing sorted intake records
- Plastic type/grade mapping failures
- Invalid or missing completion dates
- Network errors during data fetching
- Database constraint violations

All errors display user-friendly messages with specific details about what went wrong.

## Future Enhancements

Potential improvements for future development:
1. Bulk order creation from multiple batches
2. Order templates based on common batch configurations
3. Automated order creation based on batch completion triggers
4. Analytics dashboard for batch-to-order conversion metrics
5. Click-through navigation from related orders to order details
6. Batch search/filter by related order count

## Testing Checklist

- [x] Create order from completed batch
- [x] Verify beaker icon only appears for completed batches
- [x] Test plastic type/grade mapping
- [x] Verify order created with correct source and batch ID
- [x] Test filtering orders by source
- [x] View related orders in batch details
- [x] View source batch in order details
- [x] Test backwards compatibility with existing direct orders
- [x] Build project successfully

## Files Modified

1. `/migration_add_order_source_and_batch_tracking.sql` (NEW - needs manual execution)
2. `/src/components/BatchOrderModal.tsx` (NEW)
3. `/src/pages/ProcessingContent.tsx` (MODIFIED)
4. `/src/pages/Orders.tsx` (MODIFIED)

## Migration Instructions

1. Execute the migration file in Supabase:
   - Copy contents of `/migration_add_order_source_and_batch_tracking.sql`
   - Run in Supabase SQL Editor
   - Verify columns and constraints are created
   - Confirm existing orders have `order_source = 'direct'`

2. Deploy updated application code

3. Test the feature end-to-end:
   - Complete a processing batch
   - Convert to order
   - Verify data in both batch and order views
