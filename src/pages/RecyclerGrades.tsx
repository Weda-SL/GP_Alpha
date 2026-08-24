import React, { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { PlusCircle, CreditCard as Edit, Trash2, ShieldAlert } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { logAuditEvent } from '../utils/auditLogger';

interface RecyclerGrade {
  id: string;
  grade: string;
  description: string | null;
  created_at: string;
}

export function RecyclerGrades() {
  const [grades, setGrades] = useState<RecyclerGrade[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [userRole, setUserRole] = useState<string | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [editingGrade, setEditingGrade] = useState<RecyclerGrade | null>(null);
  const [formData, setFormData] = useState({ grade: '', description: '' });
  const [originalFormData, setOriginalFormData] = useState({ grade: '', description: '' });
  const navigate = useNavigate();

  useEffect(() => {
    const checkRole = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { navigate('/login'); return; }

      const { data } = await supabase
        .from('users')
        .select('role')
        .eq('id', user.id)
        .single();

      if (data?.role !== 'admin') { navigate('/'); return; }
      setUserRole(data.role);
    };
    checkRole();
  }, [navigate]);

  useEffect(() => {
    if (userRole === 'admin') fetchGrades();
  }, [userRole]);

  const fetchGrades = async () => {
    try {
      const { data, error: fetchError } = await supabase
        .from('recycler_grades')
        .select('*')
        .order('grade');

      if (fetchError) throw fetchError;
      setGrades(data || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch recycler grades');
    } finally {
      setLoading(false);
    }
  };

  const hasChanges = () =>
    formData.grade !== originalFormData.grade ||
    formData.description !== originalFormData.description;

  const openCreateModal = () => {
    setEditingGrade(null);
    const empty = { grade: '', description: '' };
    setFormData(empty);
    setOriginalFormData(empty);
    setShowModal(true);
  };

  const openEditModal = (g: RecyclerGrade) => {
    setEditingGrade(g);
    const vals = { grade: g.grade, description: g.description || '' };
    setFormData(vals);
    setOriginalFormData(vals);
    setShowModal(true);
  };

  const closeModal = () => {
    setShowModal(false);
    setEditingGrade(null);
    setFormData({ grade: '', description: '' });
    setOriginalFormData({ grade: '', description: '' });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (editingGrade) {
        const { error } = await supabase
          .from('recycler_grades')
          .update({ grade: formData.grade, description: formData.description || null })
          .eq('id', editingGrade.id);

        if (error) throw error;
        await logAuditEvent('UPDATE_RECYCLER_GRADE', 'recycler_grades', editingGrade.id, {
          old_values: { grade: editingGrade.grade, description: editingGrade.description },
          new_values: formData,
        });
      } else {
        const { data, error } = await supabase
          .from('recycler_grades')
          .insert([{ grade: formData.grade, description: formData.description || null }])
          .select()
          .single();

        if (error) throw error;
        await logAuditEvent('CREATE_RECYCLER_GRADE', 'recycler_grades', data.id, { grade: formData.grade });
      }

      closeModal();
      fetchGrades();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save recycler grade');
    }
  };

  const handleDelete = async (g: RecyclerGrade) => {
    if (!confirm(`Are you sure you want to delete the grade "${g.grade}"? This may affect customer profiles assigned this grade.`)) return;

    try {
      await logAuditEvent('DELETE_RECYCLER_GRADE', 'recycler_grades', g.id, { grade: g.grade });
      const { error } = await supabase
        .from('recycler_grades')
        .delete()
        .eq('id', g.id);

      if (error) throw error;
      fetchGrades();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete recycler grade');
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900"></div>
      </div>
    );
  }

  if (userRole !== 'admin') {
    return (
      <div className="flex flex-col items-center justify-center h-64">
        <ShieldAlert className="w-16 h-16 text-red-500 mb-4" />
        <h2 className="text-2xl font-bold text-gray-900 mb-2">Access Denied</h2>
        <p className="text-gray-600">You don't have permission to access this page.</p>
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
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Recycler Grades</h1>
          <p className="mt-1 text-sm text-gray-500">
            Manage grades assigned to customers with the Recycler business category.
          </p>
        </div>
        <button
          onClick={openCreateModal}
          className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors"
        >
          <PlusCircle className="w-5 h-5" />
          New Grade
        </button>
      </div>

      {showModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-md shadow-xl">
            <h2 className="text-xl font-bold mb-4 text-gray-900">
              {editingGrade ? 'Edit Recycler Grade' : 'New Recycler Grade'}
            </h2>
            <form onSubmit={handleSubmit}>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700">
                    Grade <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={formData.grade}
                    onChange={(e) => setFormData({ ...formData, grade: e.target.value })}
                    placeholder="e.g. Grade A, Premium, Standard"
                    className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">Description</label>
                  <textarea
                    value={formData.description}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                    rows={3}
                    placeholder="Optional description of this grade..."
                    className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                  />
                </div>
              </div>
              <div className="mt-6 flex justify-end space-x-3">
                <button
                  type="button"
                  onClick={closeModal}
                  className="px-4 py-2 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={!!(editingGrade && !hasChanges())}
                  className={`px-4 py-2 text-white rounded-md transition-colors ${
                    editingGrade && !hasChanges()
                      ? 'bg-blue-400 cursor-not-allowed'
                      : 'bg-blue-600 hover:bg-blue-700'
                  }`}
                >
                  {editingGrade ? 'Save Changes' : 'Create Grade'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <div className="bg-white shadow-md rounded-lg overflow-hidden">
        {grades.length === 0 ? (
          <div className="text-center py-12 text-gray-500">
            <p className="text-lg font-medium">No recycler grades defined yet.</p>
            <p className="mt-1 text-sm">Click "New Grade" to create the first one.</p>
          </div>
        ) : (
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Grade
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Description
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Created
                </th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {grades.map((g) => (
                <tr key={g.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4">
                    <span className="text-sm font-semibold text-gray-900">{g.grade}</span>
                  </td>
                  <td className="px-6 py-4">
                    <span className="text-sm text-gray-600">
                      {g.description || <span className="italic text-gray-400">No description</span>}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    <span className="text-sm text-gray-500">
                      {new Date(g.created_at).toLocaleDateString()}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-right">
                    <div className="flex justify-end gap-2">
                      <button
                        onClick={() => openEditModal(g)}
                        className="p-2 text-gray-400 hover:text-blue-600 rounded-full hover:bg-gray-100 transition-colors"
                        title="Edit"
                      >
                        <Edit className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleDelete(g)}
                        className="p-2 text-gray-400 hover:text-red-600 rounded-full hover:bg-gray-100 transition-colors"
                        title="Delete"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
