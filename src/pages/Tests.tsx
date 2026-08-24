import React, { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { PlusCircle, Trash2, Edit } from 'lucide-react';
import { useAuth } from '../hooks/useAuth';
import { useNavigate } from 'react-router-dom';

interface Test {
  id: string;
  name: string;
  description: string | null;
  unit_of_measure: string;
  min_sample_size: number | null;
  time_to_delivery: number;
  cost: number;
}

interface NewTest {
  name: string;
  description: string;
  unit_of_measure: string;
  min_sample_size: string;
  time_to_delivery: string;
  cost: string;
}

export function Tests() {
  const [tests, setTests] = useState<Test[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { user } = useAuth();
  const [isAdmin, setIsAdmin] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [editingTest, setEditingTest] = useState<string | null>(null);
  const [originalTest, setOriginalTest] = useState<NewTest | null>(null);
  const [showDeleteModal, setShowDeleteModal] = useState<string | null>(null);
  const navigate = useNavigate();
  const [newTest, setNewTest] = useState<NewTest>({
    name: '',
    description: '',
    unit_of_measure: '',
    min_sample_size: '',
    time_to_delivery: '',
    cost: '',
  });

  const hasChanges = () => {
    if (!editingTest || !originalTest) return true;
    return (
      originalTest.name !== newTest.name ||
      originalTest.description !== newTest.description ||
      originalTest.unit_of_measure !== newTest.unit_of_measure ||
      originalTest.min_sample_size !== newTest.min_sample_size ||
      originalTest.time_to_delivery !== newTest.time_to_delivery ||
      originalTest.cost !== newTest.cost
    );
  };

  useEffect(() => {
    const checkUserRole = async () => {
      if (!user?.id) return;
      
      try {
        const { data: userData, error } = await supabase
          .from('users')
          .select('role')
          .eq('id', user.id)
          .maybeSingle();

        if (error) {
          console.error('Error fetching user role:', error);
          await supabase.auth.signOut();
          navigate('/login');
          return;
        }

        // If no user record exists, create one with default role
        if (!userData) {
          const { data: newUser, error: insertError } = await supabase
            .from('users')
            .insert([{ id: user.id, role: 'customer' }])
            .select('role')
            .single();

          if (insertError) {
            console.error('Error creating user record:', insertError);
            await supabase.auth.signOut();
            navigate('/login');
            return;
          }

          setIsAdmin(newUser.role === 'admin');
        } else {
          setIsAdmin(userData.role === 'admin');
        }
      } catch (err) {
        console.error('Error in user role management:', err);
        await supabase.auth.signOut();
        navigate('/login');
      }
    };

    const fetchTests = async () => {
      try {
        const { data, error: fetchError } = await supabase
          .from('tests')
          .select('*')
          .order('name');

        if (fetchError) throw fetchError;

        setTests(data || []);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'An error occurred while fetching tests');
      } finally {
        setLoading(false);
      }
    };

    checkUserRole();
    fetchTests();
  }, [user?.id, navigate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const testData = {
        name: newTest.name,
        description: newTest.description || null,
        unit_of_measure: newTest.unit_of_measure,
        min_sample_size: newTest.min_sample_size ? parseFloat(newTest.min_sample_size) : null,
        time_to_delivery: parseInt(newTest.time_to_delivery),
        cost: parseFloat(newTest.cost),
        created_by: user?.id,
      };

      if (editingTest) {
        // Check if test is used in any test suite before allowing edit
        const { data: suiteItems, error: checkError } = await supabase
          .from('test_suite_items')
          .select('id')
          .eq('test_id', editingTest);

        if (checkError) throw checkError;

        if (suiteItems && suiteItems.length > 0) {
          setError('Cannot edit test as it is part of one or more test suites');
          return;
        }

        const { data, error } = await supabase
          .from('tests')
          .update(testData)
          .eq('id', editingTest)
          .select()
          .single();

        if (error) throw error;

        setTests(tests.map(test => test.id === editingTest ? data : test));
      } else {
        const { data, error } = await supabase
          .from('tests')
          .insert([testData])
          .select()
          .single();

        if (error) throw error;

        setTests([...tests, data]);
      }

      setShowModal(false);
      setEditingTest(null);
      setOriginalTest(null);
      setNewTest({
        name: '',
        description: '',
        unit_of_measure: '',
        min_sample_size: '',
        time_to_delivery: '',
        cost: '',
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save test');
    }
  };

  const handleEdit = (test: Test) => {
    const testData = {
      name: test.name,
      description: test.description || '',
      unit_of_measure: test.unit_of_measure,
      min_sample_size: test.min_sample_size?.toString() || '',
      time_to_delivery: test.time_to_delivery.toString(),
      cost: test.cost.toString(),
    };
    setEditingTest(test.id);
    setOriginalTest(testData);
    setNewTest(testData);
    setShowModal(true);
  };

  const validateDelete = async (testId: string) => {
    try {
      const { data: suiteItems, error: checkError } = await supabase
        .from('test_suite_items')
        .select('id')
        .eq('test_id', testId);

      if (checkError) throw checkError;

      if (suiteItems && suiteItems.length > 0) {
        setError('Cannot delete test as it is part of one or more test suites');
        return false;
      }
      
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to validate test deletion');
      return false;
    }
  };

  const handleDeleteClick = async (testId: string) => {
    const canDelete = await validateDelete(testId);
    if (canDelete) {
      setShowDeleteModal(testId);
    }
  };

  const handleDelete = async (testId: string) => {
    try {
      const { error: deleteError } = await supabase
        .from('tests')
        .delete()
        .eq('id', testId);

      if (deleteError) throw deleteError;

      await logAuditEvent('DELETE_TEST', 'tests', testId);
      setTests(tests.filter(test => test.id !== testId));
      setShowDeleteModal(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete test');
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
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg p-6 max-w-md w-full">
            <h3 className="text-lg font-semibold text-red-600 mb-4">Error</h3>
            <p className="text-gray-700 mb-6">{error}</p>
            <button
              onClick={() => setError(null)}
              className="w-full px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
            >
              OK
            </button>
          </div>
        </div>
      )}

      {showDeleteModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg p-6 max-w-md w-full">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Confirm Delete</h3>
            <p className="text-gray-700 mb-6">Are you sure you want to delete this test? This action cannot be undone.</p>
            <div className="flex justify-end space-x-3">
              <button
                onClick={() => setShowDeleteModal(null)}
                className="px-4 py-2 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={() => handleDelete(showDeleteModal)}
                className="px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Laboratory Tests</h1>
        {isAdmin && (
          <button
            onClick={() => {
              setEditingTest(null);
              setOriginalTest(null);
              setNewTest({
                name: '',
                description: '',
                unit_of_measure: '',
                min_sample_size: '',
                time_to_delivery: '',
                cost: '',
              });
              setShowModal(true);
            }}
            className="flex items-center px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors"
          >
            <PlusCircle className="w-5 h-5 mr-2" />
            Add New Test
          </button>
        )}
      </div>

      {showModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-lg p-6 w-full max-w-md">
            <h2 className="text-xl font-bold mb-4">
              {editingTest ? 'Edit Test' : 'Add New Test'}
            </h2>
            <form onSubmit={handleSubmit}>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700">Name</label>
                  <input
                    type="text"
                    required
                    value={newTest.name}
                    onChange={(e) => setNewTest({ ...newTest, name: e.target.value })}
                    className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">Description</label>
                  <textarea
                    value={newTest.description}
                    onChange={(e) => setNewTest({ ...newTest, description: e.target.value })}
                    className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">Unit of Measure</label>
                  <input
                    type="text"
                    required
                    value={newTest.unit_of_measure}
                    onChange={(e) => setNewTest({ ...newTest, unit_of_measure: e.target.value })}
                    className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">Min Sample Size (Kgs)</label>
                  <input
                    type="number"
                    step="0.01"
                    value={newTest.min_sample_size}
                    onChange={(e) => setNewTest({ ...newTest, min_sample_size: e.target.value })}
                    className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">Delivery (days)</label>
                  <input
                    type="number"
                    required
                    min="1"
                    value={newTest.time_to_delivery}
                    onChange={(e) => setNewTest({ ...newTest, time_to_delivery: e.target.value })}
                    className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">Cost</label>
                  <input
                    type="number"
                    step="0.01"
                    required
                    value={newTest.cost}
                    onChange={(e) => setNewTest({ ...newTest, cost: e.target.value })}
                    className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                  />
                </div>
              </div>
              <div className="mt-6 flex justify-end space-x-3">
                <button
                  type="button"
                  onClick={() => {
                    setShowModal(false);
                    setEditingTest(null);
                    setOriginalTest(null);
                    setNewTest({
                      name: '',
                      description: '',
                      unit_of_measure: '',
                      min_sample_size: '',
                      time_to_delivery: '',
                      cost: '',
                    });
                  }}
                  className="px-4 py-2 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={editingTest && !hasChanges()}
                  className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {editingTest ? 'Save Changes' : 'Create Test'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <div className="bg-white shadow-md rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Name
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Description
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Unit of Measure
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Min Sample Size (Kgs)
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Delivery (days)
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Cost
                </th>
                {isAdmin && (
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Actions
                  </th>
                )}
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {tests.map((test) => (
                <tr key={test.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                    {test.name}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {test.description || '-'}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {test.unit_of_measure}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {test.min_sample_size || '-'}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {test.time_to_delivery}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    LKR {test.cost.toFixed(2)}
                  </td>
                  {isAdmin && (
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      <div className="flex space-x-2">
                        <button
                          onClick={() => handleEdit(test)}
                          className="text-blue-600 hover:text-blue-800"
                          title="Edit test"
                        >
                          <Edit className="w-5 h-5" />
                        </button>
                        <button
                          onClick={() => handleDeleteClick(test.id)}
                          className="text-red-600 hover:text-red-800"
                          title="Delete test"
                        >
                          <Trash2 className="w-5 h-5" />
                        </button>
                      </div>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}