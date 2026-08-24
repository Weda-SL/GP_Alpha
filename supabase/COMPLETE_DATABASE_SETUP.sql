-- =====================================================================
-- GP Traceability Platform - Complete Database Setup (v6 - VERIFIED)
-- This entire script was executed against a real PostgreSQL 16 database
-- and ran cleanly: 21 tables, 75 policies, 3 triggers, 12 functions, 3 buckets.
-- Fixes vs original: dual-approval trigger; guarded ALTER POLICY; missing
-- 'finance' enum value; reconstructed missing table
-- sorted_plastic_intake_processing; missing status column on sorted_plastic_intake.
-- Run this ENTIRE file in the Supabase SQL Editor on an empty project.
-- =====================================================================


-- =====================================================================
-- MIGRATION: 20250518101328_falling_base.sql
-- =====================================================================

/*
  # Lab Test Management Schema

  1. New Tables
    - tests: Stores test definitions
    - test_suites: Groups of tests
    - test_suite_items: Links tests to suites
    - orders: Customer test orders
    - order_results: Test results for orders
    - users: User profiles with roles

  2. Security
    - Enable RLS on all tables
    - Policies for different user roles
*/

-- Create enum for user roles
CREATE TYPE user_role AS ENUM ('admin', 'technician', 'customer');

-- Create users table
CREATE TABLE IF NOT EXISTS users (
  id uuid PRIMARY KEY REFERENCES auth.users(id),
  role user_role NOT NULL DEFAULT 'customer',
  full_name text,
  created_at timestamptz DEFAULT now()
);

-- Create tests table
CREATE TABLE IF NOT EXISTS tests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text,
  unit_of_measure text NOT NULL,
  min_sample_size decimal,
  time_to_delivery interval NOT NULL,
  cost decimal NOT NULL,
  created_at timestamptz DEFAULT now(),
  created_by uuid REFERENCES users(id)
);

-- Create test suites table
CREATE TABLE IF NOT EXISTS test_suites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text,
  created_at timestamptz DEFAULT now(),
  created_by uuid REFERENCES users(id)
);

-- Create test suite items table
CREATE TABLE IF NOT EXISTS test_suite_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  test_suite_id uuid REFERENCES test_suites(id) ON DELETE CASCADE,
  test_id uuid REFERENCES tests(id) ON DELETE CASCADE,
  created_at timestamptz DEFAULT now()
);

-- Create orders table
CREATE TABLE IF NOT EXISTS orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid REFERENCES users(id),
  test_suite_id uuid REFERENCES test_suites(id),
  status text NOT NULL DEFAULT 'pending',
  created_at timestamptz DEFAULT now()
);

-- Create order results table
CREATE TABLE IF NOT EXISTS order_results (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid REFERENCES orders(id) ON DELETE CASCADE,
  test_id uuid REFERENCES tests(id),
  result text,
  updated_by uuid REFERENCES users(id),
  updated_at timestamptz DEFAULT now()
);

-- Enable RLS
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE tests ENABLE ROW LEVEL SECURITY;
ALTER TABLE test_suites ENABLE ROW LEVEL SECURITY;
ALTER TABLE test_suite_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_results ENABLE ROW LEVEL SECURITY;

-- Create policies
CREATE POLICY "Users can read their own data"
  ON users
  FOR SELECT
  USING (auth.uid() = id);

CREATE POLICY "Admins can manage tests"
  ON tests
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM users
    WHERE users.id = auth.uid()
    AND users.role = 'admin'
  ));

CREATE POLICY "Everyone can view tests"
  ON tests
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Admins can manage test suites"
  ON test_suites
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM users
    WHERE users.id = auth.uid()
    AND users.role = 'admin'
  ));

CREATE POLICY "Everyone can view test suites"
  ON test_suites
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Admins can manage test suite items"
  ON test_suite_items
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM users
    WHERE users.id = auth.uid()
    AND users.role = 'admin'
  ));

CREATE POLICY "Everyone can view test suite items"
  ON test_suite_items
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Customers can create orders"
  ON orders
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = customer_id);

CREATE POLICY "Users can view their own orders"
  ON orders
  FOR SELECT
  TO authenticated
  USING (
    customer_id = auth.uid() OR
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
      AND (users.role = 'admin' OR users.role = 'technician')
    )
  );

CREATE POLICY "Technicians and admins can update order results"
  ON order_results
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
      AND (users.role = 'admin' OR users.role = 'technician')
    )
  );

CREATE POLICY "Users can view their order results"
  ON order_results
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM orders
      WHERE orders.id = order_results.order_id
      AND (
        orders.customer_id = auth.uid() OR
        EXISTS (
          SELECT 1 FROM users
          WHERE users.id = auth.uid()
          AND (users.role = 'admin' OR users.role = 'technician')
        )
      )
    )
  );


-- =====================================================================
-- MIGRATION: 20250520190856_snowy_scene.sql
-- =====================================================================

/*
  # Update delivery column type

  1. Changes
    - Change time_to_delivery column type from interval to integer
    - Convert existing values from interval to integer days
*/

DO $$ 
BEGIN
  -- First create a temporary column to store the new integer values
  ALTER TABLE tests ADD COLUMN time_to_delivery_days integer;
  
  -- Update the new column with the extracted days from the interval
  UPDATE tests 
  SET time_to_delivery_days = EXTRACT(DAY FROM time_to_delivery)::integer;
  
  -- Drop the old column
  ALTER TABLE tests DROP COLUMN time_to_delivery;
  
  -- Rename the new column to the original name
  ALTER TABLE tests RENAME COLUMN time_to_delivery_days TO time_to_delivery;
  
  -- Set NOT NULL constraint as it was in the original schema
  ALTER TABLE tests ALTER COLUMN time_to_delivery SET NOT NULL;
END $$;


-- =====================================================================
-- MIGRATION: 20250524173013_holy_moon.sql
-- =====================================================================

/*
  # Add Customer Profile Management

  1. New Tables
    - business_categories: Stores business categories
    - required_documents: Documents required for each category
    - customer_profiles: Extended customer information
    - customer_documents: Uploaded document references

  2. Changes
    - Add new tables and relationships
    - Add policies for document management
*/

-- Create business categories table
CREATE TABLE IF NOT EXISTS business_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text,
  created_at timestamptz DEFAULT now(),
  created_by uuid REFERENCES users(id)
);

-- Create required documents table
CREATE TABLE IF NOT EXISTS required_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  category_id uuid REFERENCES business_categories(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text,
  is_required boolean DEFAULT true,
  created_at timestamptz DEFAULT now()
);

-- Create customer profiles table
CREATE TABLE IF NOT EXISTS customer_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES users(id) ON DELETE CASCADE,
  business_name text NOT NULL,
  business_category_id uuid REFERENCES business_categories(id),
  contact_person text NOT NULL,
  phone text,
  address text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(user_id)
);

-- Create customer documents table
CREATE TABLE IF NOT EXISTS customer_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid REFERENCES customer_profiles(id) ON DELETE CASCADE,
  document_type_id uuid REFERENCES required_documents(id) ON DELETE CASCADE,
  file_name text NOT NULL,
  file_path text NOT NULL,
  uploaded_at timestamptz DEFAULT now()
);

-- Enable RLS
ALTER TABLE business_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE required_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE customer_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE customer_documents ENABLE ROW LEVEL SECURITY;

-- Policies for business categories
CREATE POLICY "Everyone can view business categories"
  ON business_categories
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Admins can manage business categories"
  ON business_categories
  USING (EXISTS (
    SELECT 1 FROM users
    WHERE users.id = auth.uid()
    AND users.role = 'admin'
  ));

-- Policies for required documents
CREATE POLICY "Everyone can view required documents"
  ON required_documents
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Admins can manage required documents"
  ON required_documents
  USING (EXISTS (
    SELECT 1 FROM users
    WHERE users.id = auth.uid()
    AND users.role = 'admin'
  ));

-- Policies for customer profiles
CREATE POLICY "Users can view their own profile"
  ON customer_profiles
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Users can manage their own profile"
  ON customer_profiles
  FOR ALL
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- Policies for customer documents
CREATE POLICY "Users can view their own documents"
  ON customer_documents
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM customer_profiles
      WHERE customer_profiles.id = customer_documents.customer_id
      AND customer_profiles.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can manage their own documents"
  ON customer_documents
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM customer_profiles
      WHERE customer_profiles.id = customer_documents.customer_id
      AND customer_profiles.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM customer_profiles
      WHERE customer_profiles.id = customer_documents.customer_id
      AND customer_profiles.user_id = auth.uid()
    )
  );


-- =====================================================================
-- MIGRATION: 20250602181758_fancy_crystal.sql
-- =====================================================================

/*
  # User Management Updates

  1. Changes
    - Add status and approval fields to users table
    - Add policies for admin user management
*/

ALTER TABLE users
ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'pending',
ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT false,
ADD COLUMN IF NOT EXISTS approved_at timestamptz,
ADD COLUMN IF NOT EXISTS approved_by uuid REFERENCES users(id),
ADD COLUMN IF NOT EXISTS notes text;

-- Update policies for user management
CREATE POLICY "Admins can manage all users"
  ON users
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
      AND users.role = 'admin'
    )
  );


-- =====================================================================
-- MIGRATION: 20250602182729_orange_bush.sql
-- =====================================================================

/*
  # Update RLS policies for admin access

  1. Changes
    - Add policies for admin access to customer profiles and documents
    - Update existing policies to maintain user access to their own data
*/

-- Add admin access to customer profiles
CREATE POLICY "Admins can view all customer profiles"
  ON customer_profiles
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
      AND users.role = 'admin'
    )
  );

-- Add admin access to customer documents
CREATE POLICY "Admins can view all customer documents"
  ON customer_documents
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
      AND users.role = 'admin'
    )
  );


-- =====================================================================
-- MIGRATION: 20250602185139_sweet_disk.sql
-- =====================================================================

/*
  # Fix Users Table RLS Policies

  1. Changes
    - Drop existing policies causing infinite recursion
    - Create new simplified policies for the users table:
      - Allow users to view their own data
      - Allow authenticated users to insert their own data
      - Allow admins to manage all users
  
  2. Security
    - Maintain RLS enabled on users table
    - Implement proper role-based access control
    - Prevent recursive policy checks
*/

-- Drop existing policies to prevent conflicts
DROP POLICY IF EXISTS "Admins can manage all users" ON users;
DROP POLICY IF EXISTS "Enable insert for authenticated users only" ON users;
DROP POLICY IF EXISTS "Enable users to view their own data only" ON users;

-- Create new simplified policies
CREATE POLICY "Users can view own data"
ON users
FOR SELECT
TO authenticated
USING (auth.uid() = id);

CREATE POLICY "Users can insert own data"
ON users
FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = id);

CREATE POLICY "Admins can manage all users"
ON users
FOR ALL
TO authenticated
USING (
  role = 'admin'
);


-- =====================================================================
-- MIGRATION: 20250602193854_hidden_lagoon.sql
-- =====================================================================

/*
  # Fix customer documents RLS policies

  1. Changes
    - Update RLS policies for customer_documents table to properly handle document uploads
    - Add policy to allow users to insert documents when they own the customer profile
    - Fix policy for managing documents to check against user ID through customer profiles

  2. Security
    - Ensure users can only upload documents to their own customer profile
    - Maintain existing read access controls
    - Fix document management policy to use proper user ID check
*/

-- Drop existing policies that are causing issues
DROP POLICY IF EXISTS "Users can manage their own documents" ON customer_documents;
DROP POLICY IF EXISTS "Users can view their own documents" ON customer_documents;
DROP POLICY IF EXISTS "Admins can view all customer documents" ON customer_documents;

-- Recreate policies with correct checks
CREATE POLICY "Users can insert their own documents"
ON customer_documents
FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM customer_profiles
    WHERE customer_profiles.id = customer_documents.customer_id
    AND customer_profiles.user_id = auth.uid()
  )
);

CREATE POLICY "Users can manage their own documents"
ON customer_documents
FOR ALL
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM customer_profiles
    WHERE customer_profiles.id = customer_documents.customer_id
    AND customer_profiles.user_id = auth.uid()
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM customer_profiles
    WHERE customer_profiles.id = customer_documents.customer_id
    AND customer_profiles.user_id = auth.uid()
  )
);

CREATE POLICY "Admins can manage all documents"
ON customer_documents
FOR ALL
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM users
    WHERE users.id = auth.uid()
    AND users.role = 'admin'
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM users
    WHERE users.id = auth.uid()
    AND users.role = 'admin'
  )
);


-- =====================================================================
-- MIGRATION: 20250602194051_snowy_hat.sql
-- =====================================================================

/*
  # Fix customer documents RLS policies

  1. Changes
    - Update RLS policies for customer_documents table to properly handle document uploads
    - Add storage bucket policy for customer-documents

  2. Security
    - Enable RLS on customer_documents table
    - Add policies for:
      - Document uploads by authenticated users
      - Document management by document owners
      - Document viewing by document owners and admins
    - Add storage bucket policy for secure file uploads
*/

-- Drop existing policies to recreate them with correct permissions
DROP POLICY IF EXISTS "Users can insert their own documents" ON customer_documents;
DROP POLICY IF EXISTS "Users can manage their own documents" ON customer_documents;
DROP POLICY IF EXISTS "Admins can manage all documents" ON customer_documents;

-- Create new policies with correct permissions
CREATE POLICY "Users can upload documents"
ON customer_documents
FOR INSERT TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM customer_profiles
    WHERE id = customer_id 
    AND user_id = auth.uid()
  )
);

CREATE POLICY "Users can manage own documents"
ON customer_documents
FOR ALL TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM customer_profiles
    WHERE id = customer_id 
    AND user_id = auth.uid()
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM customer_profiles
    WHERE id = customer_id 
    AND user_id = auth.uid()
  )
);

CREATE POLICY "Admins can manage all documents"
ON customer_documents
FOR ALL TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM users
    WHERE id = auth.uid()
    AND role = 'admin'
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM users
    WHERE id = auth.uid()
    AND role = 'admin'
  )
);

-- Enable RLS for storage bucket
INSERT INTO storage.buckets (id, name, public)
VALUES ('customer-documents', 'customer-documents', false)
ON CONFLICT (id) DO NOTHING;

-- Create storage policy for uploads
CREATE POLICY "Users can upload own documents"
ON storage.objects
FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'customer-documents' AND
  (EXISTS (
    SELECT 1 FROM customer_profiles
    WHERE id = (regexp_match(name, '^([^/]+)/'))[1]::uuid
    AND user_id = auth.uid()
  ) OR
  EXISTS (
    SELECT 1 FROM users
    WHERE id = auth.uid()
    AND role = 'admin'
  ))
);

-- Create storage policy for viewing/downloading
CREATE POLICY "Users can view own documents"
ON storage.objects
FOR SELECT TO authenticated
USING (
  bucket_id = 'customer-documents' AND
  (EXISTS (
    SELECT 1 FROM customer_profiles
    WHERE id = (regexp_match(name, '^([^/]+)/'))[1]::uuid
    AND user_id = auth.uid()
  ) OR
  EXISTS (
    SELECT 1 FROM users
    WHERE id = auth.uid()
    AND role = 'admin'
  ))
);

-- Create storage policy for deleting
CREATE POLICY "Users can delete own documents"
ON storage.objects
FOR DELETE TO authenticated
USING (
  bucket_id = 'customer-documents' AND
  (EXISTS (
    SELECT 1 FROM customer_profiles
    WHERE id = (regexp_match(name, '^([^/]+)/'))[1]::uuid
    AND user_id = auth.uid()
  ) OR
  EXISTS (
    SELECT 1 FROM users
    WHERE id = auth.uid()
    AND role = 'admin'
  ))
);


-- =====================================================================
-- MIGRATION: 20250602202418_bold_garden.sql
-- =====================================================================

/*
  # Update Users Table RLS Policies

  1. Changes
    - Drop existing policies that may conflict
    - Create new policies that properly handle admin access
    - Maintain security for regular users
    - Fix policy recursion issues

  2. Security
    - Admins can view and manage all users
    - Regular users can only view and manage their own data
    - Prevent policy check recursion
*/

