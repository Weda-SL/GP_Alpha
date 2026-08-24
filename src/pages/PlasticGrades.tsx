import React, { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { PlusCircle, Edit, Trash2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { logAuditEvent } from '../utils/auditLogger';

interface PlasticGrade {
  id: string;
  number: string;
  name: string;
  description: string | null;
}

export function PlasticGrades() {
  const [plasticGrades, setPlasticGrades] = useState<PlasticGrade[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [editingGrade, setEditingGrade] = useState<string | null>(null);
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

    const fetchPlasticGrades = async () => {
      try {
        const { data, error } = await supabase
          .from('plastic_grades')
          .select('*')
          .order('number');

        if (error) throw error;
        setPlasticGrades(data);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to fetch plastic grades');
      } finally {
        setLoading(false);
      }
    };

    checkUserRole();
    fetchPlasticGrades();
  }, [navigate, user?.id]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (editingGrade) {
        const oldGrade = plasticGrades.find(g => g.id === editingGrade);
        const { error } = await supabase
          .from('plastic_grades')
          .update({
            number: formData.number,
            name: formData.name,
            description: formData.description,
          })
          .eq('id', editingGrade);

        if (error) throw error;
        
        await logAuditEvent('UPDATE_PLASTIC_GRADE', 'plastic_grades', editingGrade, { 
          old_values: oldGrade, 
          new_values: formData 
        });
      } else {
        const { data, error } = await supabase
          .from('plastic_grades')
          .insert([{
            number: formData.number,
            name: formData.name,
            description: formData.description,
          }])
          .select()
          .single();

        if (error) throw error;
        
        await logAuditEvent('CREATE_PLASTIC_GRADE', 'plastic_grades', data.id);
      }

      setShowModal(false);
      setEditingGrade(null);
      setFormData({ number: '', name: '', description: '' });
      setOriginalFormData({ number: '', name: '', description: '' });
      
      const { data: updatedGrades, error: fetchError } = await supabase
        .from('plastic_grades')
        .select('*')
        .order('number');

      if (fetchError) throw fetchError;
      setPlasticGrades(updatedGrades);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save plastic grade');
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this plastic grade?')) return;

    try {
      await logAuditEvent('DELETE_PLASTIC_GRADE', 'plastic_grades', id);
      const { error } = await supabase
        .from('plastic_grades')
        .delete()
        .eq('id', id);

      if (error) throw error;

      setPlasticGrades(plasticGrades.filter(grade => grade.id !== id));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete plastic grade');
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
        <h1 className="text-2xl font-bold text-gray-900">Grades of Plastic</h1>
        <button
          onClick={() => {
            setEditingGrade(null);
            const emptyData = { number: '', name: '', description: '' };
            setFormData(emptyData);
            setOriginalFormData(emptyData);
            setShowModal(true);
          }}
          className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700"
        >
          <PlusCircle className="w-5 h-5" />
          Add New Grade
        </button>
      </div>

      {showModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-lg p-6 w-full max-w-md">
            <h2 className="text-xl font-bold mb-4">
              {editingGrade ? 'Edit Plastic Grade' : 'New Plastic Grade'}
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
                    setEditingGrade(null);
                    setFormData({ number: '', name: '', description: '' });
                    setOriginalFormData({ number: '', name: '', description: '' });
                  }}
                  className="px-4 py-2 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={editingGrade && !hasChanges()}
                  className={`px-4 py-2 text-white rounded-md ${
                    editingGrade && !hasChanges()
                      ? 'bg-blue-400 cursor-not-allowed'
                      : 'bg-blue-600 hover:bg-blue-700'
                  }`}
                >
                  {editingGrade ? 'Save Changes' : 'Create'}
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
            {plasticGrades.map((grade) => (
              <tr key={grade.id} className="hover:bg-gray-50">
                <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                  {grade.number}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                  {grade.name}
                </td>
                <td className="px-6 py-4 text-sm text-gray-500">
                  {grade.description || '-'}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                  <div className="flex justify-end space-x-2">
                    <button
                      onClick={() => {
                        setEditingGrade(grade.id);
                        const gradeData = {
                          number: grade.number,
                          name: grade.name,
                          description: grade.description || '',
                        };
                        setFormData(gradeData);
                        setOriginalFormData(gradeData);
                        setShowModal(true);
                      }}
                      className="text-blue-600 hover:text-blue-900"
                    >
                      <Edit className="w-5 h-5" />
                    </button>
                    <button
                      onClick={() => handleDelete(grade.id)}
                      className="text-red-600 hover:text-red-900"
                    >
                      <Trash2 className="w-5 h-5" />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {plasticGrades.length === 0 && (
              <tr>
                <td colSpan={4} className="px-6 py-4 text-center text-sm text-gray-500">
                  No plastic grades found
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}