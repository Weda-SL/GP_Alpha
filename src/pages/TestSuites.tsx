import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { PlusCircle, Trash2, Edit, Plus, X } from 'lucide-react';
import { useAuth } from '../hooks/useAuth';
import { logAuditEvent } from '../utils/auditLogger';

interface Test {
  id: string;
  name: string;
  description: string | null;
  unit_of_measure: string;
  cost: number;
}

interface TestSuite {
  id: string;
  name: string;
  description: string | null;
  created_at: string;
  tests: Test[];
}

export function TestSuites() {
  const [testSuites, setTestSuites] = useState<TestSuite[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [isEditing, setIsEditing] = useState<string | null>(null);
  const [showTestSelector, setShowTestSelector] = useState<string | null>(null);
  const [availableTests, setAvailableTests] = useState<Test[]>([]);
  const [originalSuite, setOriginalSuite] = useState({ name: '', description: '' });
  const [editingSuite, setEditingSuite] = useState({ name: '', description: '' });
  const { user } = useAuth();
  const [isAdmin, setIsAdmin] = useState(false);

  const hasChanges = () => {
    return editingSuite.name !== originalSuite.name || 
           editingSuite.description !== originalSuite.description;
  };

  useEffect(() => {
    const checkUserRole = async () => {
      if (!user?.id) return;
      
      const { data: userData, error: userError } = await supabase
        .from('users')
        .select('role')
        .eq('id', user.id)
        .single();

      if (userData) {
        setIsAdmin(userData.role === 'admin');
      }
    };

    const fetchTestSuites = async () => {
      try {
        const { data: suitesData, error: suitesError } = await supabase
          .from('test_suites')
          .select('*, test_suite_items(test_id, tests(id, name, description, unit_of_measure, cost))')
          .order('created_at', { ascending: false });

        if (suitesError) throw suitesError;

        const formattedSuites = suitesData?.map(suite => ({
          ...suite,
          tests: suite.test_suite_items
            ?.map(item => item.tests)
            .filter(test => test !== null) || []
        }));

        setTestSuites(formattedSuites || []);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'An error occurred');
      } finally {
        setLoading(false);
      }
    };

    checkUserRole();
    fetchTestSuites();
  }, [user?.id]);

  const fetchAvailableTests = async () => {
    try {
      const { data, error } = await supabase
        .from('tests')
        .select('*')
        .order('name');

      if (error) throw error;
      setAvailableTests(data || []);
    } catch (err) {
      console.error('Error fetching tests:', err);
    }
  };

  const handleCreateTestSuite = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const { data, error } = await supabase
        .from('test_suites')
        .insert([{
          name: editingSuite.name,
          description: editingSuite.description || null,
          created_by: user?.id
        }])
        .select()
        .single();

      if (error) throw error;

      await logAuditEvent('CREATE_TEST_SUITE', 'test_suites', data.id);
      setTestSuites([{ ...data, tests: [] }, ...testSuites]);
      setIsCreating(false);
      setEditingSuite({ name: '', description: '' });
      setOriginalSuite({ name: '', description: '' });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create test suite');
    }
  };

  const handleEditTestSuite = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isEditing) return;

    try {
      const { data, error } = await supabase
        .from('test_suites')
        .update({
          name: editingSuite.name,
          description: editingSuite.description
        })
        .eq('id', isEditing)
        .select()
        .single();

      if (error) throw error;

      await logAuditEvent('UPDATE_TEST_SUITE', 'test_suites', isEditing, { 
        old_values: originalSuite, 
        new_values: editingSuite 
      });
      setTestSuites(testSuites.map(suite =>
        suite.id === isEditing
          ? { ...suite, name: data.name, description: data.description }
          : suite
      ));
      setIsEditing(null);
      setEditingSuite({ name: '', description: '' });
      setOriginalSuite({ name: '', description: '' });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update test suite');
    }
  };

  const handleDeleteTestSuite = async (suiteId: string) => {
    if (!confirm('Are you sure you want to delete this test suite?')) return;

    try {
      const { error } = await supabase
        .from('test_suites')
        .delete()
        .eq('id', suiteId);

      if (error) throw error;

      await logAuditEvent('DELETE_TEST_SUITE', 'test_suites', suiteId);
      setTestSuites(testSuites.filter(suite => suite.id !== suiteId));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete test suite');
    }
  };

  const handleAddTest = async (suiteId: string, testId: string) => {
    try {
      const { data, error } = await supabase
        .from('test_suite_items')
        .insert([{
          test_suite_id: suiteId,
          test_id: testId
        }])
        .select('tests(*)')
        .single();

      if (error) throw error;

      await logAuditEvent('ADD_TEST_TO_SUITE', 'test_suite_items', data.id, { 
        test_suite_id: suiteId, 
        test_id: testId 
      });
      setTestSuites(testSuites.map(suite =>
        suite.id === suiteId
          ? { ...suite, tests: [...suite.tests, data.tests] }
          : suite
      ));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add test to suite');
    }
  };

  const handleRemoveTest = async (suiteId: string, testId: string) => {
    try {
      const { error } = await supabase
        .from('test_suite_items')
        .delete()
        .eq('test_suite_id', suiteId)
        .eq('test_id', testId);

      if (error) throw error;

      await logAuditEvent('REMOVE_TEST_FROM_SUITE', 'test_suite_items', undefined, { 
        test_suite_id: suiteId, 
        test_id: testId 
      });
      setTestSuites(testSuites.map(suite =>
        suite.id === suiteId
          ? { ...suite, tests: suite.tests.filter(test => test.id !== testId) }
          : suite
      ));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to remove test from suite');
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
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Test Suites</h1>
        {isAdmin && (
          <button
            onClick={() => {
              setIsCreating(true);
              const emptyData = { name: '', description: '' };
              setEditingSuite(emptyData);
              setOriginalSuite(emptyData);
            }}
            className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors"
          >
            <PlusCircle className="w-5 h-5" />
            New Test Suite
          </button>
        )}
      </div>

      {(isCreating || isEditing) && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-lg p-6 w-full max-w-md">
            <h2 className="text-xl font-bold mb-4">
              {isCreating ? 'Create New Test Suite' : 'Edit Test Suite'}
            </h2>
            <form onSubmit={isCreating ? handleCreateTestSuite : handleEditTestSuite}>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700">Name</label>
                  <input
                    type="text"
                    required
                    value={editingSuite.name}
                    onChange={(e) => setEditingSuite({ ...editingSuite, name: e.target.value })}
                    className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">Description</label>
                  <textarea
                    value={editingSuite.description}
                    onChange={(e) => setEditingSuite({ ...editingSuite, description: e.target.value })}
                    className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                  />
                </div>
              </div>
              <div className="mt-6 flex justify-end space-x-3">
                <button
                  type="button"
                  onClick={() => {
                    setIsCreating(false);
                    setIsEditing(null);
                    setEditingSuite({ name: '', description: '' });
                    setOriginalSuite({ name: '', description: '' });
                  }}
                  className="px-4 py-2 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isEditing && !hasChanges()}
                  className={`px-4 py-2 text-white rounded-md ${
                    isEditing && !hasChanges()
                      ? 'bg-blue-400 cursor-not-allowed'
                      : 'bg-blue-600 hover:bg-blue-700'
                  }`}
                >
                  {isCreating ? 'Create' : 'Save Changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showTestSelector && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-lg p-6 w-full max-w-md">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-bold">Add Tests</h2>
              <button
                onClick={() => setShowTestSelector(null)}
                className="text-gray-500 hover:text-gray-700"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="space-y-2 max-h-96 overflow-y-auto">
              {availableTests.map(test => {
                const isInSuite = testSuites
                  .find(suite => suite.id === showTestSelector)
                  ?.tests.some(t => t.id === test.id);

                return (
                  <div
                    key={test.id}
                    className="flex justify-between items-center p-3 border rounded-lg"
                  >
                    <div>
                      <h3 className="font-medium">{test.name}</h3>
                      <p className="text-sm text-gray-500">{test.description}</p>
                    </div>
                    {!isInSuite && (
                      <button
                        onClick={() => handleAddTest(showTestSelector, test.id)}
                        className="text-blue-600 hover:text-blue-800"
                      >
                        <Plus className="w-5 h-5" />
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      <div className="grid gap-4">
        {testSuites.map((suite) => (
          <div
            key={suite.id}
            className="bg-white p-6 rounded-lg shadow hover:shadow-md transition-shadow"
          >
            <div className="flex justify-between items-start">
              <div>
                <h3 className="text-lg font-semibold text-gray-900">{suite.name}</h3>
                {suite.description && (
                  <p className="mt-1 text-gray-600">{suite.description}</p>
                )}
                <p className="mt-2 text-sm text-gray-500">
                  Created {new Date(suite.created_at).toLocaleDateString()}
                </p>
              </div>
              {isAdmin && (
                <div className="flex gap-2">
                  <button
                    onClick={() => {
                      setIsEditing(suite.id);
                      const suiteData = {
                        name: suite.name,
                        description: suite.description || '',
                      };
                      setEditingSuite(suiteData);
                      setOriginalSuite(suiteData);
                    }}
                    className="p-2 text-gray-400 hover:text-blue-600 rounded-full hover:bg-gray-100"
                    title="Edit"
                  >
                    <Edit className="w-5 h-5" />
                  </button>
                  <button
                    onClick={() => handleDeleteTestSuite(suite.id)}
                    className="p-2 text-gray-400 hover:text-red-600 rounded-full hover:bg-gray-100"
                    title="Delete"
                  >
                    <Trash2 className="w-5 h-5" />
                  </button>
                </div>
              )}
            </div>

            <div className="mt-4">
              <div className="flex justify-between items-center mb-2">
                <h4 className="font-medium text-gray-700">Tests</h4>
                {isAdmin && (
                  <button
                    onClick={() => {
                      setShowTestSelector(suite.id);
                      fetchAvailableTests();
                    }}
                    className="text-sm text-blue-600 hover:text-blue-800 flex items-center gap-1"
                  >
                    <Plus className="w-4 h-4" />
                    Add Test
                  </button>
                )}
              </div>
              <div className="space-y-2">
                {suite.tests.map((test) => (
                  <div
                    key={test.id}
                    className="flex justify-between items-center p-2 bg-gray-50 rounded"
                  >
                    <div>
                      <p className="font-medium">{test.name}</p>
                      <p className="text-sm text-gray-500">
                        {test.unit_of_measure} - LKR {test.cost.toFixed(2)}
                      </p>
                    </div>
                    {isAdmin && (
                      <button
                        onClick={() => handleRemoveTest(suite.id, test.id)}
                        className="text-red-600 hover:text-red-800"
                        title="Remove test"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                ))}
                {suite.tests.length === 0 && (
                  <p className="text-sm text-gray-500 italic">No tests added yet</p>
                )}
              </div>
            </div>
          </div>
        ))}

        {testSuites.length === 0 && !isCreating && (
          <div className="text-center py-12 bg-white rounded-lg">
            <p className="text-gray-500">No test suites found. Create your first one!</p>
          </div>
        )}
      </div>
    </div>
  );
}