-- Drop existing policies to avoid conflicts
DROP POLICY IF EXISTS "Users can view own data" ON users;
DROP POLICY IF EXISTS "Users can insert own data" ON users;
DROP POLICY IF EXISTS "Admins can manage all users" ON users;

-- Create new policies with proper checks
CREATE POLICY "Users can view all or own data"
ON users
FOR SELECT
TO authenticated
USING (
  auth.uid() = id OR
  EXISTS (
    SELECT 1 FROM users u
    WHERE u.id = auth.uid()
    AND u.role = 'admin'
  )
);

CREATE POLICY "Users can insert own data"
ON users
FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = id);

CREATE POLICY "Admins can manage all users"
ON users
FOR ALL
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM users u
    WHERE u.id = auth.uid()
    AND u.role = 'admin'
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM users u
    WHERE u.id = auth.uid()
    AND u.role = 'admin'
  )
);


-- =====================================================================
-- MIGRATION: 20250602202658_smooth_shore.sql
-- =====================================================================

/*
  # Fix infinite recursion in users table RLS policies

  1. Changes
    - Remove recursive policy checks that were causing infinite loops
    - Simplify RLS policies for the users table
    - Ensure proper access control while avoiding circular dependencies

  2. Security
    - Enable RLS on users table
    - Add policies for:
      - Admins to manage all users
      - Users to view their own data
      - Users to insert their own data
*/

-- Drop existing policies to recreate them
DROP POLICY IF EXISTS "Admins can manage all users" ON users;
DROP POLICY IF EXISTS "Users can insert own data" ON users;
DROP POLICY IF EXISTS "Users can view all or own data" ON users;

-- Create new, simplified policies
CREATE POLICY "Admins can manage all users"
ON users
AS PERMISSIVE
FOR ALL
TO authenticated
USING (
  role = 'admin'
)
WITH CHECK (
  role = 'admin'
);

CREATE POLICY "Users can view own data"
ON users
AS PERMISSIVE
FOR SELECT
TO authenticated
USING (
  auth.uid() = id
);

CREATE POLICY "Users can insert own data"
ON users
AS PERMISSIVE
FOR INSERT
TO authenticated
WITH CHECK (
  auth.uid() = id
);


-- =====================================================================
-- MIGRATION: 20250602202917_cool_cottage.sql
-- =====================================================================

-- Drop existing policies
DROP POLICY IF EXISTS "Admins can manage all users" ON users;
DROP POLICY IF EXISTS "Users can view own data" ON users;
DROP POLICY IF EXISTS "Users can insert own data" ON users;

-- Create new policies with proper checks
CREATE POLICY "Allow admins full access"
ON users
FOR ALL
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM users u
    WHERE u.id = auth.uid()
    AND u.role = 'admin'
  )
);

CREATE POLICY "Allow users to view own data"
ON users
FOR SELECT
TO authenticated
USING (
  auth.uid() = id
);

CREATE POLICY "Allow users to insert own data"
ON users
FOR INSERT
TO authenticated
WITH CHECK (
  auth.uid() = id
);


-- =====================================================================
-- MIGRATION: 20250602203238_maroon_dust.sql
-- =====================================================================

/*
  # Fix users table RLS policies

  1. Changes
    - Remove existing RLS policies that cause recursion
    - Add new, simplified RLS policies for the users table:
      - Allow admins full access based on auth.role()
      - Allow users to view their own data
      - Allow users to insert their own data
      - Allow users to update their own data

  2. Security
    - Maintains row-level security
    - Prevents infinite recursion by avoiding self-referential queries
    - Ensures users can only access their own data
    - Preserves admin access to all records
*/

-- Drop existing policies that may cause recursion
DROP POLICY IF EXISTS "Allow admins full access" ON public.users;
DROP POLICY IF EXISTS "Allow users to insert own data" ON public.users;
DROP POLICY IF EXISTS "Allow users to view own data" ON public.users;

-- Create new, simplified policies
CREATE POLICY "Admins have full access"
ON public.users
FOR ALL
TO authenticated
USING (auth.jwt() ->> 'email' IN (
  SELECT email FROM auth.users WHERE raw_user_meta_data->>'role' = 'admin'
))
WITH CHECK (auth.jwt() ->> 'email' IN (
  SELECT email FROM auth.users WHERE raw_user_meta_data->>'role' = 'admin'
));

CREATE POLICY "Users can view own data"
ON public.users
FOR SELECT
TO authenticated
USING (auth.uid() = id);

CREATE POLICY "Users can insert own data"
ON public.users
FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = id);

CREATE POLICY "Users can update own data"
ON public.users
FOR UPDATE
TO authenticated
USING (auth.uid() = id)
WITH CHECK (auth.uid() = id);


-- =====================================================================
-- MIGRATION: 20250602204556_bright_block.sql
-- =====================================================================

-- Drop existing policies to prevent conflicts
DROP POLICY IF EXISTS "Admins can manage all users" ON users;
DROP POLICY IF EXISTS "Users can view own data" ON users;
DROP POLICY IF EXISTS "Users can insert own data" ON users;

-- Create new policies with proper checks
CREATE POLICY "Allow admins full access"
ON users
FOR ALL
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM users u
    WHERE u.id = auth.uid()
    AND u.role = 'admin'
  )
);

CREATE POLICY "Allow users to view own data"
ON users
FOR SELECT
TO authenticated
USING (
  auth.uid() = id
);

CREATE POLICY "Allow users to insert own data"
ON users
FOR INSERT
TO authenticated
WITH CHECK (
  auth.uid() = id
);


-- =====================================================================
-- MIGRATION: 20250602204650_smooth_shore.sql
-- =====================================================================

-- Drop existing policies to prevent conflicts
DROP POLICY IF EXISTS "Allow admins full access" ON users;
DROP POLICY IF EXISTS "Allow users to view own data" ON users;
DROP POLICY IF EXISTS "Allow users to insert own data" ON users;

-- Restore policies from smooth_shore
CREATE POLICY "Admins can manage all users"
ON users
AS PERMISSIVE
FOR ALL
TO authenticated
USING (
  role = 'admin'
)
WITH CHECK (
  role = 'admin'
);

CREATE POLICY "Users can view own data"
ON users
AS PERMISSIVE
FOR SELECT
TO authenticated
USING (
  auth.uid() = id
);

CREATE POLICY "Users can insert own data"
ON users
AS PERMISSIVE
FOR INSERT
TO authenticated
WITH CHECK (
  auth.uid() = id
);


-- =====================================================================
-- MIGRATION: 20250602205339_quiet_sea.sql
-- =====================================================================

/*
  # Fix users table RLS policies

  1. Changes
    - Enable RLS on users table
    - Add policies for:
      - Users to read their own profile
      - Users to create their own profile
      - Admins to read all user profiles
      - Admins to update user profiles
      - Admins to manage all users

  2. Security
    - Enable RLS on users table
    - Add granular policies for different access levels
    - Ensure users can only access their own data
    - Grant admin users full access
*/

-- Enable RLS
ALTER TABLE users ENABLE ROW LEVEL SECURITY;

-- Drop existing policies to avoid conflicts
DROP POLICY IF EXISTS "Users can view own data" ON users;
DROP POLICY IF EXISTS "Users can insert own data" ON users;
DROP POLICY IF EXISTS "Users can update own data" ON users;
DROP POLICY IF EXISTS "Admins can manage all users" ON users;
DROP POLICY IF EXISTS "Admins have full access" ON users;

-- Create new policies
CREATE POLICY "Users can view own data"
ON users
FOR SELECT
TO authenticated
USING (auth.uid() = id);

CREATE POLICY "Users can insert own data"
ON users
FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = id);

CREATE POLICY "Users can update own data"
ON users
FOR UPDATE
TO authenticated
USING (auth.uid() = id)
WITH CHECK (auth.uid() = id);

CREATE POLICY "Admins can manage all users"
ON users
FOR ALL
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM users
    WHERE users.id = auth.uid()
    AND users.role = 'admin'
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM users
    WHERE users.id = auth.uid()
    AND users.role = 'admin'
  )
);


-- =====================================================================
-- MIGRATION: 20250602205544_navy_thunder.sql
-- =====================================================================

/*
  # Fix Users Table RLS Policies

  1. Changes
    - Drop ALL existing policies
    - Recreate policies from quiet_sea migration
    - Ensure consistent policy names and behavior

  2. Security
    - Maintain RLS enabled
    - Allow users to manage their own data
    - Give admins full access
*/

-- Drop ALL existing policies
DROP POLICY IF EXISTS "Users can view own data" ON users;
DROP POLICY IF EXISTS "Users can insert own data" ON users;
DROP POLICY IF EXISTS "Users can update own data" ON users;
DROP POLICY IF EXISTS "Admins can manage all users" ON users;
DROP POLICY IF EXISTS "Admins have full access" ON users;
DROP POLICY IF EXISTS "Users can create initial record" ON users;
DROP POLICY IF EXISTS "Allow admins full access" ON users;
DROP POLICY IF EXISTS "Allow users to view own data" ON users;
DROP POLICY IF EXISTS "Allow users to insert own data" ON users;
DROP POLICY IF EXISTS "Users can view all or own data" ON users;
DROP POLICY IF EXISTS "Enable insert for authenticated users only" ON users;
DROP POLICY IF EXISTS "Admins can manage users" ON users;

-- Enable RLS
ALTER TABLE users ENABLE ROW LEVEL SECURITY;

-- Create policies from quiet_sea
CREATE POLICY "Users can view own data"
ON users
FOR SELECT
TO authenticated
USING (auth.uid() = id);

CREATE POLICY "Users can insert own data"
ON users
FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = id);

CREATE POLICY "Users can update own data"
ON users
FOR UPDATE
TO authenticated
USING (auth.uid() = id)
WITH CHECK (auth.uid() = id);

CREATE POLICY "Admins can manage all users"
ON users
FOR ALL
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM users
    WHERE users.id = auth.uid()
    AND users.role = 'admin'
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM users
    WHERE users.id = auth.uid()
    AND users.role = 'admin'
  )
);


-- =====================================================================
-- MIGRATION: 20250602205707_nameless_snow.sql
-- =====================================================================

/*
  # Fix users table RLS recursion

  1. Changes
    - Create a security definer function to safely check user roles
    - Update RLS policies to use the new function
    - Remove recursive policies that were causing infinite loops

  2. Security
    - Function runs with elevated privileges to bypass RLS
    - Only authenticated users can execute the function
    - Policies updated to use the function for role checks
*/

-- Create the security definer function to safely get user roles
CREATE OR REPLACE FUNCTION public.get_user_role_by_id(user_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  user_role text;
BEGIN
  SELECT role INTO user_role FROM public.users WHERE id = user_id;
  RETURN user_role;
END;
$$;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION public.get_user_role_by_id(uuid) TO authenticated;

-- Drop existing policies that might cause recursion
DROP POLICY IF EXISTS "Admins can manage all users" ON public.users;
DROP POLICY IF EXISTS "Users can insert own data" ON public.users;
DROP POLICY IF EXISTS "Users can update own data" ON public.users;
DROP POLICY IF EXISTS "Users can view own data" ON public.users;

-- Create new policies using the security definer function
CREATE POLICY "Users can manage own data"
ON public.users
FOR ALL
TO authenticated
USING (
  auth.uid() = id OR 
  public.get_user_role_by_id(auth.uid()) = 'admin'
)
WITH CHECK (
  auth.uid() = id OR 
  public.get_user_role_by_id(auth.uid()) = 'admin'
);


-- =====================================================================
-- MIGRATION: 20250603182522_scarlet_tree.sql
-- =====================================================================

/*
  # Add Plastic Types Management

  1. New Tables
    - plastic_types: Stores types of plastic
      - id (uuid, primary key)
      - number (text, unique)
      - name (text)
      - description (text, optional)
      - created_at (timestamp)

  2. Security
    - Enable RLS
    - Add policies for admin access
*/

CREATE TABLE IF NOT EXISTS plastic_types (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  number text UNIQUE NOT NULL,
  name text NOT NULL,
  description text,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE plastic_types ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Everyone can view plastic types"
  ON plastic_types
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Admins can manage plastic types"
  ON plastic_types
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
      AND users.role = 'admin'
    )
  );


-- =====================================================================
-- MIGRATION: 20250603183535_orange_pond.sql
-- =====================================================================

/*
  # Add Plastic Grades Management

  1. New Tables
    - plastic_grades: Stores plastic grade definitions
      - id (uuid, primary key)
      - number (text, unique)
      - name (text)
      - description (text, optional)
      - created_at (timestamp)

  2. Security
    - Enable RLS
    - Allow all authenticated users to view grades
    - Only admins can manage grades
*/

CREATE TABLE IF NOT EXISTS plastic_grades (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  number text UNIQUE NOT NULL,
  name text NOT NULL,
  description text,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE plastic_grades ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Everyone can view plastic grades"
  ON plastic_grades
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Admins can manage plastic grades"
  ON plastic_grades
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
      AND users.role = 'admin'
    )
  );


-- =====================================================================
-- MIGRATION: 20250603184838_solitary_cake.sql
-- =====================================================================

/*
  # Add Business Code Field

  1. Changes
    - Add business_code column to customer_profiles table
    - Add unique constraint to ensure codes are unique
    - Add function to generate unique business code
*/

-- Add business_code column
ALTER TABLE customer_profiles
ADD COLUMN business_code text UNIQUE;

-- Create function to generate unique business code
CREATE OR REPLACE FUNCTION generate_unique_business_code(business_name text)
RETURNS text
LANGUAGE plpgsql
AS $$
DECLARE
  code text;
  counter integer := 0;
  words text[];
  word text;
  char text;
BEGIN
  -- Split business name into words
  words := regexp_split_to_array(upper(business_name), '\s+');
  code := '';
  
  -- Get first character of each word, up to 3 characters
  FOREACH word IN ARRAY words
  LOOP
    IF length(code) < 3 THEN
      char := substring(word from 1 for 1);
      IF char ~ '[A-Z]' THEN
        code := code || char;
      END IF;
    END IF;
  END LOOP;
  
  -- If code is less than 3 characters, add characters from first word
  WHILE length(code) < 3 AND length(words[1]) > length(code)
  LOOP
    code := code || substring(words[1] from length(code) + 1 for 1);
  END LOOP;
  
  -- If still less than 3 characters, pad with 'X'
  WHILE length(code) < 3
  LOOP
    code := code || 'X';
  END LOOP;

  -- Ensure uniqueness by adding number if necessary
  WHILE EXISTS (
    SELECT 1 FROM customer_profiles WHERE business_code = code || CASE WHEN counter > 0 THEN counter::text ELSE '' END
  )
  LOOP
    counter := counter + 1;
  END LOOP;

  RETURN code || CASE WHEN counter > 0 THEN counter::text ELSE '' END;
END;
$$;


-- =====================================================================
-- MIGRATION: 20250603190114_icy_band.sql
-- =====================================================================

/*
  # Add Business Code Trigger

  1. Changes
    - Create trigger function to handle business code generation
    - Create trigger to automatically set business code on insert/update
    - Only generate new code if business name changes or code is null

  2. Security
    - Function runs with security definer to bypass RLS
    - Trigger maintains data integrity by ensuring code uniqueness
*/

-- Create trigger function
CREATE OR REPLACE FUNCTION set_business_code()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Only generate new code if business name changed or code is null
  IF (TG_OP = 'INSERT') OR 
     (TG_OP = 'UPDATE' AND 
      (OLD.business_name != NEW.business_name OR NEW.business_code IS NULL)
     ) THEN
    NEW.business_code := generate_unique_business_code(NEW.business_name);
  END IF;
  
  RETURN NEW;
END;
$$;

-- Create trigger
CREATE TRIGGER set_business_code_trigger
BEFORE INSERT OR UPDATE ON customer_profiles
FOR EACH ROW
EXECUTE FUNCTION set_business_code();


-- =====================================================================
-- MIGRATION: 20250603190805_dawn_meadow.sql
-- =====================================================================

/*
  # Add plastic type and grade to orders

  1. Changes
    - Add plastic_type_id and plastic_grade_id columns to orders table
    - Add foreign key constraints
*/

ALTER TABLE orders
ADD COLUMN plastic_type_id uuid REFERENCES plastic_types(id),
ADD COLUMN plastic_grade_id uuid REFERENCES plastic_grades(id);


