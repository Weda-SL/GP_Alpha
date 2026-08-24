import React, { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { PlusCircle, Edit, Trash2, Plus, X } from 'lucide-react';
import { logAuditEvent } from '../utils/auditLogger';

interface Category {
  id: string;
  name: string;
  description: string | null;
}

interface Document {
  id: string;
  name: string;
  description: string | null;
  is_required: boolean;
}

interface CategoryWithDocuments extends Category {
  documents: Document[];
}

export function Categories() {
  const [categories, setCategories] = useState<CategoryWithDocuments[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [editingCategory, setEditingCategory] = useState<string | null>(null);
  const [originalFormData, setOriginalFormData] = useState({
    name: '',
    description: '',
  });
  const [formData, setFormData] = useState({
    name: '',
    description: '',
  });
  const [showDocumentModal, setShowDocumentModal] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [documentForm, setDocumentForm] = useState({
    name: '',
    description: '',
    isRequired: true,
  });

  const hasChanges = () => {
    return formData.name !== originalFormData.name || 
           formData.description !== originalFormData.description;
  };

  useEffect(() => {
    fetchCategories();
  }, []);

  const fetchCategories = async () => {
    try {
      const { data: categoriesData, error: categoriesError } = await supabase
        .from('business_categories')
        .select('*')
        .order('name');

      if (categoriesError) throw categoriesError;

      const categoriesWithDocs = await Promise.all(
        categoriesData.map(async (category) => {
          const { data: documents, error: documentsError } = await supabase
            .from('required_documents')
            .select('*')
            .eq('category_id', category.id)
            .order('name');

          if (documentsError) throw documentsError;

          return {
            ...category,
            documents: documents || [],
          };
        })
      );

      setCategories(categoriesWithDocs);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch categories');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (editingCategory) {
       const oldValues = categories.find(c => c.id === editingCategory);
        const { error } = await supabase
          .from('business_categories')
          .update({
            name: formData.name,
            description: formData.description,
          })
          .eq('id', editingCategory);

        if (error) throw error;
       
       await logAuditEvent('UPDATE_CATEGORY', 'business_categories', editingCategory, { 
         old_values: { name: oldValues?.name, description: oldValues?.description }, 
         new_values: formData 
       });
      } else {
        const { data, error } = await supabase
          .from('business_categories')
          .insert([{
            name: formData.name,
            description: formData.description,
          }])
        .select()
        .single();

        if (error) throw error;

       await logAuditEvent('CREATE_CATEGORY', 'business_categories', data.id);
      }

      setShowModal(false);
      setEditingCategory(null);
      setFormData({ name: '', description: '' });
      setOriginalFormData({ name: '', description: '' });
      fetchCategories();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save category');
    }
  };

  const handleDelete = async (categoryId: string) => {
    if (!confirm('Are you sure you want to delete this category?')) return;

    try {
      await logAuditEvent('DELETE_CATEGORY', 'business_categories', categoryId);
       const { data, error } = await supabase
        .from('business_categories')
        .delete()
        .eq('id', categoryId);

      if (error) throw error;

      fetchCategories();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete category');
    }
  };

  const handleDocumentSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCategory) return;

    try {
     const { data, error } = await supabase
        .from('required_documents')
        .insert([{
          category_id: selectedCategory,
          name: documentForm.name,
          description: documentForm.description,
          is_required: documentForm.isRequired,
        }])
        .select()
        .single();

      if (error) throw error;

     await logAuditEvent('ADD_REQUIRED_DOCUMENT', 'required_documents', data.id, { 
       category_id: selectedCategory, 
       document_name: documentForm.name 
     });
      setShowDocumentModal(false);
      setDocumentForm({ name: '', description: '', isRequired: true });
      fetchCategories();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add document');
    }
  };

  const handleDeleteDocument = async (documentId: string) => {
    if (!confirm('Are you sure you want to delete this document requirement?')) return;

    try {
     await logAuditEvent('DELETE_REQUIRED_DOCUMENT', 'required_documents', documentId);
      const { error } = await supabase
        .from('required_documents')
        .delete()
        .eq('id', documentId);

      if (error) throw error;

      fetchCategories();
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

  return (
    <div className="container mx-auto px-4 py-8">
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded mb-6">
          {error}
        </div>
      )}

      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Business Categories</h1>
        <button
          onClick={() => {
            setEditingCategory(null);
            const emptyData = { name: '', description: '' };
            setFormData(emptyData);
            setOriginalFormData(emptyData);
            setShowModal(true);
          }}
          className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700"
        >
          <PlusCircle className="w-5 h-5" />
          New Category
        </button>
      </div>

      {showModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-lg p-6 w-full max-w-md">
            <h2 className="text-xl font-bold mb-4">
              {editingCategory ? 'Edit Category' : 'New Category'}
            </h2>
            <form onSubmit={handleSubmit}>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700">Name</label>
                  <input
                    type="text"
                    required
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">Description</label>
                  <textarea
                    value={formData.description}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                    className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500"
                  />
                </div>
              </div>
              <div className="mt-6 flex justify-end space-x-3">
                <button
                  type="button"
                  onClick={() => {
                    setShowModal(false);
                    setEditingCategory(null);
                    setFormData({ name: '', description: '' });
                    setOriginalFormData({ name: '', description: '' });
                  }}
                  className="px-4 py-2 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={editingCategory && !hasChanges()}
                  className={`px-4 py-2 text-white rounded-md ${
                    editingCategory && !hasChanges()
                      ? 'bg-blue-400 cursor-not-allowed'
                      : 'bg-blue-600 hover:bg-blue-700'
                  }`}
                >
                  {editingCategory ? 'Save Changes' : 'Create Category'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showDocumentModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-lg p-6 w-full max-w-md">
            <h2 className="text-xl font-bold mb-4">Add Required Document</h2>
            <form onSubmit={handleDocumentSubmit}>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700">Name</label>
                  <input
                    type="text"
                    required
                    value={documentForm.name}
                    onChange={(e) => setDocumentForm({ ...documentForm, name: e.target.value })}
                    className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">Description</label>
                  <textarea
                    value={documentForm.description}
                    onChange={(e) => setDocumentForm({ ...documentForm, description: e.target.value })}
                    className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500"
                  />
                </div>
                <div className="flex items-center">
                  <input
                    type="checkbox"
                    id="isRequired"
                    checked={documentForm.isRequired}
                    onChange={(e) => setDocumentForm({ ...documentForm, isRequired: e.target.checked })}
                    className="h-4 w-4 text-indigo-600 focus:ring-indigo-500 border-gray-300 rounded"
                  />
                  <label htmlFor="isRequired" className="ml-2 block text-sm text-gray-700">
                    Required Document
                  </label>
                </div>
              </div>
              <div className="mt-6 flex justify-end space-x-3">
                <button
                  type="button"
                  onClick={() => {
                    setShowDocumentModal(false);
                    setSelectedCategory(null);
                    setDocumentForm({ name: '', description: '', isRequired: true });
                  }}
                  className="px-4 py-2 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
                >
                  Add Document
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <div className="grid gap-6">
        {categories.map((category) => (
          <div key={category.id} className="bg-white rounded-lg shadow-sm p-6">
            <div className="flex justify-between items-start mb-4">
              <div>
                <h2 className="text-xl font-semibold text-gray-900">{category.name}</h2>
                {category.description && (
                  <p className="mt-1 text-gray-600">{category.description}</p>
                )}
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => {
                    setEditingCategory(category.id);
                    const categoryData = {
                      name: category.name,
                      description: category.description || '',
                    };
                    setFormData(categoryData);
                    setOriginalFormData(categoryData);
                    setShowModal(true);
                  }}
                  className="p-2 text-gray-400 hover:text-blue-600 rounded-full hover:bg-gray-100"
                >
                  <Edit className="w-5 h-5" />
                </button>
                <button
                  onClick={() => handleDelete(category.id)}
                  className="p-2 text-gray-400 hover:text-red-600 rounded-full hover:bg-gray-100"
                >
                  <Trash2 className="w-5 h-5" />
                </button>
              </div>
            </div>

            <div>
              <div className="flex justify-between items-center mb-3">
                <h3 className="font-medium text-gray-700">Required Documents</h3>
                <button
                  onClick={() => {
                    setSelectedCategory(category.id);
                    setShowDocumentModal(true);
                  }}
                  className="text-sm text-blue-600 hover:text-blue-800 flex items-center gap-1"
                >
                  <Plus className="w-4 h-4" />
                  Add Document
                </button>
              </div>

              <div className="space-y-2">
                {category.documents.map((doc) => (
                  <div
                    key={doc.id}
                    className="flex justify-between items-center p-3 bg-gray-50 rounded-lg"
                  >
                    <div>
                      <p className="font-medium text-gray-900">{doc.name}</p>
                      {doc.description && (
                        <p className="text-sm text-gray-500">{doc.description}</p>
                      )}
                      {doc.is_required && (
                        <span className="text-xs text-red-600">Required</span>
                      )}
                    </div>
                    <button
                      onClick={() => handleDeleteDocument(doc.id)}
                      className="text-red-600 hover:text-red-800"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                ))}

                {category.documents.length === 0 && (
                  <p className="text-sm text-gray-500 italic">
                    No required documents defined
                  </p>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}