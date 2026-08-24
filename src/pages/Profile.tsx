import React, { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../hooks/useAuth';
import { Upload, Trash2, Lock } from 'lucide-react';

interface BusinessCategory {
  id: string;
  name: string;
}

interface RecyclerGrade {
  id: string;
  grade: string;
  description: string | null;
}

interface RequiredDocument {
  id: string;
  name: string;
  description: string | null;
  is_required: boolean;
}

interface CustomerDocument {
  id: string;
  document_type_id: string;
  file_name: string;
}

interface CustomerProfile {
  id: string;
  business_name: string;
  business_category_id: string | null;
  contact_person: string;
  phone: string | null;
  address: string | null;
  business_code: string | null;
  recycler_grade_id: string | null;
}

export function Profile() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [categories, setCategories] = useState<BusinessCategory[]>([]);
  const [recyclerGrades, setRecyclerGrades] = useState<RecyclerGrade[]>([]);
  const [requiredDocuments, setRequiredDocuments] = useState<RequiredDocument[]>([]);
  const [customerDocuments, setCustomerDocuments] = useState<CustomerDocument[]>([]);
  const [profile, setProfile] = useState<CustomerProfile | null>(null);
  const [userStatus, setUserStatus] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    businessName: '',
    businessCategoryId: '',
    recyclerGradeId: '',
    contactPerson: '',
    phone: '',
    address: '',
  });

  const isApproved = userStatus === 'approved';

  // Derive the name of the currently selected category
  const selectedCategoryName = categories.find(c => c.id === formData.businessCategoryId)?.name ?? '';
  const isRecyclerCategory = selectedCategoryName === 'Recycler';

  useEffect(() => {
    if (!user) return;

    const fetchData = async () => {
      try {
        // Fetch user status
        const { data: userData } = await supabase
          .from('users')
          .select('status')
          .eq('id', user.id)
          .maybeSingle();
        setUserStatus(userData?.status ?? null);

        // Fetch categories
        const { data: categoriesData, error: categoriesError } = await supabase
          .from('business_categories')
          .select('*')
          .order('name');
        if (categoriesError) throw categoriesError;
        setCategories(categoriesData);

        // Fetch recycler grades
        const { data: gradesData, error: gradesError } = await supabase
          .from('recycler_grades')
          .select('*')
          .order('grade');
        if (gradesError) throw gradesError;
        setRecyclerGrades(gradesData || []);

        // Fetch profile
        const { data: profileData, error: profileError } = await supabase
          .from('customer_profiles')
          .select('*')
          .eq('user_id', user.id)
          .maybeSingle();

        if (profileError && profileError.code !== 'PGRST116') throw profileError;

        if (profileData) {
          setProfile(profileData);
          setFormData({
            businessName: profileData.business_name,
            businessCategoryId: profileData.business_category_id || '',
            recyclerGradeId: profileData.recycler_grade_id || '',
            contactPerson: profileData.contact_person,
            phone: profileData.phone || '',
            address: profileData.address || '',
          });

          if (profileData.business_category_id) {
            const { data: documentsData, error: documentsError } = await supabase
              .from('required_documents')
              .select('*')
              .eq('category_id', profileData.business_category_id)
              .order('name');
            if (documentsError) throw documentsError;
            setRequiredDocuments(documentsData);

            const { data: uploadedDocs, error: uploadedError } = await supabase
              .from('customer_documents')
              .select('*')
              .eq('customer_id', profileData.id);
            if (uploadedError) throw uploadedError;
            setCustomerDocuments(uploadedDocs);
          }
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'An error occurred');
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [user]);

  const handleCategoryChange = async (categoryId: string) => {
    setFormData({ ...formData, businessCategoryId: categoryId, recyclerGradeId: '' });

    try {
      const { data, error } = await supabase
        .from('required_documents')
        .select('*')
        .eq('category_id', categoryId)
        .order('name');
      if (error) throw error;
      setRequiredDocuments(data);
      setCustomerDocuments([]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch required documents');
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;

    try {
      const profileData: Record<string, unknown> = {
        user_id: user.id,
        business_name: formData.businessName,
        contact_person: formData.contactPerson,
        phone: formData.phone || null,
        address: formData.address || null,
      };

      // Only include category and grade if user is not yet approved
      if (!isApproved) {
        profileData.business_category_id = formData.businessCategoryId || null;
        profileData.recycler_grade_id = isRecyclerCategory ? (formData.recyclerGradeId || null) : null;
      }

      if (profile) {
        const { error } = await supabase
          .from('customer_profiles')
          .update(profileData)
          .eq('id', profile.id);
        if (error) throw error;
      } else {
        const { data, error } = await supabase
          .from('customer_profiles')
          .insert([profileData])
          .select()
          .single();
        if (error) throw error;
        setProfile(data);
      }

      setError('Profile updated successfully');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update profile');
    }
  };

  const handleFileUpload = async (documentTypeId: string, file: File) => {
    if (!profile) return;

    try {
      const fileExt = file.name.split('.').pop();
      const fileName = `${Math.random()}.${fileExt}`;
      const filePath = `${profile.id}/${fileName}`;

      const { error: uploadError } = await supabase.storage
        .from('customer-documents')
        .upload(filePath, file);
      if (uploadError) throw uploadError;

      const { error: dbError } = await supabase
        .from('customer_documents')
        .insert([{
          customer_id: profile.id,
          document_type_id: documentTypeId,
          file_name: file.name,
          file_path: filePath,
        }]);
      if (dbError) throw dbError;

      const { data: documents, error: fetchError } = await supabase
        .from('customer_documents')
        .select('*')
        .eq('customer_id', profile.id);
      if (fetchError) throw fetchError;
      setCustomerDocuments(documents);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to upload document');
    }
  };

  const handleDeleteDocument = async (documentId: string) => {
    try {
      const { error } = await supabase
        .from('customer_documents')
        .delete()
        .eq('id', documentId);
      if (error) throw error;
      setCustomerDocuments(customerDocuments.filter(doc => doc.id !== documentId));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete document');
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900"></div>
      </div>
    );
  }

  const inputClass = "mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500";
  const disabledInputClass = "mt-1 block w-full rounded-md border-gray-200 bg-gray-50 text-gray-700 shadow-sm cursor-not-allowed";

  return (
    <div className="container mx-auto px-4 py-8">
      <h1 className="text-2xl font-bold text-gray-900 mb-8">
        {profile ? 'Update Profile' : 'Complete Your Profile'}
      </h1>

      {error && (
        <div className={`p-4 rounded-md mb-6 ${
          error === 'Profile updated successfully'
            ? 'bg-green-50 text-green-700'
            : 'bg-red-50 text-red-700'
        }`}>
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-6 bg-white shadow rounded-lg p-6">
        <div>
          <label className="block text-sm font-medium text-gray-700">Business Name</label>
          <input
            type="text"
            required
            value={formData.businessName}
            onChange={(e) => setFormData({ ...formData, businessName: e.target.value })}
            className={inputClass}
          />
        </div>

        <div>
          <div className="flex items-center justify-between mb-1">
            <label className="block text-sm font-medium text-gray-700">Business Category</label>
            {isApproved && (
              <span className="flex items-center gap-1 text-xs text-amber-600">
                <Lock className="w-3 h-3" />
                Managed by admin
              </span>
            )}
          </div>
          {isApproved ? (
            <div className={disabledInputClass + ' px-3 py-2'}>
              {selectedCategoryName || <span className="text-gray-400 italic">Not selected</span>}
            </div>
          ) : (
            <select
              value={formData.businessCategoryId}
              onChange={(e) => handleCategoryChange(e.target.value)}
              className={inputClass}
            >
              <option value="">Select a category</option>
              {categories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
            </select>
          )}
        </div>

        {isRecyclerCategory && (
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="block text-sm font-medium text-gray-700">Recycler Grade</label>
              {isApproved && (
                <span className="flex items-center gap-1 text-xs text-amber-600">
                  <Lock className="w-3 h-3" />
                  Managed by admin
                </span>
              )}
            </div>
            {isApproved ? (
              <div className={disabledInputClass + ' px-3 py-2'}>
                {recyclerGrades.find(g => g.id === formData.recyclerGradeId)?.grade || (
                  <span className="text-gray-400 italic">Not assigned</span>
                )}
              </div>
            ) : (
              <select
                value={formData.recyclerGradeId}
                onChange={(e) => setFormData({ ...formData, recyclerGradeId: e.target.value })}
                className={inputClass}
              >
                <option value="">Select a grade</option>
                {recyclerGrades.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.grade}{g.description ? ` — ${g.description}` : ''}
                  </option>
                ))}
              </select>
            )}
          </div>
        )}

        <div>
          <label className="block text-sm font-medium text-gray-700">Contact Person</label>
          <input
            type="text"
            required
            value={formData.contactPerson}
            onChange={(e) => setFormData({ ...formData, contactPerson: e.target.value })}
            className={inputClass}
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700">Phone</label>
          <input
            type="tel"
            value={formData.phone}
            onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
            className={inputClass}
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700">Address</label>
          <textarea
            value={formData.address}
            onChange={(e) => setFormData({ ...formData, address: e.target.value })}
            rows={3}
            className={inputClass}
          />
        </div>

        {profile?.business_code && (
          <div>
            <label className="block text-sm font-medium text-gray-700">Business Code</label>
            <div className="mt-1 px-3 py-2 bg-gray-100 rounded-md text-gray-700 font-medium">
              {profile.business_code}
            </div>
          </div>
        )}

        <div>
          <button
            type="submit"
            className="w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 transition-colors"
          >
            {profile ? 'Update Profile' : 'Create Profile'}
          </button>
        </div>
      </form>

      {profile && requiredDocuments.length > 0 && (
        <div className="mt-8 bg-white shadow rounded-lg p-6">
          <h2 className="text-xl font-semibold text-gray-900 mb-4">Required Documents</h2>
          <div className="space-y-4">
            {requiredDocuments.map((doc) => {
              const uploadedDoc = customerDocuments.find(
                (uploaded) => uploaded.document_type_id === doc.id
              );

              return (
                <div key={doc.id} className="flex items-center justify-between p-4 border rounded-lg">
                  <div>
                    <h3 className="font-medium text-gray-900">{doc.name}</h3>
                    {doc.description && (
                      <p className="text-sm text-gray-500">{doc.description}</p>
                    )}
                    {uploadedDoc && (
                      <p className="text-sm text-gray-500 mt-1">
                        Current file: {uploadedDoc.file_name}
                      </p>
                    )}
                  </div>
                  <div className="flex items-center space-x-2">
                    {uploadedDoc && (
                      <button
                        onClick={() => handleDeleteDocument(uploadedDoc.id)}
                        className="p-2 text-red-600 hover:text-red-800"
                        title="Delete document"
                      >
                        <Trash2 className="w-5 h-5" />
                      </button>
                    )}
                    <label className="cursor-pointer p-2 text-blue-600 hover:text-blue-800">
                      <Upload className="w-5 h-5" />
                      <input
                        type="file"
                        className="hidden"
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) handleFileUpload(doc.id, file);
                        }}
                      />
                    </label>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