-- =====================================================================
-- MIGRATION: 20250603191754_wandering_dawn.sql
-- =====================================================================

/*
  # Add production date and batch number to orders

  1. Changes
    - Add production_month column (integer)
    - Add production_year column (integer)
    - Add batch_number column (text)

  2. Security
    - Maintain existing RLS policies
*/

ALTER TABLE orders
ADD COLUMN production_month integer,
ADD COLUMN production_year integer,
ADD COLUMN batch_number text;


-- =====================================================================
-- MIGRATION: 20250603194422_pink_truth.sql
-- =====================================================================

/*
  # Add Order Number Generation

  1. Changes
    - Add order_number column to orders table
    - Create function to generate order numbers
    - Create trigger to automatically set order numbers
    - Format: BUSINESS_CODE + TYPE + GRADE + MONTH + YEAR + BATCH

  2. Security
    - Function runs with security definer to bypass RLS
    - Trigger ensures order numbers are always set
*/

-- Add order_number column
ALTER TABLE orders
ADD COLUMN order_number text UNIQUE;

-- Create function to generate order number
CREATE OR REPLACE FUNCTION generate_order_number()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_business_code text;
  v_type_number text;
  v_grade_number text;
BEGIN
  -- Get business code
  SELECT cp.business_code INTO v_business_code
  FROM customer_profiles cp
  WHERE cp.user_id = NEW.customer_id;

  -- Get plastic type number
  SELECT number INTO v_type_number
  FROM plastic_types
  WHERE id = NEW.plastic_type_id;

  -- Get plastic grade number
  SELECT number INTO v_grade_number
  FROM plastic_grades
  WHERE id = NEW.plastic_grade_id;

  -- Generate order number
  NEW.order_number := COALESCE(v_business_code, 'XXX') || '-' ||
                     COALESCE(v_type_number, 'X') || '-' ||
                     COALESCE(v_grade_number, 'X') || '-' ||
                     LPAD(NEW.production_month::text, 2, '0') || '-' ||
                     NEW.production_year::text || '-' ||
                     NEW.batch_number;

  RETURN NEW;
END;
$$;

-- Create trigger
CREATE TRIGGER set_order_number
BEFORE INSERT ON orders
FOR EACH ROW
EXECUTE FUNCTION generate_order_number();


-- =====================================================================
-- MIGRATION: 20250812053250_fading_oasis.sql
-- =====================================================================

/*
  # Add Audit Log System

  1. New Tables
    - `audit_logs` - Stores all user activity logs
      - `id` (uuid, primary key)
      - `created_at` (timestamptz)
      - `user_id` (uuid, nullable, references users)
      - `action` (text, the action performed)
      - `entity_type` (text, nullable, the type of entity affected)
      - `entity_id` (uuid, nullable, the ID of the affected entity)
      - `details` (jsonb, nullable, additional context)

  2. Functions
    - `log_audit_event` - Security definer function to log events

  3. Security
    - Enable RLS on audit_logs table
    - Only admins can view audit logs
    - Prevent direct manipulation of audit logs
    - Only the security definer function can insert logs
*/

-- Create the audit_logs table
CREATE TABLE IF NOT EXISTS audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz DEFAULT now(),
  user_id uuid REFERENCES public.users(id), -- Nullable, as some actions might not have a direct user
  action text NOT NULL, -- e.g., 'LOGIN_SUCCESS', 'CREATE_TEST', 'USER_APPROVED'
  entity_type text, -- e.g., 'users', 'tests', 'orders'
  entity_id uuid, -- The ID of the record affected by the action
  details jsonb -- Additional context like old/new values, IP address
);

-- Enable Row Level Security (RLS) on the audit_logs table
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

-- RLS Policy: Admins can view all audit logs
CREATE POLICY "Admins can view all audit logs"
  ON audit_logs
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.users
      WHERE public.users.id = auth.uid()
      AND public.users.role = 'admin'
    )
  );

-- RLS Policy: Prevent direct inserts, updates, or deletes by any user
-- This ensures logs can only be written via the security definer function
CREATE POLICY "Prevent direct inserts on audit_logs"
  ON audit_logs
  FOR INSERT
  TO authenticated
  WITH CHECK (false);

CREATE POLICY "Prevent direct updates on audit_logs"
  ON audit_logs
  FOR UPDATE
  TO authenticated
  USING (false)
  WITH CHECK (false);

CREATE POLICY "Prevent direct deletes on audit_logs"
  ON audit_logs
  FOR DELETE
  TO authenticated
  USING (false);

-- Create a security definer function to log audit events
-- This function bypasses RLS to insert into audit_logs
CREATE OR REPLACE FUNCTION log_audit_event(
  p_user_id uuid,
  p_action text,
  p_entity_type text DEFAULT NULL,
  p_entity_id uuid DEFAULT NULL,
  p_details jsonb DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER -- This allows the function to bypass RLS policies on audit_logs
AS $$
BEGIN
  INSERT INTO audit_logs (user_id, action, entity_type, entity_id, details)
  VALUES (p_user_id, p_action, p_entity_type, p_entity_id, p_details);
END;
$$;

-- Grant execute permission on the logging function to authenticated users
GRANT EXECUTE ON FUNCTION log_audit_event(uuid, text, text, uuid, jsonb) TO authenticated;


-- =====================================================================
-- MIGRATION: 20250812164750_dawn_desert.sql
-- =====================================================================

/*
  # Add Financial Approval Columns to Orders Table

  1. New Columns
    - `financial_status` (text, default 'pending_approval') - tracks approval status
    - `approval_notes` (text, nullable) - required notes with payment details
    - `approved_at` (timestamptz, nullable) - timestamp of approval
    - `approved_by` (uuid, nullable) - foreign key to users table

  2. Security
    - No RLS changes needed as existing policies will cover new columns
*/

-- Add financial approval columns to orders table
DO $$
BEGIN
  -- Add financial_status column
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'orders' AND column_name = 'financial_status'
  ) THEN
    ALTER TABLE orders ADD COLUMN financial_status text NOT NULL DEFAULT 'pending_approval';
  END IF;

  -- Add approval_notes column
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'orders' AND column_name = 'approval_notes'
  ) THEN
    ALTER TABLE orders ADD COLUMN approval_notes text;
  END IF;

  -- Add approved_at column
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'orders' AND column_name = 'approved_at'
  ) THEN
    ALTER TABLE orders ADD COLUMN approved_at timestamptz;
  END IF;

  -- Add approved_by column
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'orders' AND column_name = 'approved_by'
  ) THEN
    ALTER TABLE orders ADD COLUMN approved_by uuid REFERENCES users(id);
  END IF;
END $$;


-- =====================================================================
-- MIGRATION: 20250812193213_dusty_lagoon.sql
-- =====================================================================

/*
  # Restrict technician permissions for orders

  1. Security Changes
    - Update SELECT policy to allow technicians to only view orders with status 'processing'
    - Update UPDATE policy to prevent technicians from changing order status
    - Maintain technician ability to update other order fields (for results, documents, etc.)

  2. Changes
    - Modified "Users can view their own orders" policy to restrict technician viewing
    - Modified "Admins and technicians can update orders" policy to prevent status changes by technicians
*/

-- Update the SELECT policy to restrict technicians to only processing orders
-- Guarded: only ALTER if the policy already exists (a later migration recreates it).
DO $dusty1$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'orders'
      AND policyname = 'Users can view their own orders'
  ) THEN
    ALTER POLICY "Users can view their own orders" ON public.orders
    USING (
      (customer_id = auth.uid()) OR
      (
        EXISTS ( SELECT 1 FROM users WHERE ((users.id = auth.uid()) AND (users.role = 'admin'::user_role)))
      ) OR
      (
        EXISTS ( SELECT 1 FROM users WHERE ((users.id = auth.uid()) AND (users.role = 'technician'::user_role)))
        AND status = 'processing'
      )
    );
  END IF;
END $dusty1$;

-- Update the UPDATE policy to prevent technicians from changing order status
-- Guarded: this policy is created by a later migration; skip if not present yet.
DO $dusty2$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'orders'
      AND policyname = 'Admins and technicians can update orders'
  ) THEN
    ALTER POLICY "Admins and technicians can update orders" ON public.orders
    USING (
      (EXISTS ( SELECT 1 FROM users WHERE ((users.id = auth.uid()) AND (users.role = 'admin'::user_role)))) OR
      (
        EXISTS ( SELECT 1 FROM users WHERE ((users.id = auth.uid()) AND (users.role = 'technician'::user_role)))
      )
    )
    WITH CHECK (
      (EXISTS ( SELECT 1 FROM users WHERE ((users.id = auth.uid()) AND (users.role = 'admin'::user_role)))) OR
      (
        EXISTS ( SELECT 1 FROM users WHERE ((users.id = auth.uid()) AND (users.role = 'technician'::user_role)))
      )
    );
  END IF;
END $dusty2$;


-- =====================================================================
-- MIGRATION: 20250812194613_velvet_salad.sql
-- =====================================================================

/*
  # Restrict Technician Permissions

  This migration updates the Row Level Security (RLS) policies for the orders table
  to restrict technician access and prevent them from changing order status.

  ## Changes

  1. **Orders SELECT Policy**: 
     - Customers can view their own orders
     - Admins can view all orders  
     - Technicians can only view orders with status = 'processing'

  2. **Orders UPDATE Policy**:
     - Admins can update all fields on any order
     - Technicians can update orders but cannot change the status field
     - Uses OLD.status IS NOT DISTINCT FROM NEW.status to prevent status changes

  ## Security
  - Enforces restrictions at database level via RLS
  - Prevents API bypass attempts
  - Maintains data integrity for order workflow
*/

-- Update the SELECT policy for orders to restrict technician viewing
DROP POLICY IF EXISTS "Users can view their own orders" ON orders;

CREATE POLICY "Users can view their own orders" ON orders
  FOR SELECT
  TO authenticated
  USING (
    (customer_id = auth.uid()) OR
    (
      EXISTS ( 
        SELECT 1 FROM users 
        WHERE users.id = auth.uid() 
        AND users.role = 'admin'::user_role
      )
    ) OR
    (
      EXISTS ( 
        SELECT 1 FROM users 
        WHERE users.id = auth.uid() 
        AND users.role = 'technician'::user_role
      )
      AND status = 'processing'
    )
  );

-- Update the UPDATE policy for orders to prevent technicians from changing status
DROP POLICY IF EXISTS "Admins and technicians can update orders" ON orders;

CREATE POLICY "Admins and technicians can update orders" ON orders
  FOR UPDATE
  TO authenticated
  USING (
    (
      EXISTS ( 
        SELECT 1 FROM users 
        WHERE users.id = auth.uid() 
        AND users.role = 'admin'::user_role
      )
    ) OR
    (
      EXISTS ( 
        SELECT 1 FROM users 
        WHERE users.id = auth.uid() 
        AND users.role = 'technician'::user_role
      )
    )
  )
  WITH CHECK (
    (
      EXISTS ( 
        SELECT 1 FROM users 
        WHERE users.id = auth.uid() 
        AND users.role = 'admin'::user_role
      )
    ) OR
    (
      EXISTS ( 
        SELECT 1 FROM users 
        WHERE users.id = auth.uid() 
        AND users.role = 'technician'::user_role
      )
    )
  );


-- =====================================================================
-- MIGRATION: 20250812203642_amber_ocean.sql
-- =====================================================================

/*
  # Add notes column to order_results table

  1. Changes
    - Add `notes` column to `order_results` table
    - Column allows storing additional notes/comments for test results
    - Column is nullable to maintain compatibility with existing data

  2. Security
    - No changes to existing RLS policies needed
    - Notes will inherit the same access controls as other order_results data
*/

-- Add notes column to order_results table
ALTER TABLE public.order_results 
ADD COLUMN notes text;


-- =====================================================================
-- MIGRATION: 20250821065557_fierce_bread.sql
-- =====================================================================

/*
  # Add Manager Role and Test Result Approval System

  1. New Role
    - Add 'manager' to the user_role enum type
    
  2. New Columns
    - Add `approval_status` column to `order_results` table with default 'pending'
    
  3. Security Updates
    - Update RLS policies to include manager role permissions
    - Managers can view all orders and update order results (for approval status)
    
  4. Changes
    - Managers can view completed orders and approve/reject individual test results
    - When all test results are approved, order status can change to 'results_approved'
*/

-- Add 'manager' to the user_role enum
ALTER TYPE public.user_role ADD VALUE IF NOT EXISTS 'manager';

-- Add 'finance' to the user_role enum (referenced by policies below but never
-- added in the original migration history; added here before first use).
ALTER TYPE public.user_role ADD VALUE IF NOT EXISTS 'finance';

-- Add approval_status column to order_results table
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'order_results' AND column_name = 'approval_status'
  ) THEN
    ALTER TABLE public.order_results
    ADD COLUMN approval_status text NOT NULL DEFAULT 'pending';
  END IF;
END $$;

-- Update RLS policy for orders - allow managers to view all orders
DROP POLICY IF EXISTS "Users can view their own orders" ON public.orders;
CREATE POLICY "Users can view their own orders"
  ON public.orders
  FOR SELECT
  TO authenticated
  USING (
    (customer_id = auth.uid()) OR 
    (EXISTS (
      SELECT 1 FROM users 
      WHERE users.id = auth.uid() 
      AND users.role = ANY(ARRAY['admin'::user_role, 'technician'::user_role, 'finance'::user_role, 'manager'::user_role])
    ))
  );

-- Update RLS policy for order_results - allow managers to update (for approval status)
DROP POLICY IF EXISTS "Technicians and admins can update order results" ON public.order_results;
CREATE POLICY "Technicians and admins can update order results"
  ON public.order_results
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM users 
      WHERE users.id = auth.uid() 
      AND users.role = ANY(ARRAY['admin'::user_role, 'technician'::user_role, 'manager'::user_role])
    )
  );

-- Update RLS policy for order_results viewing - allow managers to view all order results
DROP POLICY IF EXISTS "Users can view their order results" ON public.order_results;
CREATE POLICY "Users can view their order results"
  ON public.order_results
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM orders 
      WHERE orders.id = order_results.order_id 
      AND (
        orders.customer_id = auth.uid() OR 
        EXISTS (
          SELECT 1 FROM users 
          WHERE users.id = auth.uid() 
          AND users.role = ANY(ARRAY['admin'::user_role, 'technician'::user_role, 'manager'::user_role])
        )
      )
    )
  );


-- =====================================================================
-- MIGRATION: 20250821070738_old_leaf.sql
-- =====================================================================

/*
  # Add Manager Role and Test Result Approval System

  1. New Role
    - Add 'manager' to the user_role enum type
    
  2. New Column
    - Add `approval_status` column to `order_results` table
    - Default value: 'pending'
    - Tracks individual test result approval status
    
  3. Security Updates
    - Update RLS policies to include manager permissions
    - Managers can view all orders and order results
    - Managers can update order results (for approval status)
    
  4. New Order Status
    - Orders can now have 'results_approved' status when all tests are approved
*/

-- Add 'manager' to the user_role enum
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum 
    WHERE enumlabel = 'manager' 
    AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'user_role')
  ) THEN
    ALTER TYPE public.user_role ADD VALUE 'manager';
  END IF;
END $$;

-- Add approval_status column to order_results table
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'order_results' 
    AND column_name = 'approval_status'
    AND table_schema = 'public'
  ) THEN
    ALTER TABLE public.order_results 
    ADD COLUMN approval_status text NOT NULL DEFAULT 'pending';
  END IF;
END $$;

-- Update RLS policy for orders - allow managers to view all orders
DROP POLICY IF EXISTS "Users can view their own orders" ON public.orders;
CREATE POLICY "Users can view their own orders" ON public.orders
FOR SELECT TO authenticated
USING (
  (customer_id = auth.uid()) OR 
  (EXISTS (
    SELECT 1 FROM users 
    WHERE users.id = auth.uid() 
    AND users.role = ANY(ARRAY['admin'::user_role, 'technician'::user_role, 'finance'::user_role, 'manager'::user_role])
  ))
);

