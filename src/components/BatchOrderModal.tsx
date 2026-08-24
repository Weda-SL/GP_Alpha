import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../hooks/useAuth';
import { X, AlertCircle } from 'lucide-react';
import { logAuditEvent } from '../utils/auditLogger';

interface TestSuite {
  id: string;
  name: string;
  description: string;
  test_suite_items: {
    tests: {
      id: string;
      name: string;
      cost: number;
      unit_of_measure: string;
      time_to_delivery: number;
      min_sample_size: number | null;
    };
  }[];
}

interface BatchConversionData {
  processing_batch_id: string;
  batch_reference: string;
  plastic_type_id: string;
  plastic_grade_id: string;
  production_month: string;
  production_year: string;
  batch_number: string;
}

interface BatchOrderModalProps {
  batchData: BatchConversionData;
  onClose: () => void;
  onSuccess: (orderId: string, orderNumber: string) => void;
}

export function BatchOrderModal({ batchData, onClose, onSuccess }: BatchOrderModalProps) {
  const { user } = useAuth();
  const [testSuites, setTestSuites] = useState<TestSuite[]>([]);
  const [testSuiteId, setTestSuiteId] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    fetchTestSuites();
  }, []);

  const fetchTestSuites = async () => {
    try {
      const { data, error } = await supabase
        .from('test_suites')
        .select(`
          id, name, description,
          test_suite_items(
            tests(id, name, cost, unit_of_measure, time_to_delivery, min_sample_size)
          )
        `)
        .order('name');

      if (error) throw error;
      setTestSuites(data || []);
    } catch (err) {
      console.error('Error fetching test suites:', err);
      setError('Failed to load test suites');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user?.id || !testSuiteId) return;

    setCreating(true);
    setError(null);

    try {
      const { data, error: insertError } = await supabase
        .from('orders')
        .insert([{
          customer_id: user.id,
          test_suite_id: testSuiteId,
          plastic_type_id: batchData.plastic_type_id,
          plastic_grade_id: batchData.plastic_grade_id,
          production_month: parseInt(batchData.production_month),
          production_year: parseInt(batchData.production_year),
          batch_number: batchData.batch_number,
          order_source: 'waste_management',
          processing_batch_id: batchData.processing_batch_id
        }])
        .select('id, order_number')
        .single();

      if (insertError) throw insertError;

      await logAuditEvent('ORDER_CREATED_FROM_BATCH', 'orders', data.id, {
        batch_reference: batchData.batch_reference,
        processing_batch_id: batchData.processing_batch_id
      });

      try {
        const { error: statusUpdateError } = await supabase
          .from('sorted_plastic_intake_processing')
          .update({ status: 'lab' })
          .eq('id', batchData.processing_batch_id);

        if (statusUpdateError) {
          console.error('Error updating processing batch status to lab:', statusUpdateError);
        }

        await logAuditEvent('BATCH_STATUS_CHANGED_TO_LAB', 'sorted_plastic_intake_processing', batchData.processing_batch_id, {
          order_id: data.id,
          order_number: data.order_number
        });
      } catch (statusErr) {
        console.error('Failed to update batch status:', statusErr);
      }

      onSuccess(data.id, data.order_number);
    } catch (err: any) {
      console.error('Error creating order from batch:', err);
      setError(err.message || 'Failed to create order');
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-lg p-6 w-full max-w-md max-h-[90vh] overflow-y-auto">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl font-bold">Create Order from Batch</h2>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-gray-700"
            disabled={creating}
          >
            <X className="h-6 w-6" />
          </button>
        </div>

        <div className="mb-4 p-3 bg-teal-50 border border-teal-200 rounded-lg">
          <p className="text-sm font-medium text-teal-900">
            Creating order from processing batch: <span className="font-bold">{batchData.batch_reference}</span>
          </p>
        </div>

        {error && (
          <div className="mb-4 bg-red-50 border-l-4 border-red-400 p-3 rounded-md">
            <div className="flex items-center">
              <AlertCircle className="h-5 w-5 text-red-400 mr-2" />
              <p className="text-sm text-red-700">{error}</p>
            </div>
          </div>
        )}

        <form onSubmit={handleSubmit}>
          <div className="space-y-4">
            <div className="bg-gray-50 rounded-lg p-3 space-y-2">
              <h3 className="text-sm font-semibold text-gray-700">Batch Information (Pre-filled)</h3>
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div>
                  <span className="text-gray-500">Batch Number:</span>
                  <p className="font-medium text-gray-900">{batchData.batch_number}</p>
                </div>
                <div>
                  <span className="text-gray-500">Production Date:</span>
                  <p className="font-medium text-gray-900">
                    {new Date(0, parseInt(batchData.production_month) - 1).toLocaleString('default', { month: 'long' })} {batchData.production_year}
                  </p>
                </div>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Test Suite *
              </label>
              {loading ? (
                <div className="text-sm text-gray-500">Loading test suites...</div>
              ) : (
                <select
                  required
                  value={testSuiteId}
                  onChange={(e) => setTestSuiteId(e.target.value)}
                  className="w-full rounded-md border-gray-300 shadow-sm focus:border-teal-500 focus:ring-teal-500"
                  disabled={creating}
                >
                  <option value="">Select a test suite</option>
                  {testSuites.map((suite) => (
                    <option key={suite.id} value={suite.id}>
                      {suite.name} - LKR {suite.test_suite_items.reduce((total, item) => total + item.tests.cost, 0).toFixed(2)}
                    </option>
                  ))}
                </select>
              )}
            </div>

            <div className="text-xs text-gray-500 bg-gray-50 p-2 rounded">
              <p>
                Plastic type, grade, production date, and batch number are automatically filled from the processing batch.
              </p>
            </div>
          </div>

          <div className="mt-6 flex justify-end space-x-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50"
              disabled={creating}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-4 py-2 bg-teal-600 text-white rounded-md hover:bg-teal-700 disabled:opacity-50 disabled:cursor-not-allowed"
              disabled={creating || !testSuiteId}
            >
              {creating ? 'Creating...' : 'Create Order'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
