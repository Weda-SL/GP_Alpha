import React, { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { PlusCircle, Edit, Trash2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { logAuditEvent } from '../utils/auditLogger';

interface PlasticType {
  id: string;
  number: string;
  name: string;
  description: string | null;
}

export function PlasticTypes() {
  const [plasticTypes, setPlasticTypes] = useState<PlasticType[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [editingType, setEditingType] = useState<string | null>(null);
  const navigate = useNavigate();
  const { user } = useAuth();
  const [formData, setFormData] = useState({
    number: '',
    name: '',
    description: '',
  });
  const [originalFormData, setOriginalFormData] = useState({
    number: '',
    name: '',
    description: '',
  });

  const hasChanges = () => {
    return formData.number !== originalFormData.number ||
           formData.name !== originalFormData.name ||
           formData.description !== originalFormData.description;
  };

  useEffect(() => {
    const checkUserRole = async () => {
      if (!user?.id) return;
      
      try {
        const { data: userData, error } = await supabase
          .from('users')
          .select('role')
          .eq('id', user.id)
          .single();

        if (error) throw error;

        if (userData.role !== 'admin') {
          navigate('/');
          return;
        }
      } catch (err) {
        console.error('Error checking user role:', err);
        navigate('/');
      }
    };

    const fetchPlasticTypes = async () => {
      try {
        const { data, error } = await supabase
          .from('plastic_types')
          .select('*')
          .order('number');

        if (error) throw error;
        setPlasticTypes(data);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to fetch plastic types');
      } finally {
        setLoading(false);
      }
    };

    checkUserRole();
    fetchPlasticTypes();
  }, [navigate, user?.id]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (editingType) {
        const oldType = plasticTypes.find(t => t.id === editingType);
        const { error } = await supabase
          .from('plastic_types')
          .update({
            number: formData.number,
            name: formData.name,
            description: formData.description,
          })
          .eq('id', editingType);

        if (error) throw error;
        
        await logAuditEvent('UPDATE_PLASTIC_TYPE', 'plastic_types', editingType, { 
          old_values: oldType, 
          new_values: formData 
        });
      } else {
        const { data, error } = await supabase
          .from('plastic_types')
          .insert([{
            number: formData.number,
            name: formData.name,
            description: formData.description,
          }])
          .select()
          .single();

        if (error) throw error;
        
        await logAuditEvent('CREATE_PLASTIC_TYPE', 'plastic_types', data.id);
      }

      setShowModal(false);
      setEditingType(null);
      setFormData({ number: '', name: '', description: '' });
      setOriginalFormData({ number: '', name: '', description: '' });
      
      const { data: updatedTypes, error: fetchError } = await supabase
        .from('plastic_types')
        .select('*')
        .order('number');

      if (fetchError) throw fetchError;
      setPlasticTypes(updatedTypes);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save plastic type');
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this plastic type?')) return;

    try {
      await logAuditEvent('DELETE_PLASTIC_TYPE', 'plastic_types', id);
      const { error } = await supabase
        .from('plastic_types')
        .delete()
        .eq('id', id);

      if (error) throw error;

      setPlasticTypes(plasticTypes.filter(type => type.id !== id));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete plastic type');
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
        <h1 className="text-2xl font-bold text-gray-900">Types of Plastic</h1>
        <button
          onClick={() => {
            setEditingType(null);
            const emptyData = { number: '', name: '', description: '' };
            setFormData(emptyData);
            setOriginalFormData(emptyData);
            setShowModal(true);
          }}
          className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700"
        >
          <PlusCircle className="w-5 h-5" />
          Add New Type
        </button>
      </div>

      {showModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-lg p-6 w-full max-w-md">
            <h2 className="text-xl font-bold mb-4">
              {editingType ? 'Edit Plastic Type' : 'New Plastic Type'}
            </h2>
            <form onSubmit={handleSubmit}>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700">Number</label>
                  <input
                    type="text"
                    required
                    value={formData.number}
                    onChange={(e) => setFormData({ ...formData, number: e.target.value })}
                    className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">Name</label>
                  <input
                    type="text"
                    required
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">Description</label>
                  <textarea
                    value={formData.description}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                    className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                    rows={3}
                  />
                </div>
              </div>
              <div className="mt-6 flex justify-end space-x-3">
                <button
                  type="button"
                  onClick={() => {
                    setShowModal(false);
                    setEditingType(null);
                    setFormData({ number: '', name: '', description: '' });
                    setOriginalFormData({ number: '', name: '', description: '' });
                  }}
                  className="px-4 py-2 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={editingType && !hasChanges()}
                  className={`px-4 py-2 text-white rounded-md ${
                    editingType && !hasChanges()
                      ? 'bg-blue-400 cursor-not-allowed'
                      : 'bg-blue-600 hover:bg-blue-700'
                  }`}
                >
                  {editingType ? 'Save Changes' : 'Create'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <div className="bg-white shadow-md rounded-lg overflow-hidden">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Number
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Name
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Description
              </th>
              <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {plasticTypes.map((type) => (
              <tr key={type.id} className="hover:bg-gray-50">
                <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                  {type.number}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                  {type.name}
                </td>
                <td className="px-6 py-4 text-sm text-gray-500">
                  {type.description || '-'}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                  <div className="flex justify-end space-x-2">
                    <button
                      onClick={() => {
                        setEditingType(type.id);
                        const typeData = {
                          number: type.number,
                          name: type.name,
                          description: type.description || '',
                        };
                        setFormData(typeData);
                        setOriginalFormData(typeData);
                        setShowModal(true);
                      }}
                      className="text-blue-600 hover:text-blue-900"
                    >
                      <Edit className="w-5 h-5" />
                    </button>
                    <button
                      onClick={() => handleDelete(type.id)}
                      className="text-red-600 hover:text-red-900"
                    >
                      <Trash2 className="w-5 h-5" />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {plasticTypes.length === 0 && (
              <tr>
                <td colSpan={4} className="px-6 py-4 text-center text-sm text-gray-500">
                  No plastic types found
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}