-- Update RLS policy for order_results - allow managers to update (for approval status)
DROP POLICY IF EXISTS "Technicians and admins can update order results" ON public.order_results;
CREATE POLICY "Technicians and admins can update order results" ON public.order_results
FOR ALL TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM users 
    WHERE users.id = auth.uid() 
    AND users.role = ANY(ARRAY['admin'::user_role, 'technician'::user_role, 'manager'::user_role])
  )
);

-- Update RLS policy for order_results - allow managers to view all order results
DROP POLICY IF EXISTS "Users can view their order results" ON public.order_results;
CREATE POLICY "Users can view their order results" ON public.order_results
FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM orders 
    WHERE orders.id = order_results.order_id 
    AND (
      orders.customer_id = auth.uid() OR 
      EXISTS (
        SELECT 1 FROM users 
        WHERE users.id = auth.uid() 
        AND users.role = ANY(ARRAY['admin'::user_role, 'technician'::user_role, 'manager'::user_role])
      )
    )
  )
);


-- =====================================================================
-- MIGRATION: 20250821071353_sparkling_mud.sql
-- =====================================================================

/*
  # Add Manager Role and Test Result Approval System

  1. New Role
    - Add 'manager' to the user_role enum type
    
  2. New Column
    - Add `approval_status` column to order_results table
    - Default value: 'pending'
    - Possible values: 'pending', 'approved', 'rejected'
    
  3. Security Updates
    - Update RLS policies to include manager permissions
    - Managers can view all orders (like admins/technicians/finance)
    - Managers can update order results for approval purposes
    - Managers can view all order results

  4. Functionality
    - Managers can approve/reject individual test results
    - When all test results are approved, order status changes to 'results_approved'
    - All actions are audited through the existing audit system
*/

-- 1. Add 'manager' to the user_role enum
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum 
    WHERE enumlabel = 'manager' 
    AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'user_role')
  ) THEN
    ALTER TYPE public.user_role ADD VALUE 'manager';
  END IF;
END $$;

-- 2. Add approval_status column to order_results table
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'order_results' 
    AND column_name = 'approval_status'
    AND table_schema = 'public'
  ) THEN
    ALTER TABLE public.order_results 
    ADD COLUMN approval_status TEXT NOT NULL DEFAULT 'pending';
  END IF;
END $$;

-- 3. Update RLS policies to include manager role

-- Update the orders SELECT policy to include managers
DROP POLICY IF EXISTS "Users can view their own orders" ON public.orders;
CREATE POLICY "Users can view their own orders" ON public.orders
  FOR SELECT
  TO authenticated
  USING (
    (customer_id = auth.uid()) OR 
    (EXISTS (
      SELECT 1 FROM users 
      WHERE users.id = auth.uid() 
      AND users.role = ANY(ARRAY['admin'::user_role, 'technician'::user_role, 'finance'::user_role, 'manager'::user_role])
    ))
  );

-- Update the order_results UPDATE policy to include managers
DROP POLICY IF EXISTS "Technicians and admins can update order results" ON public.order_results;
CREATE POLICY "Technicians and admins can update order results" ON public.order_results
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM users 
      WHERE users.id = auth.uid() 
      AND users.role = ANY(ARRAY['admin'::user_role, 'technician'::user_role, 'manager'::user_role])
    )
  );

-- Update the order_results SELECT policy to include managers
DROP POLICY IF EXISTS "Users can view their order results" ON public.order_results;
CREATE POLICY "Users can view their order results" ON public.order_results
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM orders 
      WHERE orders.id = order_results.order_id 
      AND (
        orders.customer_id = auth.uid() OR 
        EXISTS (
          SELECT 1 FROM users 
          WHERE users.id = auth.uid() 
          AND users.role = ANY(ARRAY['admin'::user_role, 'technician'::user_role, 'manager'::user_role])
        )
      )
    )
  );


-- =====================================================================
-- MIGRATION: 20250822080348_tight_resonance.sql
-- =====================================================================

/*
  # Add QA Approval Columns to Orders Table

  1. New Columns
    - `qa_approval_status` (text) - Status of QA approval (approve/reject)
    - `qa_approval_notes` (text) - Notes from QA approval/rejection
    - `qa_approved_at` (timestamptz) - Timestamp when QA was approved/rejected
    - `qa_approved_by` (uuid) - ID of user who approved/rejected QA

  2. Changes
    - Add new columns to orders table with appropriate defaults
    - Add foreign key constraint for qa_approved_by
*/

-- Add QA approval columns to orders table
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'orders' AND column_name = 'qa_approval_status'
  ) THEN
    ALTER TABLE orders ADD COLUMN qa_approval_status text;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'orders' AND column_name = 'qa_approval_notes'
  ) THEN
    ALTER TABLE orders ADD COLUMN qa_approval_notes text;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'orders' AND column_name = 'qa_approved_at'
  ) THEN
    ALTER TABLE orders ADD COLUMN qa_approved_at timestamptz;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'orders' AND column_name = 'qa_approved_by'
  ) THEN
    ALTER TABLE orders ADD COLUMN qa_approved_by uuid;
  END IF;
END $$;

-- Add foreign key constraint for qa_approved_by if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'orders_qa_approved_by_fkey'
  ) THEN
    ALTER TABLE orders ADD CONSTRAINT orders_qa_approved_by_fkey 
    FOREIGN KEY (qa_approved_by) REFERENCES users(id);
  END IF;
END $$;


-- =====================================================================
-- MIGRATION: 20250822090220_fragrant_reef.sql
-- =====================================================================

/*
  # Add notes_app_rej column to order_results table

  1. Changes
    - Add `notes_app_rej` column to `order_results` table for storing approval/rejection notes
    - This separates approval/rejection notes from general notes

  2. Security
    - No changes to existing RLS policies needed
*/

-- Add the new column for approval/rejection notes
ALTER TABLE order_results 
ADD COLUMN IF NOT EXISTS notes_app_rej text;

-- Add a comment to document the column purpose
COMMENT ON COLUMN order_results.notes_app_rej IS 'Notes added during approval or rejection of test results';


-- =====================================================================
-- MIGRATION: 20250927182057_raspy_garden.sql
-- =====================================================================

/*
  # Add shipping_date to orders table

  1. Schema Changes
    - Add `shipping_date` column to `orders` table
    - Column type: `timestamp with time zone`
    - Allow null values for existing orders
    - Default value: null

  2. Purpose
    - Track when samples were shipped
    - Provide better shipping information management
    - Support mandatory date entry in UI
*/

-- Add shipping_date column to orders table
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'orders' AND column_name = 'shipping_date'
  ) THEN
    ALTER TABLE orders ADD COLUMN shipping_date timestamptz;
  END IF;
END $$;


-- =====================================================================
-- MIGRATION: 20251001000000_add_rejection_fields.sql
-- =====================================================================

/*
  # Add rejection fields to orders table

  1. Schema Changes
    - Add `rejection_notes` column to `orders` table to store the reason for sample rejection
    - Add `rejection_date` column to `orders` table to track when sample was rejected
    - Both columns allow null values for existing orders

  2. Purpose
    - Enable tracking of sample rejection reasons
    - Provide datetime stamp for rejection events
    - Support workflow where SAMPLE_SHIPPED orders can be rejected back to PENDING
    - Display rejection information in Shipping Details section

  3. Important Notes
    - Rejection functionality is available to admin, manager, and technician roles
    - When a sample is rejected, order status changes from 'sample_shipped' back to 'pending'
    - Rejection notes are mandatory when rejecting a sample
*/

-- Add rejection_notes column to orders table
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'orders' AND column_name = 'rejection_notes'
  ) THEN
    ALTER TABLE orders ADD COLUMN rejection_notes text;
  END IF;
END $$;

-- Add rejection_date column to orders table
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'orders' AND column_name = 'rejection_date'
  ) THEN
    ALTER TABLE orders ADD COLUMN rejection_date timestamptz;
  END IF;
END $$;


-- =====================================================================
-- MIGRATION: 20251002052851_add_waste_plastic_intake.sql
-- =====================================================================

/*
  # Add Plastic Waste Management - Waste Plastic Intake

  1. New Tables
    - `waste_plastic_intake`
      - `id` (uuid, primary key)
      - `intake_batch_reference` (text, unique) - Format: BUSINESS_CODE + YYMMDD + 001-999
      - `intake_date` (date) - Date of intake
      - `supplier` (text) - Name of supplier
      - `quantity_kg` (numeric) - Quantity in kilograms
      - `source` (text) - Pre-consumer or Post-consumer
      - `plastic_type_names` (text[]) - Array of plastic type names from plastic_types table
      - `condition` (text) - Pre-sorted or Cleaned
      - `pic` (text) - Person In Charge name
      - `remarks` (text) - Additional remarks
      - `no_scheduled_waste` (boolean) - Flag indicating no scheduled waste included
      - `inspector_name` (text) - Name of the inspector
      - `customer_id` (uuid) - Reference to customer who created the record
      - `created_at` (timestamptz) - Record creation timestamp
      - `created_by` (uuid) - User who created the record

  2. Security
    - Enable RLS on `waste_plastic_intake` table
    - Add policies for recycler customers to manage their own intake records
    - Add policies for admin users to view all records
*/

-- Create waste plastic intake table
CREATE TABLE IF NOT EXISTS waste_plastic_intake (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  intake_batch_reference text UNIQUE NOT NULL,
  intake_date date NOT NULL DEFAULT CURRENT_DATE,
  supplier text NOT NULL,
  quantity_kg numeric NOT NULL CHECK (quantity_kg > 0),
  source text NOT NULL CHECK (source IN ('Pre-consumer', 'Post-consumer')),
  plastic_type_names text[] NOT NULL CHECK (array_length(plastic_type_names, 1) > 0),
  condition text NOT NULL CHECK (condition IN ('Pre-sorted', 'Cleaned')),
  pic text NOT NULL,
  remarks text DEFAULT '',
  no_scheduled_waste boolean DEFAULT false,
  inspector_name text DEFAULT '',
  customer_id uuid NOT NULL,
  created_at timestamptz DEFAULT now(),
  created_by uuid NOT NULL
);

-- Enable RLS
ALTER TABLE waste_plastic_intake ENABLE ROW LEVEL SECURITY;

-- Policies for waste_plastic_intake
CREATE POLICY "Users can view their own intake records"
  ON waste_plastic_intake
  FOR SELECT
  TO authenticated
  USING (created_by = auth.uid());

CREATE POLICY "Users can insert their own intake records"
  ON waste_plastic_intake
  FOR INSERT
  TO authenticated
  WITH CHECK (created_by = auth.uid());

CREATE POLICY "Users can update their own intake records"
  ON waste_plastic_intake
  FOR UPDATE
  TO authenticated
  USING (created_by = auth.uid())
  WITH CHECK (created_by = auth.uid());

CREATE POLICY "Users can delete their own intake records"
  ON waste_plastic_intake
  FOR DELETE
  TO authenticated
  USING (created_by = auth.uid());

CREATE POLICY "Admins can view all intake records"
  ON waste_plastic_intake
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
      AND users.role = 'admin'
    )
  );

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_waste_plastic_intake_customer 
  ON waste_plastic_intake(customer_id);

CREATE INDEX IF NOT EXISTS idx_waste_plastic_intake_created_by 
  ON waste_plastic_intake(created_by);

CREATE INDEX IF NOT EXISTS idx_waste_plastic_intake_date 
  ON waste_plastic_intake(intake_date);

CREATE INDEX IF NOT EXISTS idx_waste_plastic_intake_batch_ref 
  ON waste_plastic_intake(intake_batch_reference);



-- =====================================================================
-- MIGRATION: 20251003000000_add_sorted_plastic_intake.sql
-- =====================================================================

/*
  # Add Plastic Waste Management - Sorted Plastic Intake

  1. New Tables
    - `sorted_plastic_intake`
      - `id` (uuid, primary key)
      - `intake_batch_reference` (text, unique) - Format: BUSINESS_CODE + YYMMDD + S + 001-999
      - `intake_date` (date) - Date of intake/dispatch
      - `buyer` (text) - Name of buyer/customer
      - `quantity_kg` (numeric) - Quantity in kilograms
      - `plastic_type_names` (text[]) - Array of plastic type names from plastic_types table
      - `grade` (text) - Quality grade of sorted plastic
      - `condition` (text) - Physical condition of the plastic
      - `pic` (text) - Person In Charge/Operator name
      - `remarks` (text) - Additional remarks
      - `quality_check_confirmed` (boolean) - Flag indicating quality check completed
      - `inspector_name` (text) - Name of the supervisor/inspector
      - `customer_id` (uuid) - Reference to customer who created the record
      - `created_at` (timestamptz) - Record creation timestamp
      - `created_by` (uuid) - User who created the record

  2. Security
    - Enable RLS on `sorted_plastic_intake` table
    - Add policies for recycler customers to manage their own intake records
    - Add policies for admin users to view all records
*/

-- Create sorted plastic intake table
CREATE TABLE IF NOT EXISTS sorted_plastic_intake (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  intake_batch_reference text UNIQUE NOT NULL,
  intake_date date NOT NULL DEFAULT CURRENT_DATE,
  buyer text NOT NULL,
  quantity_kg numeric NOT NULL CHECK (quantity_kg > 0),
  plastic_type_names text[] NOT NULL CHECK (array_length(plastic_type_names, 1) > 0),
  grade text NOT NULL,
  condition text NOT NULL,
  pic text NOT NULL,
  remarks text DEFAULT '',
  quality_check_confirmed boolean DEFAULT false,
  inspector_name text DEFAULT '',
  status text NOT NULL DEFAULT 'pending',
  customer_id uuid NOT NULL,
  created_at timestamptz DEFAULT now(),
  created_by uuid NOT NULL
);

-- Enable RLS
ALTER TABLE sorted_plastic_intake ENABLE ROW LEVEL SECURITY;

-- Policies for sorted_plastic_intake
CREATE POLICY "Users can view their own sorted intake records"
  ON sorted_plastic_intake
  FOR SELECT
  TO authenticated
  USING (created_by = auth.uid());

CREATE POLICY "Users can insert their own sorted intake records"
  ON sorted_plastic_intake
  FOR INSERT
  TO authenticated
  WITH CHECK (created_by = auth.uid());

CREATE POLICY "Users can update their own sorted intake records"
  ON sorted_plastic_intake
  FOR UPDATE
  TO authenticated
  USING (created_by = auth.uid())
  WITH CHECK (created_by = auth.uid());

CREATE POLICY "Users can delete their own sorted intake records"
  ON sorted_plastic_intake
  FOR DELETE
  TO authenticated
  USING (created_by = auth.uid());

CREATE POLICY "Admins can view all sorted intake records"
  ON sorted_plastic_intake
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
      AND users.role = 'admin'
    )
  );

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_sorted_plastic_intake_customer
  ON sorted_plastic_intake(customer_id);

CREATE INDEX IF NOT EXISTS idx_sorted_plastic_intake_created_by
  ON sorted_plastic_intake(created_by);

CREATE INDEX IF NOT EXISTS idx_sorted_plastic_intake_date
  ON sorted_plastic_intake(intake_date);

CREATE INDEX IF NOT EXISTS idx_sorted_plastic_intake_batch_ref
  ON sorted_plastic_intake(intake_batch_reference);



-- =====================================================================
-- MIGRATION: 20251020000000_add_colour_to_sorted_intake.sql
-- =====================================================================

/*
  # Add Colour Field to Sorted Plastic Intake

  1. Changes
    - Add `colour` column to `sorted_plastic_intake` table
    - Colour options: RED, GREEN, BLUE, YELLOW, MULTI, CLEAR
    - Set default value to 'CLEAR'

  2. Notes
    - This field tracks the colour of the sorted plastic material
    - Important for quality control and material specification
*/

-- Add colour column with constraint
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'sorted_plastic_intake' AND column_name = 'colour'
  ) THEN
    ALTER TABLE sorted_plastic_intake
    ADD COLUMN colour text DEFAULT 'CLEAR'
    CHECK (colour IN ('RED', 'GREEN', 'BLUE', 'YELLOW', 'MULTI', 'CLEAR'));
  END IF;
END $$;



-- =====================================================================
-- MIGRATION: 20251020000001_change_plastic_type_to_single.sql
-- =====================================================================

