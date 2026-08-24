# Sample Inspection Feature - Setup Guide

This document provides instructions for setting up the new Sample Inspection feature that replaces the simple rejection workflow with a comprehensive accept/reject system with photo documentation.

## Overview

The Sample Inspection feature allows laboratory staff to:
- **Accept** samples (moving them to processing status)
- **Reject** samples (returning them to pending status)
- Attach photos of the sample condition
- Document detailed inspection notes with character counter
- Track who performed the inspection and when
- Maintain complete audit trail via status trail integration

## Manual Database Setup Required

You need to execute two SQL migration files manually in your Supabase SQL Editor:

### Step 1: Execute Database Schema Migration

**File:** `sample_inspection_migration.sql`

This migration adds the following columns to the `orders` table:
- `sample_inspection_status` - 'accepted' or 'rejected'
- `sample_inspection_date` - timestamp of inspection
- `sample_inspection_notes` - detailed inspection notes
- `sample_inspection_photo_path` - storage path to photo
- `inspected_by` - user ID who performed inspection

**To Execute:**
1. Open your Supabase Dashboard
2. Navigate to SQL Editor
3. Copy the contents of `sample_inspection_migration.sql`
4. Paste and run the SQL
5. Verify that the migration completed successfully

### Step 2: Execute Storage Bucket Migration

**File:** `sample_inspection_storage_migration.sql`

This migration creates the `sample-inspections` storage bucket with proper RLS policies.

**To Execute:**
1. In Supabase SQL Editor
2. Copy the contents of `sample_inspection_storage_migration.sql`
3. Paste and run the SQL
4. Verify the bucket was created in Storage section

## Feature Details

### User Roles and Permissions

**Who Can Inspect Samples:**
- Admin
- Manager
- Technician

**Who Can View Inspection Details:**
- All staff roles can view all inspections
- Customers can view inspections for their own orders

### Workflow

#### Before Inspection
1. Customer creates order (status: `pending`)
2. Order is processed (status: `processing`)
3. Tests are completed (status: `completed`)
4. Sample is shipped to customer (status: `sample_shipped`)

#### Inspection Process
1. When sample is in `sample_shipped` status, inspection buttons appear
2. Staff clicks either "Accept Sample" or "Reject Sample"
3. Inspection modal opens with:
   - Optional photo upload (JPG, PNG, or WebP, max 5MB)
   - Photo preview with ability to remove and re-select
   - Required inspection notes field with character counter
   - Minimum 10 characters, recommended 50-500 characters
   - Color-coded character counter (red < 10, yellow < 50, green 50-500, orange > 500)
   - Action confirmation showing what will happen

#### After Acceptance
- Order status changes to `processing`
- `sample_inspection_status` set to 'accepted'
- Status trail logs: "Sample accepted: [notes]"
- Order can proceed with testing

#### After Rejection
- Order status changes to `pending`
- `sample_inspection_status` set to 'rejected'
- Status trail logs: "Sample rejected: [notes]"
- Customer must resend corrected sample

### Photo Upload

**Specifications:**
- Storage bucket: `sample-inspections`
- File path: `{order_id}/inspection_{timestamp}.{ext}`
- Accepted formats: JPEG, PNG, WebP
- Maximum size: 5MB
- Upload is optional but recommended

**Features:**
- Real-time preview before submission
- Progress indicator during upload
- Error handling with graceful degradation (continues without photo if upload fails)
- Click-to-zoom functionality in order details
- Secure storage with RLS policies

### Character Counter

The inspection notes field includes a dynamic character counter:

- **Red** (< 10 characters): Below minimum, submission disabled
- **Yellow** (10-49 characters): Valid but below recommendation
- **Green** (50-500 characters): Optimal range
- **Orange** (> 500 characters): Above recommendation

Display format: `{count} characters` at bottom right of textarea

### Display in Order Details

**Inspection Information Shows:**
- Status badge (green for accepted, red for rejected)
- Inspection date and time
- Inspector name and role
- Detailed inspection notes
- Sample photo (if uploaded) with click-to-view-full-size
- All information is color-coded based on acceptance/rejection

**Backward Compatibility:**
- Old rejected orders without inspection data still display correctly
- Legacy rejection details shown in red box with date and reason
- New rejections populate both old and new fields

### Status Trail Integration

Inspection events are automatically logged in the order status trail:

**For Acceptance:**
- Event: Status change from `sample_shipped` to `processing`
- Notes: "Sample accepted: [inspection notes]"
- Audit event: `SAMPLE_ACCEPTED`

**For Rejection:**
- Event: Status change from `sample_shipped` to `pending`
- Notes: "Sample rejected: [inspection notes]"
- Audit event: `SAMPLE_REJECTED`

### Button Logic

**Accept/Reject Buttons Appear When:**
- Order status is `sample_shipped`
- Sample has NOT been inspected yet (`sample_inspection_status` is null)
- User role is admin, manager, or technician

**Buttons Hidden When:**
- Sample already inspected
- Order status is not `sample_shipped`
- User lacks proper permissions
- After first inspection (prevents duplicate inspections)

## Data Structure

### Database Columns Added

```sql
-- In orders table
sample_inspection_status text CHECK (value IN ('accepted', 'rejected') OR value IS NULL)
sample_inspection_date timestamptz
sample_inspection_notes text
sample_inspection_photo_path text
inspected_by uuid REFERENCES users(id)
```

### Storage Bucket Structure

```
sample-inspections/
  └── {order-id}/
      └── inspection_{timestamp}.jpg
```

### TypeScript Interface Updates

```typescript
interface Order {
  // ... existing fields
  sample_inspection_status: string | null;
  sample_inspection_date: string | null;
  sample_inspection_notes: string | null;
  sample_inspection_photo_path: string | null;
  inspected_by: string | null;
  inspector?: {
    full_name: string;
    role: string;
  } | null;
}
```

## Testing Checklist

After setup, verify:

- [ ] Database migration executed successfully
- [ ] Storage bucket created with correct RLS policies
- [ ] Accept/Reject buttons appear for sample_shipped orders
- [ ] Inspection modal opens correctly
- [ ] Photo upload works (file validation, preview, upload)
- [ ] Photo upload handles errors gracefully
- [ ] Character counter updates dynamically
- [ ] Character counter enforces 10-character minimum
- [ ] Accept button creates processing status
- [ ] Reject button creates pending status
- [ ] Inspection details display correctly in order view
- [ ] Photo displays and opens full-size when clicked
- [ ] Inspector name and role are shown
- [ ] Status trail shows inspection event
- [ ] Audit log records inspection
- [ ] Buttons hidden after inspection
- [ ] Old rejected orders still display (backward compatibility)
- [ ] Customers can view inspection details for their orders
- [ ] Staff can view all inspection details

## Troubleshooting

### Photo Upload Fails
- Check Supabase storage bucket exists: `sample-inspections`
- Verify RLS policies are in place
- Check user has proper role (admin, manager, technician)
- Ensure file size is under 5MB
- Verify file format is JPG, PNG, or WebP

### Cannot See Inspector Name
- Ensure foreign key constraint exists: `orders_inspected_by_fkey`
- Check query includes: `inspector:users!orders_inspected_by_fkey(full_name, role)`
- Verify user exists in users table

### Buttons Don't Appear
- Check order status is exactly `sample_shipped`
- Verify user role is admin, manager, or technician
- Ensure `sample_inspection_status` is null (not already inspected)

### Character Counter Not Working
- Check React state for `inspectionNotes` is updating
- Verify `.length` property is being read correctly
- Ensure conditional classes are rendering

## Security Considerations

**Storage Policies:**
- Only authenticated users with staff roles can upload photos
- Customers can only view photos for their own orders
- Only admins can delete inspection photos
- All access requires authentication

**Data Validation:**
- Minimum 10 characters for inspection notes
- File type validation (images only)
- File size validation (5MB max)
- Status validation (only 'accepted' or 'rejected')

**Audit Trail:**
- All inspections logged in audit_logs table
- Status changes tracked in order_status_trail
- Inspector identity recorded with timestamp
- Immutable record of all inspection actions

## Future Enhancements (Optional)

Consider these potential improvements:
- Multiple photo uploads per inspection
- Quick checkboxes for common inspection criteria
- Inspection templates for different plastic types
- Batch inspection for multiple samples
- Email notification to customer after inspection
- Photo annotation/markup tools
- Inspection history timeline view

## Support

If you encounter issues:
1. Check Supabase logs for error details
2. Verify both migrations executed successfully
3. Ensure RLS policies are active
4. Check browser console for frontend errors
5. Review audit logs for inspection events

---

**Implementation Date:** 2025-11-19
**Version:** 1.0
**Status:** Ready for deployment after manual migrations