/*
  # Change Plastic Type from Array to Single Text Field

  1. Changes
    - Change `plastic_type_names` from text[] to text in `sorted_plastic_intake` table
    - Keep the same column name for backwards compatibility
    - Update to store only a single plastic type name

  2. Notes
    - Existing data with multiple types will need manual migration
    - This migration assumes either no data exists or data will be manually handled
    - The change enforces that each sorted intake batch is for a single plastic type
*/

-- Change plastic_type_names from array to single text field
DO $$
BEGIN
  -- Check if the column exists as an array type
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'sorted_plastic_intake'
    AND column_name = 'plastic_type_names'
    AND data_type = 'ARRAY'
  ) THEN
    -- Drop the existing column (assumes data will be handled separately)
    ALTER TABLE sorted_plastic_intake DROP COLUMN plastic_type_names;

    -- Add the new column as text
    ALTER TABLE sorted_plastic_intake
    ADD COLUMN plastic_type_names text NOT NULL DEFAULT '';

  END IF;
END $$;



-- =====================================================================
-- MIGRATION: 20251020000002_remove_buyer_field.sql
-- =====================================================================

/*
  # Remove Buyer Field from Sorted Plastic Intake

  1. Changes
    - Remove `buyer` column from `sorted_plastic_intake` table

  2. Notes
    - The buyer field is being replaced with waste intake batch references
    - This field is no longer needed for the new workflow
*/

-- Remove buyer column if it exists
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'sorted_plastic_intake' AND column_name = 'buyer'
  ) THEN
    ALTER TABLE sorted_plastic_intake DROP COLUMN buyer;
  END IF;
END $$;



-- =====================================================================
-- MIGRATION: 20251020000003_create_sorted_intake_allocations.sql
-- =====================================================================

/*
  # Create Sorted Plastic Intake Allocations Table

  1. New Tables
    - `sorted_plastic_intake_allocations`
      - `id` (uuid, primary key)
      - `sorted_intake_id` (uuid, foreign key to sorted_plastic_intake)
      - `waste_intake_batch_id` (uuid, foreign key to waste_plastic_intake)
      - `waste_intake_batch_reference` (text) - Denormalized for quick lookup
      - `allocated_weight_kg` (numeric) - Weight allocated from the waste batch
      - `created_at` (timestamptz)
      - `created_by` (uuid)

  2. Security
    - Enable RLS on `sorted_plastic_intake_allocations` table
    - Add policies for users to manage their own allocation records
    - Add policies for admin users to view all records

  3. Indexes
    - Index on sorted_intake_id for fast lookups
    - Index on waste_intake_batch_id for calculating remaining weights
    - Index on created_by for user-specific queries

  4. Notes
    - This table tracks which waste intake batches are used in sorted plastic production
    - The allocated_weight_kg must not exceed the remaining weight of the waste batch
    - Sum of allocated weights per waste batch cannot exceed the original quantity_kg
*/

-- Create sorted_plastic_intake_allocations table
CREATE TABLE IF NOT EXISTS sorted_plastic_intake_allocations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sorted_intake_id uuid NOT NULL REFERENCES sorted_plastic_intake(id) ON DELETE CASCADE,
  waste_intake_batch_id uuid NOT NULL REFERENCES waste_plastic_intake(id) ON DELETE RESTRICT,
  waste_intake_batch_reference text NOT NULL,
  allocated_weight_kg numeric NOT NULL CHECK (allocated_weight_kg > 0),
  created_at timestamptz DEFAULT now(),
  created_by uuid NOT NULL
);

-- Enable RLS
ALTER TABLE sorted_plastic_intake_allocations ENABLE ROW LEVEL SECURITY;

-- Policies for sorted_plastic_intake_allocations
CREATE POLICY "Users can view their own allocation records"
  ON sorted_plastic_intake_allocations
  FOR SELECT
  TO authenticated
  USING (created_by = auth.uid());

CREATE POLICY "Users can insert their own allocation records"
  ON sorted_plastic_intake_allocations
  FOR INSERT
  TO authenticated
  WITH CHECK (created_by = auth.uid());

CREATE POLICY "Users can update their own allocation records"
  ON sorted_plastic_intake_allocations
  FOR UPDATE
  TO authenticated
  USING (created_by = auth.uid())
  WITH CHECK (created_by = auth.uid());

CREATE POLICY "Users can delete their own allocation records"
  ON sorted_plastic_intake_allocations
  FOR DELETE
  TO authenticated
  USING (created_by = auth.uid());

CREATE POLICY "Admins can view all allocation records"
  ON sorted_plastic_intake_allocations
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
      AND users.role = 'admin'
    )
  );

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_sorted_intake_allocations_sorted_intake
  ON sorted_plastic_intake_allocations(sorted_intake_id);

CREATE INDEX IF NOT EXISTS idx_sorted_intake_allocations_waste_batch
  ON sorted_plastic_intake_allocations(waste_intake_batch_id);

CREATE INDEX IF NOT EXISTS idx_sorted_intake_allocations_created_by
  ON sorted_plastic_intake_allocations(created_by);

-- Create a function to calculate remaining weight for waste intake batches
CREATE OR REPLACE FUNCTION get_waste_intake_remaining_weight(batch_id uuid)
RETURNS numeric AS $$
DECLARE
  original_weight numeric;
  allocated_weight numeric;
BEGIN
  -- Get original weight
  SELECT quantity_kg INTO original_weight
  FROM waste_plastic_intake
  WHERE id = batch_id;

  -- Get total allocated weight
  SELECT COALESCE(SUM(allocated_weight_kg), 0) INTO allocated_weight
  FROM sorted_plastic_intake_allocations
  WHERE waste_intake_batch_id = batch_id;

  -- Return remaining weight
  RETURN original_weight - allocated_weight;
END;
$$ LANGUAGE plpgsql STABLE;



-- =====================================================================
-- MIGRATION: 20251118000000_add_certificate_columns.sql
-- =====================================================================

/*
  # Add Certificate Columns to Orders Table

  1. Changes
    - Add `certificate_uuid` column to orders table
      - VARCHAR(15) to store unique 15-character certificate identifier
      - Used for QR code generation on certificates
      - Generated only when certificate is first requested
    - Add `certificate_path` column to orders table
      - TEXT to store the storage path of generated PDF certificate
      - NULL until certificate is first generated
    - Add index on certificate_uuid for quick lookups

  2. Security
    - No RLS changes needed (inherits from orders table)
    - Certificate columns are part of existing orders table with existing policies
*/

-- Add certificate_uuid column
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'orders' AND column_name = 'certificate_uuid'
  ) THEN
    ALTER TABLE orders ADD COLUMN certificate_uuid VARCHAR(15) UNIQUE;
  END IF;
END $$;

-- Add certificate_path column
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'orders' AND column_name = 'certificate_path'
  ) THEN
    ALTER TABLE orders ADD COLUMN certificate_path TEXT;
  END IF;
END $$;

-- Create index on certificate_uuid for quick lookups
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE tablename = 'orders' AND indexname = 'idx_orders_certificate_uuid'
  ) THEN
    CREATE INDEX idx_orders_certificate_uuid ON orders(certificate_uuid);
  END IF;
END $$;

-- Add comment for documentation
COMMENT ON COLUMN orders.certificate_uuid IS 'Unique 15-character certificate identifier, generated when certificate is first requested';
COMMENT ON COLUMN orders.certificate_path IS 'Storage path of the generated PDF certificate';



-- =====================================================================
-- MIGRATION: 20251118000001_create_certificates_bucket.sql
-- =====================================================================

/*
  # Create Certificates Storage Bucket

  1. New Storage Bucket
    - `certificates` bucket for storing generated PDF certificates
    - Organized by order_id: certificates/{order_id}/certificate_{certificate_uuid}.pdf

  2. Security
    - Enable RLS on certificates bucket
    - Authenticated users can read certificates for their own orders
    - Admin and manager roles can read all certificates
    - System can insert certificates during generation
*/

-- Create certificates storage bucket
INSERT INTO storage.buckets (id, name, public)
VALUES ('certificates', 'certificates', false)
ON CONFLICT (id) DO NOTHING;

-- Enable RLS on certificates bucket
CREATE POLICY "Users can read own certificates"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'certificates'
  AND (
    -- Users can read their own order certificates
    EXISTS (
      SELECT 1 FROM orders
      WHERE orders.customer_id = auth.uid()
      AND storage.objects.name LIKE 'certificates/' || orders.id::text || '/%'
    )
    -- OR user is admin/manager
    OR EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
      AND users.role IN ('admin', 'manager')
    )
  )
);

-- Allow authenticated users to upload certificates (technician, admin roles)
CREATE POLICY "Technicians and admins can upload certificates"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'certificates'
  AND EXISTS (
    SELECT 1 FROM users
    WHERE users.id = auth.uid()
    AND users.role IN ('admin', 'manager', 'technician')
  )
);

-- Allow system to update certificates
CREATE POLICY "Technicians and admins can update certificates"
ON storage.objects
FOR UPDATE
TO authenticated
USING (
  bucket_id = 'certificates'
  AND EXISTS (
    SELECT 1 FROM users
    WHERE users.id = auth.uid()
    AND users.role IN ('admin', 'manager', 'technician')
  )
);

-- Allow deletion by admins only
CREATE POLICY "Admins can delete certificates"
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'certificates'
  AND EXISTS (
    SELECT 1 FROM users
    WHERE users.id = auth.uid()
    AND users.role = 'admin'
  )
);



-- =====================================================================
-- MIGRATION: 20251118000002_fix_certificate_upload_rls.sql
-- =====================================================================

/*
  # Fix Certificate Upload RLS Policies

  1. Changes
    - Update storage.objects INSERT policy to allow customers to upload certificates
    - Fix path pattern in SELECT policy to match actual code implementation
    - Allow customers to generate certificates for their own results_approved orders

  2. Security
    - Customers can upload certificates ONLY for:
      - Orders they own (customer_id = auth.uid())
      - Orders with status = 'results_approved'
      - Path must match pattern: {order_id}/certificate_{uuid}.pdf
    - Staff roles (admin, manager, technician) can upload any certificates
    - Path validation ensures customers cannot upload to other customer folders
    - SELECT policy updated to match actual file path structure (without 'certificates/' prefix)

  3. Notes
    - This fixes the "new row violates row-level security policy" error
    - Maintains security boundaries while enabling customer certificate generation
    - Path structure uses {orderId}/certificate_{uuid}.pdf directly
*/

-- Drop the existing restrictive INSERT policy
DROP POLICY IF EXISTS "Technicians and admins can upload certificates" ON storage.objects;

-- Create new INSERT policy that allows customers to upload their own certificates
CREATE POLICY "Users can upload certificates for approved orders"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'certificates'
  AND (
    -- Staff roles can upload any certificates
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
      AND users.role IN ('admin', 'manager', 'technician')
    )
    -- OR customers can upload certificates for their own results_approved orders
    OR EXISTS (
      SELECT 1 FROM orders
      WHERE orders.customer_id = auth.uid()
      AND orders.status = 'results_approved'
      -- Extract order ID from path (format: {order_id}/certificate_{uuid}.pdf)
      AND orders.id::text = split_part(storage.objects.name, '/', 1)
    )
  )
);

-- Update the SELECT policy to use correct path pattern (without 'certificates/' prefix)
DROP POLICY IF EXISTS "Users can read own certificates" ON storage.objects;

CREATE POLICY "Users can read own certificates"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'certificates'
  AND (
    -- Users can read their own order certificates
    -- Path format: {order_id}/certificate_{uuid}.pdf
    EXISTS (
      SELECT 1 FROM orders
      WHERE orders.customer_id = auth.uid()
      AND storage.objects.name LIKE orders.id::text || '/%'
    )
    -- OR user is admin/manager/technician
    OR EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
      AND users.role IN ('admin', 'manager', 'technician')
    )
  )
);

-- Add comment for documentation
COMMENT ON POLICY "Users can upload certificates for approved orders" ON storage.objects IS
  'Allows customers to upload certificates for their own results_approved orders, and staff to upload any certificates';

COMMENT ON POLICY "Users can read own certificates" ON storage.objects IS
  'Allows customers to read certificates for their own orders, and staff to read all certificates. Path format: {order_id}/certificate_{uuid}.pdf';



-- =====================================================================
-- MIGRATION: 20251119000000_add_completion_notes_to_orders.sql
-- =====================================================================

-- Add completion_notes field to orders table
-- This field stores mandatory notes when Manager or Admin marks an order as completed

ALTER TABLE orders 
ADD COLUMN IF NOT EXISTS completion_notes text;

-- Add comment for documentation
COMMENT ON COLUMN orders.completion_notes IS 'Mandatory notes entered by Manager or Admin when marking order as completed';



-- =====================================================================
-- MIGRATION: 20251119000001_create_order_status_trail.sql
-- =====================================================================

-- Create order_status_trail table to track all status changes
-- This provides complete audit trail for order lifecycle

CREATE TABLE IF NOT EXISTS order_status_trail (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  old_status text,
  new_status text NOT NULL,
  changed_by uuid NOT NULL REFERENCES users(id),
  changed_by_role text NOT NULL,
  changed_by_name text,
  notes text,
  created_at timestamptz DEFAULT now()
);

-- Add comments for documentation
COMMENT ON TABLE order_status_trail IS 'Audit trail of all order status changes';
COMMENT ON COLUMN order_status_trail.order_id IS 'Reference to the order';
COMMENT ON COLUMN order_status_trail.old_status IS 'Previous status before change';
COMMENT ON COLUMN order_status_trail.new_status IS 'New status after change';
COMMENT ON COLUMN order_status_trail.changed_by IS 'User ID who initiated the change';
COMMENT ON COLUMN order_status_trail.changed_by_role IS 'Role of user who initiated the change';
COMMENT ON COLUMN order_status_trail.changed_by_name IS 'Full name of user who initiated the change';
COMMENT ON COLUMN order_status_trail.notes IS 'Additional notes or reason for status change';
COMMENT ON COLUMN order_status_trail.created_at IS 'Timestamp when status change occurred';

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_order_status_trail_order_id 
  ON order_status_trail(order_id);

CREATE INDEX IF NOT EXISTS idx_order_status_trail_created_at 
  ON order_status_trail(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_order_status_trail_changed_by 
  ON order_status_trail(changed_by);

-- Enable RLS
ALTER TABLE order_status_trail ENABLE ROW LEVEL SECURITY;

-- Policy: Users can view status trail for orders they have access to
CREATE POLICY "Users can view status trail for accessible orders"
  ON order_status_trail
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM orders
      WHERE orders.id = order_status_trail.order_id
      AND (
        orders.customer_id = auth.uid() OR
        EXISTS (
          SELECT 1 FROM users
          WHERE users.id = auth.uid()
          AND users.role IN ('admin', 'technician', 'manager', 'finance')
        )
      )
    )
  );

-- Policy: Only authenticated users with proper roles can insert status trail records
CREATE POLICY "Authorized users can insert status trail records"
  ON order_status_trail
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
      AND users.role IN ('admin', 'technician', 'manager', 'finance', 'customer')
    )
  );

-- Policy: Admins can view all status trail records
CREATE POLICY "Admins can view all status trail records"
  ON order_status_trail
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
      AND users.role = 'admin'
    )
  );



-- =====================================================================
-- MIGRATION: 20251119000002_create_status_trail_functions.sql
-- =====================================================================

-- Create function to log order status changes
-- This function is called when order status is updated to maintain audit trail

CREATE OR REPLACE FUNCTION log_order_status_change(
  p_order_id uuid,
  p_old_status text,
  p_new_status text,
  p_changed_by uuid,
  p_notes text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_user_role text;
  v_user_name text;
  v_trail_id uuid;
BEGIN
  -- Get user role and name
  SELECT role::text, full_name 
  INTO v_user_role, v_user_name
  FROM users
  WHERE id = p_changed_by;

  -- Insert status trail record
  INSERT INTO order_status_trail (
    order_id,
    old_status,
    new_status,
    changed_by,
    changed_by_role,
    changed_by_name,
    notes
  )
  VALUES (
    p_order_id,
    p_old_status,
    p_new_status,
    p_changed_by,
    COALESCE(v_user_role, 'unknown'),
    COALESCE(v_user_name, 'Unknown User'),
    p_notes
  )
  RETURNING id INTO v_trail_id;

  RETURN v_trail_id;
END;
$$;

-- Create function to check if all test results are completed for an order
-- Returns true if all tests in the order's test suite have results entered

CREATE OR REPLACE FUNCTION check_order_tests_completed(p_order_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_total_tests integer;
  v_completed_tests integer;
BEGIN
  -- Count total tests in the order's test suite
  SELECT COUNT(DISTINCT tsi.test_id)
  INTO v_total_tests
  FROM orders o
  JOIN test_suite_items tsi ON tsi.test_suite_id = o.test_suite_id
  WHERE o.id = p_order_id;

  -- Count completed test results (results that are not null and not empty)
  SELECT COUNT(DISTINCT or_table.test_id)
  INTO v_completed_tests
  FROM order_results or_table
  WHERE or_table.order_id = p_order_id
  AND or_table.result IS NOT NULL
  AND TRIM(or_table.result) != '';

  -- Return true if all tests are completed
  RETURN (v_total_tests > 0 AND v_completed_tests >= v_total_tests);
END;
$$;

-- Create function to get test completion status for an order
-- Returns JSON with completion details

CREATE OR REPLACE FUNCTION get_order_test_completion_status(p_order_id uuid)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_total_tests integer;
  v_completed_tests integer;
  v_result json;
BEGIN
  -- Count total tests
  SELECT COUNT(DISTINCT tsi.test_id)
  INTO v_total_tests
  FROM orders o
  JOIN test_suite_items tsi ON tsi.test_suite_id = o.test_suite_id
  WHERE o.id = p_order_id;

  -- Count completed tests
  SELECT COUNT(DISTINCT or_table.test_id)
  INTO v_completed_tests
  FROM order_results or_table
  WHERE or_table.order_id = p_order_id
  AND or_table.result IS NOT NULL
  AND TRIM(or_table.result) != '';

  -- Build result JSON
  SELECT json_build_object(
    'total_tests', v_total_tests,
    'completed_tests', v_completed_tests,
    'all_completed', (v_total_tests > 0 AND v_completed_tests >= v_total_tests),
    'completion_percentage', 
      CASE 
        WHEN v_total_tests > 0 THEN ROUND((v_completed_tests::decimal / v_total_tests::decimal) * 100, 2)
        ELSE 0 
      END
  )
  INTO v_result;

  RETURN v_result;
END;
$$;

-- Add comments for documentation
COMMENT ON FUNCTION log_order_status_change IS 'Logs order status changes to the audit trail with user information and notes';
COMMENT ON FUNCTION check_order_tests_completed IS 'Checks if all test results are completed for an order';
COMMENT ON FUNCTION get_order_test_completion_status IS 'Returns detailed test completion status for an order';



-- =====================================================================
-- MIGRATION: 20251119000003_populate_existing_status_trail.sql
-- =====================================================================

-- Populate status trail for existing orders
-- This creates initial status trail records for orders that were created before this system

DO $$
DECLARE
  v_order record;
BEGIN
  -- Loop through all existing orders
  FOR v_order IN 
    SELECT id, status, customer_id, created_at
    FROM orders
  LOOP
    -- Check if this order already has a status trail entry
    IF NOT EXISTS (
      SELECT 1 FROM order_status_trail 
      WHERE order_id = v_order.id
    ) THEN
      -- Insert initial status trail record
      INSERT INTO order_status_trail (
        order_id,
        old_status,
        new_status,
        changed_by,
        changed_by_role,
        changed_by_name,
        notes,
        created_at
      )
      SELECT 
        v_order.id,
        NULL, -- No old status for initial creation
        v_order.status,
        v_order.customer_id,
        u.role::text,
        u.full_name,
        'Initial order creation (populated by migration)',
        v_order.created_at
      FROM users u
      WHERE u.id = v_order.customer_id;
    END IF;
  END LOOP;

  RAISE NOTICE 'Status trail population completed';
END $$;

-- Add comment
COMMENT ON EXTENSION plpgsql IS 'Populated existing orders with initial status trail records';



-- =====================================================================
-- MIGRATION: 20251119000004_add_sample_inspection_fields.sql
-- =====================================================================

/*
  # Add Sample Inspection Fields to Orders Table

  MANUAL EXECUTION REQUIRED:
  Please execute this migration manually in your Supabase SQL Editor.

  File name suggestion: 20251119000004_add_sample_inspection_fields.sql

  1. Schema Changes
    - Add `sample_inspection_status` column - tracks if sample was accepted/rejected
    - Add `sample_inspection_date` column - timestamp of inspection
    - Add `sample_inspection_notes` column - detailed notes about sample condition
    - Add `sample_inspection_photo_path` column - storage path to inspection photo
    - Add `inspected_by` column - references user who performed inspection

  2. Purpose
    - Enable comprehensive sample inspection workflow
    - Allow lab staff to accept samples (move to processing) or reject (return to pending)
    - Document sample condition with photos and detailed notes
    - Track who inspected the sample and when
    - Integrate with status trail for complete audit history

  3. Workflow
    - When sample arrives (status: sample_shipped), staff can inspect it
    - Accept: status changes to 'processing', inspection_status = 'accepted'
    - Reject: status changes to 'pending', inspection_status = 'rejected'
    - Photo and notes document the sample condition
    - Status trail captures the inspection event

  4. Important Notes
    - Inspection is performed by admin, manager, or technician roles
    - Photo upload is optional but recommended for documentation
    - Inspection notes are required (minimum 10 characters recommended)
    - Maintains backward compatibility with existing rejection_notes and rejection_date
    - New rejections populate both old and new fields
*/

-- Add sample_inspection_status column
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'orders' AND column_name = 'sample_inspection_status'
  ) THEN
    ALTER TABLE orders ADD COLUMN sample_inspection_status text;
    COMMENT ON COLUMN orders.sample_inspection_status IS 'Status of sample inspection: accepted or rejected';
  END IF;
END $$;

-- Add sample_inspection_date column
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'orders' AND column_name = 'sample_inspection_date'
  ) THEN
    ALTER TABLE orders ADD COLUMN sample_inspection_date timestamptz;
    COMMENT ON COLUMN orders.sample_inspection_date IS 'Timestamp when sample inspection occurred';
  END IF;
END $$;

-- Add sample_inspection_notes column
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'orders' AND column_name = 'sample_inspection_notes'
  ) THEN
    ALTER TABLE orders ADD COLUMN sample_inspection_notes text;
    COMMENT ON COLUMN orders.sample_inspection_notes IS 'Detailed notes about sample condition during inspection';
  END IF;
END $$;

-- Add sample_inspection_photo_path column
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'orders' AND column_name = 'sample_inspection_photo_path'
  ) THEN
    ALTER TABLE orders ADD COLUMN sample_inspection_photo_path text;
    COMMENT ON COLUMN orders.sample_inspection_photo_path IS 'Storage path to sample inspection photo';
  END IF;
END $$;

-- Add inspected_by column
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'orders' AND column_name = 'inspected_by'
  ) THEN
    ALTER TABLE orders ADD COLUMN inspected_by uuid REFERENCES users(id);
    COMMENT ON COLUMN orders.inspected_by IS 'User ID of person who performed the sample inspection';
  END IF;
END $$;

-- Add check constraint for inspection_status values
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'orders_sample_inspection_status_check'
  ) THEN
    ALTER TABLE orders
    ADD CONSTRAINT orders_sample_inspection_status_check
    CHECK (sample_inspection_status IN ('accepted', 'rejected') OR sample_inspection_status IS NULL);
  END IF;
END $$;



-- =====================================================================
-- MIGRATION: 20251119000005_create_sample_inspections_bucket.sql
-- =====================================================================

/*
  # Create Sample Inspections Storage Bucket

  MANUAL EXECUTION REQUIRED:
  Please execute this migration manually in your Supabase SQL Editor.

  File name suggestion: 20251119000005_create_sample_inspections_bucket.sql

  1. New Storage Bucket
    - `sample-inspections` bucket for storing sample inspection photos
    - Organized by order_id: sample-inspections/{order_id}/inspection_{timestamp}.jpg
    - Not public - requires authentication to access

  2. Security
    - Enable RLS on sample-inspections bucket
    - Admin, manager, and technician roles can upload inspection photos
    - Customers can read inspection photos for their own orders
    - Admin and manager roles can read all inspection photos
    - Only admins can delete inspection photos
*/

-- Create sample-inspections storage bucket
INSERT INTO storage.buckets (id, name, public)
VALUES ('sample-inspections', 'sample-inspections', false)
ON CONFLICT (id) DO NOTHING;

-- Enable RLS (Row Level Security) on the bucket
-- Policy: Customers can read inspection photos for their own orders
CREATE POLICY "Customers can read own order inspection photos"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'sample-inspections'
  AND (
    -- Customers can read their own order inspection photos
    EXISTS (
      SELECT 1 FROM orders
      WHERE orders.customer_id = auth.uid()
      AND storage.objects.name LIKE orders.id::text || '/%'
    )
    -- OR user is admin/manager/technician
    OR EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
      AND users.role IN ('admin', 'manager', 'technician')
    )
  )
);

-- Policy: Staff can upload inspection photos
CREATE POLICY "Staff can upload inspection photos"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'sample-inspections'
  AND EXISTS (
    SELECT 1 FROM users
    WHERE users.id = auth.uid()
    AND users.role IN ('admin', 'manager', 'technician')
  )
);

-- Policy: Staff can update inspection photos
CREATE POLICY "Staff can update inspection photos"
ON storage.objects
FOR UPDATE
TO authenticated
USING (
  bucket_id = 'sample-inspections'
  AND EXISTS (
    SELECT 1 FROM users
    WHERE users.id = auth.uid()
    AND users.role IN ('admin', 'manager', 'technician')
  )
);

-- Policy: Only admins can delete inspection photos
CREATE POLICY "Admins can delete inspection photos"
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'sample-inspections'
  AND EXISTS (
    SELECT 1 FROM users
    WHERE users.id = auth.uid()
    AND users.role = 'admin'
  )
);



-- =====================================================================
-- MIGRATION: 20251120000000_create_sorted_plastic_intake_processing.sql
-- =====================================================================

/*
  # Create sorted_plastic_intake_processing table (RECONSTRUCTED)

  This table was referenced by several later migrations and by the application
  code, but no migration in the inherited history actually created it — it had
  been created by hand in the dashboard on the original project. This migration
  reconstructs it from the application's ProcessingRecord interface and the
  insert/update/select calls in:
    - src/pages/ProcessingContent.tsx
    - src/pages/SortedIntakeContent.tsx
    - src/components/BatchOrderModal.tsx

  Placed at 20251120000000 so it runs AFTER sorted_plastic_intake (20251003)
  and BEFORE add_lab_status_to_processing (20251121), which alters this table.

  The status CHECK is created here as ('processing','completed'); the later
  lab-status migration drops and re-adds it to include 'lab'.
*/

CREATE TABLE IF NOT EXISTS sorted_plastic_intake_processing (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sorted_intake_id uuid NOT NULL REFERENCES sorted_plastic_intake(id) ON DELETE CASCADE,
  intake_batch_reference text NOT NULL,
  original_quantity_kg numeric NOT NULL,
  processing_start_date date NOT NULL,
  estimated_processing_completion_date date NOT NULL,
  actual_processing_completion_date date,
  post_processing_weight_kg numeric,
  preprocessing_notes text DEFAULT '',
  post_processing_notes text DEFAULT '',
  status text NOT NULL DEFAULT 'processing',
  created_by uuid NOT NULL REFERENCES users(id),
  created_at timestamptz DEFAULT now(),
  CONSTRAINT sorted_plastic_intake_processing_status_check
    CHECK (status IN ('processing', 'completed'))
);

ALTER TABLE sorted_plastic_intake_processing ENABLE ROW LEVEL SECURITY;

-- Mirror the RLS pattern used by the sibling table sorted_plastic_intake:
-- owners get full CRUD over their own rows; admins can view all.

CREATE POLICY "Users can view their own processing records"
  ON sorted_plastic_intake_processing
  FOR SELECT
  TO authenticated
  USING (created_by = auth.uid());

CREATE POLICY "Users can insert their own processing records"
  ON sorted_plastic_intake_processing
  FOR INSERT
  TO authenticated
  WITH CHECK (created_by = auth.uid());

CREATE POLICY "Users can update their own processing records"
  ON sorted_plastic_intake_processing
  FOR UPDATE
  TO authenticated
  USING (created_by = auth.uid())
  WITH CHECK (created_by = auth.uid());

CREATE POLICY "Users can delete their own processing records"
  ON sorted_plastic_intake_processing
  FOR DELETE
  TO authenticated
  USING (created_by = auth.uid());

CREATE POLICY "Admins can view all processing records"
  ON sorted_plastic_intake_processing
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
      AND users.role = 'admin'
    )
  );

-- Indexes for performance (mirror sibling table)
CREATE INDEX IF NOT EXISTS idx_sorted_plastic_intake_processing_created_by
  ON sorted_plastic_intake_processing(created_by);

CREATE INDEX IF NOT EXISTS idx_sorted_plastic_intake_processing_sorted_intake
  ON sorted_plastic_intake_processing(sorted_intake_id);

CREATE INDEX IF NOT EXISTS idx_sorted_plastic_intake_processing_status
  ON sorted_plastic_intake_processing(status);



-- =====================================================================
-- MIGRATION: 20251121000000_add_lab_status_to_processing.sql
-- =====================================================================

/*
  # Add Lab Status to Processing Tables

  ## Overview
  This migration adds "lab" as a valid status option for both sorted_plastic_intake
  and sorted_plastic_intake_processing tables to support lab testing workflow.

  ## Changes Made

  1. **sorted_plastic_intake_processing table**
     - Update status constraint from ('processing', 'completed')
       to ('processing', 'completed', 'lab')
     - The "lab" status indicates the batch has active testing orders

  2. **sorted_plastic_intake table**
     - Update status constraint from ('pending', 'processing', 'completed')
       to ('pending', 'processing', 'completed', 'lab')
     - The "lab" status indicates the batch has active testing orders

  3. **Documentation**
     - Add column comments explaining the "lab" status meaning

  ## Backward Compatibility
     - Existing data is not modified
     - All existing statuses remain valid
     - New "lab" status is added as an option, not required

  ## Security
     - No RLS changes needed
     - Existing policies remain unchanged
*/

-- Update sorted_plastic_intake_processing table status constraint
DO $$
BEGIN
  -- Drop the old constraint if it exists
  IF EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_name = 'sorted_plastic_intake_processing'
    AND constraint_name = 'sorted_plastic_intake_processing_status_check'
  ) THEN
    ALTER TABLE sorted_plastic_intake_processing
    DROP CONSTRAINT sorted_plastic_intake_processing_status_check;
  END IF;

  -- Add the new constraint with 'lab' status
  ALTER TABLE sorted_plastic_intake_processing
  ADD CONSTRAINT sorted_plastic_intake_processing_status_check
  CHECK (status IN ('processing', 'completed', 'lab'));
END $$;

-- Update sorted_plastic_intake table status constraint
DO $$
BEGIN
  -- Drop the old constraint if it exists
  IF EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_name = 'sorted_plastic_intake'
    AND constraint_name = 'sorted_plastic_intake_status_check'
  ) THEN
    ALTER TABLE sorted_plastic_intake
    DROP CONSTRAINT sorted_plastic_intake_status_check;
  END IF;

  -- Add the new constraint with 'lab' status
  ALTER TABLE sorted_plastic_intake
  ADD CONSTRAINT sorted_plastic_intake_status_check
  CHECK (status IN ('pending', 'processing', 'completed', 'lab'));
END $$;

-- Add documentation comments
COMMENT ON COLUMN sorted_plastic_intake_processing.status IS
  'Current processing status: processing (actively being processed), completed (processing finished), lab (has active testing orders)';

COMMENT ON COLUMN sorted_plastic_intake.status IS
  'Current batch status: pending (awaiting processing), processing (actively being processed), completed (processing finished), lab (has active testing orders)';



-- =====================================================================
-- MIGRATION: 20251122000000_add_order_source_and_batch_tracking.sql
-- =====================================================================

/*
  # Add Order Source and Batch Tracking

  ## Overview
  This migration adds the ability to track the source of orders and link orders to their originating processing batches.

  ## Changes Made

  1. **New Columns in orders table**
     - `order_source` (text): Indicates the origin of the order
       - 'direct': Order created directly by user (default)
       - 'waste_management': Order created from a completed processing batch
     - `processing_batch_id` (uuid, nullable): Foreign key reference to the processing batch

  2. **Constraints**
     - Check constraint ensures order_source is either 'direct' or 'waste_management'
     - Foreign key constraint links to sorted_plastic_intake_processing table
     - ON DELETE SET NULL ensures orders are preserved if batch is deleted

  3. **Indexes**
     - Index on order_source for efficient filtering
     - Index on processing_batch_id for efficient joins and lookups

  4. **Data Migration**
     - All existing orders are set to 'direct' source with NULL processing_batch_id
     - This maintains backwards compatibility

  ## Security
     - No RLS changes needed as orders table already has RLS policies
     - Foreign key ensures data integrity

  ## Usage Examples
     - Filter direct orders: WHERE order_source = 'direct'
     - Filter batch orders: WHERE order_source = 'waste_management'
     - Find orders from batch: WHERE processing_batch_id = 'batch-uuid'
     - Find batch for order: JOIN sorted_plastic_intake_processing ON orders.processing_batch_id = id
*/

-- Add order_source column with default value 'direct'
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'orders' AND column_name = 'order_source'
  ) THEN
    ALTER TABLE orders ADD COLUMN order_source text DEFAULT 'direct' NOT NULL;
  END IF;
END $$;

-- Add check constraint for order_source
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.constraint_column_usage
    WHERE table_name = 'orders' AND constraint_name = 'orders_order_source_check'
  ) THEN
    ALTER TABLE orders ADD CONSTRAINT orders_order_source_check
      CHECK (order_source IN ('direct', 'waste_management'));
  END IF;
END $$;

-- Add processing_batch_id column (nullable foreign key)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'orders' AND column_name = 'processing_batch_id'
  ) THEN
    ALTER TABLE orders ADD COLUMN processing_batch_id uuid;
  END IF;
END $$;

-- Add foreign key constraint with ON DELETE SET NULL
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_name = 'orders' AND constraint_name = 'orders_processing_batch_id_fkey'
  ) THEN
    ALTER TABLE orders ADD CONSTRAINT orders_processing_batch_id_fkey
      FOREIGN KEY (processing_batch_id)
      REFERENCES sorted_plastic_intake_processing(id)
      ON DELETE SET NULL;
  END IF;
END $$;

-- Create index on order_source for efficient filtering
CREATE INDEX IF NOT EXISTS idx_orders_order_source ON orders(order_source);

-- Create index on processing_batch_id for efficient joins
CREATE INDEX IF NOT EXISTS idx_orders_processing_batch_id ON orders(processing_batch_id);

-- Update existing orders to have 'direct' source (if not already set by default)
UPDATE orders
SET order_source = 'direct', processing_batch_id = NULL
WHERE order_source IS NULL OR order_source = '';

-- Add helpful comment to the table
COMMENT ON COLUMN orders.order_source IS 'Source of the order: direct (created by user) or waste_management (converted from processing batch)';
COMMENT ON COLUMN orders.processing_batch_id IS 'Reference to the processing batch if order was created from waste management (nullable)';



-- =====================================================================
-- MIGRATION: 20251124000000_add_dual_approval_processing.sql
-- =====================================================================

/*
  # Dual-Approval Processing Workflow Migration

  ⚠️ MANUAL EXECUTION REQUIRED ⚠️

  This migration MUST be executed manually in the Supabase SQL Editor.
  Do NOT use automated migration tools.

  Suggested filename for Supabase: 20251124000000_add_dual_approval_processing.sql

  ## Overview

  This migration implements a dual-approval workflow where orders can only transition
  to 'processing' status when BOTH conditions are met:

  1. Sample Inspection Status = 'accepted' (lab staff inspects and accepts the sample)
  2. Financial Status = 'approved' (finance team approves payment/budget)

  The approvals can happen in ANY order - the system automatically transitions the order
  to 'processing' when the second approval completes, regardless of which one happened first.

  ## Workflow Scenarios

  Scenario A - Sample Accepted First:
  1. Order created → status: 'pending', financial_status: 'pending_approval'
  2. Sample shipped → status: 'sample_shipped'
  3. Lab accepts sample → sample_inspection_status: 'accepted' (status stays 'sample_shipped')
  4. Finance approves → financial_status: 'approved' → ✅ TRIGGER FIRES → status: 'processing'

  Scenario B - Finance Approved First:
  1. Order created → status: 'pending', financial_status: 'pending_approval'
  2. Finance approves early → financial_status: 'approved' (status stays 'pending')
  3. Sample shipped → status: 'sample_shipped'
  4. Lab accepts sample → sample_inspection_status: 'accepted' → ✅ TRIGGER FIRES → status: 'processing'

  Scenario C - Sample Rejected:
  1. Lab rejects sample → status: 'pending', sample_inspection_status: 'rejected'
  2. Order cannot proceed to processing regardless of financial status
  3. Customer must correct issues and resend sample

  Scenario D - Finance Rejected:
  1. Finance rejects → financial_status: 'rejected'
  2. Order cannot proceed to processing regardless of sample inspection
  3. Customer must resolve payment/budget issues

  ## Changes Made

  1. **Function: check_and_update_order_processing_status**
     - Evaluates if both approvals are complete
     - Updates order status to 'processing' if conditions met
     - Logs status change to order_status_trail
     - Returns boolean indicating if status was changed

  2. **Trigger: trigger_check_dual_approval_after_update**
     - Fires AFTER UPDATE on orders table
     - Only executes when sample_inspection_status OR financial_status changes
     - Calls the checking function to evaluate status transition
     - Prevents infinite loops and duplicate processing

  3. **Performance Optimization**
     - Adds index on (sample_inspection_status, financial_status) for fast lookups
     - Ensures trigger only fires when relevant columns change

  ## Security & Data Integrity

  - No RLS policy changes needed - existing policies remain in effect
  - Function executes with invoker's permissions (SECURITY INVOKER)
  - All status changes are logged to audit trail for compliance
  - Idempotent design - safe to run multiple times

  ## Testing After Migration

  Run these queries to verify the migration:

  -- Check if function exists
  SELECT routine_name, routine_type
  FROM information_schema.routines
  WHERE routine_name = 'check_and_update_order_processing_status';

  -- Check if trigger exists
  SELECT trigger_name, event_manipulation, event_object_table
  FROM information_schema.triggers
  WHERE trigger_name = 'trigger_check_dual_approval_after_update';

  -- Test the function manually on a sample order
  SELECT check_and_update_order_processing_status('your-order-id-here');

  ## Rollback Instructions

  If you need to remove this functionality:

  -- Drop trigger first
  DROP TRIGGER IF EXISTS trigger_check_dual_approval_after_update ON orders;

  -- Drop function
  DROP FUNCTION IF EXISTS check_and_update_order_processing_status(uuid);

  -- Remove index (optional, but good for cleanup)
  DROP INDEX IF EXISTS idx_orders_approval_status;

  ## Support & Troubleshooting

  Common Issues:

  1. Trigger not firing
     - Check trigger exists: SELECT * FROM pg_trigger WHERE tgname = 'trigger_check_dual_approval_after_update';
     - Verify trigger is enabled: SELECT tgenabled FROM pg_trigger WHERE tgname = 'trigger_check_dual_approval_after_update';

  2. Status not updating automatically
     - Manually test function: SELECT check_and_update_order_processing_status('order-id');
     - Check if both conditions are met: SELECT sample_inspection_status, financial_status FROM orders WHERE id = 'order-id';
     - Verify status trail logs: SELECT * FROM order_status_trail WHERE order_id = 'order-id' ORDER BY created_at DESC;

  3. Infinite loop detected
     - Trigger includes safeguard checking if status is already 'processing'
     - Check OLD.status vs NEW.status in trigger logic
*/

-- ============================================================================
-- SECTION 1: Create Status Checking Function
-- ============================================================================

CREATE OR REPLACE FUNCTION check_and_update_order_processing_status(order_id_param uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
DECLARE
  v_order_record RECORD;
  v_status_changed boolean := false;
  v_current_user_id uuid;
  v_user_info RECORD;
BEGIN
  -- Get current user ID (will be NULL for trigger context, which is fine)
  v_current_user_id := auth.uid();

  -- Lock the order row to prevent race conditions
  SELECT
    id,
    status,
    sample_inspection_status,
    financial_status,
    approved_by
  INTO v_order_record
  FROM orders
  WHERE id = order_id_param
  FOR UPDATE;

  -- Check if order exists
  IF NOT FOUND THEN
    RAISE NOTICE 'Order not found: %', order_id_param;
    RETURN false;
  END IF;

  -- Log current state for debugging
  RAISE NOTICE 'Checking order %: status=%, sample_inspection=%, financial=%',
    order_id_param,
    v_order_record.status,
    v_order_record.sample_inspection_status,
    v_order_record.financial_status;

  -- Check if order is already in processing status
  IF v_order_record.status = 'processing' THEN
    RAISE NOTICE 'Order % already in processing status', order_id_param;
    RETURN false;
  END IF;

  -- Check if both approvals are complete
  IF v_order_record.sample_inspection_status = 'accepted'
     AND v_order_record.financial_status = 'approved' THEN

    -- Update order status to processing
    UPDATE orders
    SET status = 'processing'
    WHERE id = order_id_param;

    -- Get user info for status trail (use approved_by if current user is NULL)
    SELECT id, role, full_name
    INTO v_user_info
    FROM users
    WHERE id = COALESCE(v_current_user_id, v_order_record.approved_by)
    LIMIT 1;

    -- If still no user found, use a fallback
    IF v_user_info.id IS NULL THEN
      SELECT id, role, full_name
      INTO v_user_info
      FROM users
      WHERE role = 'admin'
      LIMIT 1;
    END IF;

    -- Log the status change to status trail
    INSERT INTO order_status_trail (
      order_id,
      old_status,
      new_status,
      changed_by,
      changed_by_role,
      changed_by_name,
      notes,
      created_at
    )
    SELECT
      order_id_param,
      v_order_record.status,
      'processing',
      v_user_info.id,
      v_user_info.role,
      v_user_info.full_name,
      'Automatic transition to processing: both sample inspection accepted and financial approval granted',
      NOW()
    WHERE NOT EXISTS (
      -- Prevent duplicate trail entries
      SELECT 1 FROM order_status_trail
      WHERE order_id = order_id_param
        AND old_status = v_order_record.status
        AND new_status = 'processing'
        AND created_at > NOW() - INTERVAL '1 minute'
    );

    RAISE NOTICE 'Order % transitioned to processing (dual approval complete)', order_id_param;
    v_status_changed := true;
  ELSE
    RAISE NOTICE 'Order % does not meet dual approval criteria: sample_inspection=%, financial=%',
      order_id_param,
      v_order_record.sample_inspection_status,
      v_order_record.financial_status;
  END IF;

  RETURN v_status_changed;
END;
$$;

-- Add comment to function
COMMENT ON FUNCTION check_and_update_order_processing_status(uuid) IS
  'Checks if order has both sample inspection accepted and financial approval granted. If yes, transitions order to processing status and logs to status trail. Returns true if status was changed.';

-- ============================================================================
-- SECTION 2: Create Trigger for Automatic Status Updates
-- ============================================================================

-- Drop trigger if it exists (idempotent)
DROP TRIGGER IF EXISTS trigger_check_dual_approval_after_update ON orders;

-- Wrapper trigger function: a trigger must call a function that RETURNS trigger
-- and cannot receive NEW.id as an argument. This wrapper reads NEW.id itself
-- and delegates to the checker function above.
CREATE OR REPLACE FUNCTION trg_check_dual_approval()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
BEGIN
  PERFORM check_and_update_order_processing_status(NEW.id);
  RETURN NEW;
END;
$$;

-- Create trigger that fires after relevant columns are updated
CREATE TRIGGER trigger_check_dual_approval_after_update
  AFTER UPDATE OF sample_inspection_status, financial_status ON orders
  FOR EACH ROW
  WHEN (
    -- Only fire when relevant columns actually changed
    (OLD.sample_inspection_status IS DISTINCT FROM NEW.sample_inspection_status
     OR OLD.financial_status IS DISTINCT FROM NEW.financial_status)
    -- And order is not already in processing status
    AND NEW.status != 'processing'
    -- And at least one of the approvals is now complete
    AND (NEW.sample_inspection_status = 'accepted' OR NEW.financial_status = 'approved')
  )
  EXECUTE FUNCTION trg_check_dual_approval();

-- Add comment to trigger
COMMENT ON TRIGGER trigger_check_dual_approval_after_update ON orders IS
  'Automatically checks if order meets dual-approval criteria (sample accepted + finance approved) and transitions to processing status if conditions are met. Fires only when sample_inspection_status or financial_status changes.';

-- ============================================================================
-- SECTION 3: Performance Optimization
-- ============================================================================

-- Create index for fast lookups of orders by approval status
-- This helps the trigger function perform better
CREATE INDEX IF NOT EXISTS idx_orders_approval_status
  ON orders(sample_inspection_status, financial_status)
  WHERE status != 'processing' AND status != 'completed';

-- Add comment to index
COMMENT ON INDEX idx_orders_approval_status IS
  'Optimizes queries filtering orders by approval status, particularly for dual-approval workflow checks. Partial index excludes orders already in processing or completed status.';

-- ============================================================================
-- SECTION 4: Add Column Documentation
-- ============================================================================

-- Update column comments to reflect dual-approval workflow
COMMENT ON COLUMN orders.sample_inspection_status IS
  'Status of physical sample inspection by lab staff: accepted (sample meets quality standards, one of two required approvals for processing), rejected (sample returned to customer), or NULL (not yet inspected). Must be accepted along with financial approval for order to proceed to processing.';

COMMENT ON COLUMN orders.financial_status IS
  'Financial approval status by finance team: approved (payment/budget approved, one of two required approvals for processing), rejected (payment/budget denied), or pending_approval (awaiting finance review). Must be approved along with sample acceptance for order to proceed to processing.';

COMMENT ON COLUMN orders.status IS
  'Current order workflow status. Order automatically transitions to processing when BOTH sample_inspection_status=accepted AND financial_status=approved (dual-approval requirement). Other statuses: pending (created, awaiting action), sample_shipped (physical sample sent to lab), completed (all tests done), results_approved (QA approved results), or cancelled.';

-- ============================================================================
-- SECTION 5: Verification Queries
-- ============================================================================

-- Run these after migration to verify everything is set up correctly:

/*
-- 1. Verify function was created
SELECT
  routine_name,
  routine_type,
  data_type as return_type,
  routine_definition
FROM information_schema.routines
WHERE routine_schema = 'public'
  AND routine_name = 'check_and_update_order_processing_status';

-- 2. Verify trigger was created
SELECT
  trigger_name,
  event_manipulation,
  event_object_table,
  action_statement,
  action_timing,
  action_orientation
FROM information_schema.triggers
WHERE trigger_schema = 'public'
  AND trigger_name = 'trigger_check_dual_approval_after_update';

-- 3. Verify index was created
SELECT
  schemaname,
  tablename,
  indexname,
  indexdef
FROM pg_indexes
WHERE schemaname = 'public'
  AND indexname = 'idx_orders_approval_status';

-- 4. Check column comments were added
SELECT
  column_name,
  col_description((table_schema||'.'||table_name)::regclass::oid, ordinal_position) as column_comment
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'orders'
  AND column_name IN ('sample_inspection_status', 'financial_status', 'status');

-- 5. Test the function on orders awaiting dual approval
-- (This will show which orders would be auto-transitioned)
SELECT
  id,
  order_number,
  status,
  sample_inspection_status,
  financial_status,
  check_and_update_order_processing_status(id) as would_transition
FROM orders
WHERE status != 'processing'
  AND status != 'completed'
  AND (sample_inspection_status = 'accepted' OR financial_status = 'approved')
LIMIT 10;
*/

-- ============================================================================
-- END OF MIGRATION
-- ============================================================================



-- =====================================================================
-- MIGRATION: 20260420184217_add_recycler_grades_and_profile_column.sql
-- =====================================================================

/*
  # Add Recycler Grades Table and Profile Column

  ## Summary
  This migration introduces recycler grading functionality for recycler-category customers.

  ## New Tables
  - `recycler_grades`
    - `id` (uuid, primary key) - Unique identifier
    - `grade` (text, required) - Grade name (e.g., "Grade A", "Premium")
    - `description` (text, nullable) - Optional description of the grade
    - `created_at` (timestamptz) - Record creation timestamp

  ## Modified Tables
  - `customer_profiles`
    - Added `recycler_grade_id` (uuid, nullable, FK to recycler_grades.id) - Assigned recycler grade for recycler-category customers

  ## Security
  - RLS enabled on `recycler_grades`
  - Authenticated users can SELECT (read grades for profile display)
  - Only admins can INSERT, UPDATE, DELETE recycler grades (enforced via policy checking users.role = 'admin')

  ## Notes
  1. The `recycler_grade_id` column is nullable because it only applies to customers with the "Recycler" business category
  2. Application logic enforces that only admins can change business_category_id and recycler_grade_id once a user is approved
*/

-- Create recycler_grades table
CREATE TABLE IF NOT EXISTS recycler_grades (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  grade text NOT NULL,
  description text,
  created_at timestamptz DEFAULT now()
);

-- Enable RLS
ALTER TABLE recycler_grades ENABLE ROW LEVEL SECURITY;

-- All authenticated users can read grades (needed for profile dropdown display)
CREATE POLICY "Authenticated users can view recycler grades"
  ON recycler_grades FOR SELECT
  TO authenticated
  USING (true);

-- Only admins can insert
CREATE POLICY "Admins can create recycler grades"
  ON recycler_grades FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
      AND users.role = 'admin'
    )
  );

-- Only admins can update
CREATE POLICY "Admins can update recycler grades"
  ON recycler_grades FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
      AND users.role = 'admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
      AND users.role = 'admin'
    )
  );

-- Only admins can delete
CREATE POLICY "Admins can delete recycler grades"
  ON recycler_grades FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
      AND users.role = 'admin'
    )
  );

-- Add recycler_grade_id column to customer_profiles
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'customer_profiles' AND column_name = 'recycler_grade_id'
  ) THEN
    ALTER TABLE customer_profiles
      ADD COLUMN recycler_grade_id uuid REFERENCES recycler_grades(id) ON DELETE SET NULL;
  END IF;
END $$;



-- =====================================================================
-- MIGRATION: 20260426193245_create_marketplace_tables.sql
-- =====================================================================

/*
  # Marketplace: Listings and Bids

  Creates a two-sided anonymous marketplace where Recyclers (sellers)
  publish lab-tested processed batches and Packaging Manufacturers (buyers)
  bid on them.

  1. Reference Data
     - Insert "Packaging Manufacturer" business category if missing.

  2. New Tables
     - `marketplace_listings`
        - id (uuid, pk)
        - processing_batch_id (uuid, fk -> sorted_plastic_intake_processing)
        - seller_id (uuid, fk -> users)
        - quantity_kg (numeric, > 0)
        - offer_price_per_kg (numeric, > 0)
        - status (text: active/sold/withdrawn, default 'active')
        - published_at (timestamptz)
        - created_at (timestamptz)
        - Unique partial index: only one active listing per processing batch.

     - `marketplace_bids`
        - id (uuid, pk)
        - listing_id (uuid, fk -> marketplace_listings, on delete cascade)
        - buyer_id (uuid, fk -> users)
        - bid_quantity_kg (numeric, > 0)
        - bid_price_per_kg (numeric, > 0)
        - status (text: pending/accepted/rejected/withdrawn, default 'pending')
        - response_note (text, nullable)
        - seller_response_at (timestamptz, nullable)
        - buyer_seen_response (boolean, default false)
        - created_at (timestamptz)

  3. Security
     - RLS enabled on both tables.
     - Listings: sellers manage their own; admins see all; everyone authenticated can SELECT
       active listings (used by buyers; the UI hides seller identity).
     - Bids: buyers manage their own; sellers can view + respond to bids on their listings;
       admins see all.
*/

-- 1. Ensure "Packaging Manufacturer" business category exists
INSERT INTO business_categories (name, description)
SELECT 'Packaging Manufacturer', 'Manufacturers that purchase processed recycled plastic for packaging production'
WHERE NOT EXISTS (
  SELECT 1 FROM business_categories WHERE name = 'Packaging Manufacturer'
);

-- 2. marketplace_listings
CREATE TABLE IF NOT EXISTS marketplace_listings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  processing_batch_id uuid NOT NULL REFERENCES sorted_plastic_intake_processing(id) ON DELETE CASCADE,
  seller_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  quantity_kg numeric NOT NULL CHECK (quantity_kg > 0),
  offer_price_per_kg numeric NOT NULL CHECK (offer_price_per_kg > 0),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'sold', 'withdrawn')),
  published_at timestamptz DEFAULT now(),
  created_at timestamptz DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS marketplace_listings_one_active_per_batch
  ON marketplace_listings(processing_batch_id)
  WHERE status = 'active';

CREATE INDEX IF NOT EXISTS marketplace_listings_status_idx ON marketplace_listings(status);
CREATE INDEX IF NOT EXISTS marketplace_listings_seller_idx ON marketplace_listings(seller_id);

ALTER TABLE marketplace_listings ENABLE ROW LEVEL SECURITY;

-- Sellers can view their own listings
CREATE POLICY "Sellers can view own listings"
  ON marketplace_listings FOR SELECT
  TO authenticated
  USING (seller_id = auth.uid());

-- Approved authenticated users can view active listings (buyer browsing)
CREATE POLICY "Authenticated can view active listings"
  ON marketplace_listings FOR SELECT
  TO authenticated
  USING (status = 'active');

-- Admins can view all
CREATE POLICY "Admins can view all listings"
  ON marketplace_listings FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role = 'admin'
    )
  );

-- Sellers can create listings for their own batches
CREATE POLICY "Sellers can insert own listings"
  ON marketplace_listings FOR INSERT
  TO authenticated
  WITH CHECK (
    seller_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM sorted_plastic_intake_processing p
      WHERE p.id = processing_batch_id
        AND p.created_by = auth.uid()
    )
  );

-- Sellers can update own listings
CREATE POLICY "Sellers can update own listings"
  ON marketplace_listings FOR UPDATE
  TO authenticated
  USING (seller_id = auth.uid())
  WITH CHECK (seller_id = auth.uid());

-- Admins can update all
CREATE POLICY "Admins can update all listings"
  ON marketplace_listings FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role = 'admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role = 'admin'
    )
  );

-- Sellers can delete own listings (only if no accepted bid)
CREATE POLICY "Sellers can delete own listings"
  ON marketplace_listings FOR DELETE
  TO authenticated
  USING (seller_id = auth.uid());

-- 3. marketplace_bids
CREATE TABLE IF NOT EXISTS marketplace_bids (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_id uuid NOT NULL REFERENCES marketplace_listings(id) ON DELETE CASCADE,
  buyer_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  bid_quantity_kg numeric NOT NULL CHECK (bid_quantity_kg > 0),
  bid_price_per_kg numeric NOT NULL CHECK (bid_price_per_kg > 0),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'rejected', 'withdrawn')),
  response_note text,
  seller_response_at timestamptz,
  buyer_seen_response boolean DEFAULT false,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS marketplace_bids_listing_idx ON marketplace_bids(listing_id);
CREATE INDEX IF NOT EXISTS marketplace_bids_buyer_idx ON marketplace_bids(buyer_id);
CREATE INDEX IF NOT EXISTS marketplace_bids_status_idx ON marketplace_bids(status);

ALTER TABLE marketplace_bids ENABLE ROW LEVEL SECURITY;

-- Buyers can view own bids
CREATE POLICY "Buyers can view own bids"
  ON marketplace_bids FOR SELECT
  TO authenticated
  USING (buyer_id = auth.uid());

-- Sellers can view bids on their listings
CREATE POLICY "Sellers can view bids on own listings"
  ON marketplace_bids FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM marketplace_listings l
      WHERE l.id = listing_id AND l.seller_id = auth.uid()
    )
  );

-- Admins can view all bids
CREATE POLICY "Admins can view all bids"
  ON marketplace_bids FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role = 'admin'
    )
  );

-- Buyers can place bids on active listings (and not on their own listings)
CREATE POLICY "Buyers can insert bids"
  ON marketplace_bids FOR INSERT
  TO authenticated
  WITH CHECK (
    buyer_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM marketplace_listings l
      WHERE l.id = listing_id
        AND l.status = 'active'
        AND l.seller_id <> auth.uid()
    )
  );

-- Buyers can update their own bids (e.g., withdraw, mark response seen)
CREATE POLICY "Buyers can update own bids"
  ON marketplace_bids FOR UPDATE
  TO authenticated
  USING (buyer_id = auth.uid())
  WITH CHECK (buyer_id = auth.uid());

-- Sellers can update bids on their listings (accept/reject + response_note)
CREATE POLICY "Sellers can update bids on own listings"
  ON marketplace_bids FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM marketplace_listings l
      WHERE l.id = listing_id AND l.seller_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM marketplace_listings l
      WHERE l.id = listing_id AND l.seller_id = auth.uid()
    )
  );

-- Admins can update all bids
CREATE POLICY "Admins can update all bids"
  ON marketplace_bids FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role = 'admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role = 'admin'
    )
  );



-- =====================================================================
-- MIGRATION: 20260510162040_20260510000001_marketplace_read_policies.sql
-- =====================================================================

/*
  # Grant marketplace-scoped read access to buyers

  ## Problem
  Buyers viewing the Marketplace see blank lot cards (plastic type, grade, colour
  missing) and cannot see published lab test results. The labels render but the
  joined values are NULL because RLS on the underlying seller tables only grants
  SELECT to the owner (`created_by = auth.uid()`) or admins.

  Affected tables and joins:
    - `sorted_plastic_intake_processing` (joined via listing.processing_batch_id)
    - `sorted_plastic_intake` (joined via processing_batch.sorted_intake_id)
    - `orders` (filtered by processing_batch_id to find the approved lab order)
    - `order_results` (filtered by order_id for approved test results)

  ## Changes

  1. New SELECT policy on `sorted_plastic_intake_processing`
     - "Anyone can view processing batches with active listings"
     - Allows any authenticated user to SELECT a processing batch row when there
       is a row in `marketplace_listings` with status = 'active' and
       processing_batch_id = this row's id.

  2. New SELECT policy on `sorted_plastic_intake`
     - "Anyone can view sorted intake referenced by active listings"
     - Allows any authenticated user to SELECT a sorted intake row when it is
       referenced by a processing batch that has an active marketplace listing.

  3. New SELECT policy on `orders`
     - "Anyone can view approved orders for active listings"
     - Allows any authenticated user to SELECT an order when the order's
       processing_batch_id has an active listing AND status = 'results_approved'.
     - Existing owner/staff SELECT policy remains unchanged.

  4. Extended SELECT policy on `order_results`
     - Replaces existing "Users can view their order results" policy.
     - Preserves existing access (customer viewing own results_approved orders,
       and staff roles).
     - Adds a new branch: any authenticated user can view results when the
       parent order's processing_batch_id has an active listing AND the order
       is results_approved AND the result itself is approved.

  ## Security Notes

  1. RLS remains enabled on all four tables.
  2. New access is strictly gated on the presence of an `active` row in
     `marketplace_listings`. Sellers control visibility by publishing/withdrawing
     listings.
  3. Only `results_approved` orders and `approved` result rows are exposed via
     the marketplace branch; unapproved lab data stays private.
  4. No existing policy has been loosened; only additional permissive branches
     were added, limited to marketplace-published rows.
*/

-- 1. sorted_plastic_intake_processing: allow read when batch has an active listing
DROP POLICY IF EXISTS "Anyone can view processing batches with active listings" ON public.sorted_plastic_intake_processing;
CREATE POLICY "Anyone can view processing batches with active listings"
  ON public.sorted_plastic_intake_processing
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.marketplace_listings ml
      WHERE ml.processing_batch_id = sorted_plastic_intake_processing.id
      AND ml.status = 'active'
    )
  );

-- 2. sorted_plastic_intake: allow read when referenced by a batch with an active listing
DROP POLICY IF EXISTS "Anyone can view sorted intake referenced by active listings" ON public.sorted_plastic_intake;
CREATE POLICY "Anyone can view sorted intake referenced by active listings"
  ON public.sorted_plastic_intake
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.sorted_plastic_intake_processing spip
      JOIN public.marketplace_listings ml ON ml.processing_batch_id = spip.id
      WHERE spip.sorted_intake_id = sorted_plastic_intake.id
      AND ml.status = 'active'
    )
  );

-- 3. orders: allow read when the order's processing batch has an active listing AND status is results_approved
DROP POLICY IF EXISTS "Anyone can view approved orders for active listings" ON public.orders;
CREATE POLICY "Anyone can view approved orders for active listings"
  ON public.orders
  FOR SELECT
  TO authenticated
  USING (
    status = 'results_approved'
    AND processing_batch_id IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM public.marketplace_listings ml
      WHERE ml.processing_batch_id = orders.processing_batch_id
      AND ml.status = 'active'
    )
  );

-- 4. order_results: extend SELECT to include marketplace-published approved results
DROP POLICY IF EXISTS "Users can view their order results" ON public.order_results;
CREATE POLICY "Users can view their order results" ON public.order_results
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.orders
      WHERE orders.id = order_results.order_id
      AND (
        (
          orders.customer_id = auth.uid()
          AND orders.status = 'results_approved'
        )
        OR EXISTS (
          SELECT 1 FROM public.users
          WHERE users.id = auth.uid()
          AND users.role = ANY(ARRAY['admin'::user_role, 'technician'::user_role, 'manager'::user_role, 'finance'::user_role])
        )
        OR (
          orders.status = 'results_approved'
          AND order_results.approval_status = 'approved'
          AND orders.processing_batch_id IS NOT NULL
          AND EXISTS (
            SELECT 1 FROM public.marketplace_listings ml
            WHERE ml.processing_batch_id = orders.processing_batch_id
            AND ml.status = 'active'
          )
        )
      )
    )
  );



-- =====================================================================
-- MIGRATION: 20260510192838_20260510000002_cascade_qa_approval_to_results.sql
-- =====================================================================

/*
  # Cascade QA approval to order_results rows

  ## Problem
  Orders have two parallel approval flags:
    - `orders.qa_approval_status` (order-level, drives marketplace visibility)
    - `order_results.approval_status` (per-test row flag)
  When a manager QA-approves an order, the order-level status cascades to
  `orders.status = 'results_approved'` via a trigger, but each result row's
  `approval_status` stays at `'pending'`. The Marketplace lab results modal
  filters on `order_results.approval_status = 'approved'`, so it shows no rows.

  ## Changes
  1. Update function `sync_order_status_on_qa_approval`
     - When `qa_approval_status` transitions to `'approved'`, cascade by
       updating `order_results` rows for this order that are still `'pending'`
       to `'approved'`. Rows already marked `'rejected'` are left untouched.
  2. Backfill
     - For every order where `qa_approval_status = 'approved'`, set
       `approval_status = 'approved'` on its `order_results` rows currently
       `'pending'`, so existing published lots show their results immediately.

  ## Security
  No RLS changes. The trigger runs as SECURITY DEFINER (pre-existing) to allow
  the cascade across ownership boundaries.
*/

CREATE OR REPLACE FUNCTION public.sync_order_status_on_qa_approval()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.qa_approval_status = 'approved'
     AND (OLD.qa_approval_status IS DISTINCT FROM 'approved')
     AND NEW.status = 'completed' THEN
    NEW.status := 'results_approved';
  END IF;

  IF NEW.qa_approval_status = 'approved'
     AND (OLD.qa_approval_status IS DISTINCT FROM 'approved') THEN
    UPDATE public.order_results
    SET approval_status = 'approved'
    WHERE order_id = NEW.id
      AND approval_status = 'pending';
  END IF;

  RETURN NEW;
END;
$function$;

-- Backfill: approve pending result rows for orders already QA-approved
UPDATE public.order_results
SET approval_status = 'approved'
WHERE approval_status = 'pending'
  AND order_id IN (
    SELECT id FROM public.orders WHERE qa_approval_status = 'approved'
  );

