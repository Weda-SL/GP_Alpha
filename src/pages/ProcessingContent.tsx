import React from 'react';
import { useAuth } from '../hooks/useAuth';
import { supabase } from '../lib/supabase';
import { AlertCircle, Eye, X, CheckCircle, Trash2, Beaker } from 'lucide-react';
import { BatchOrderModal } from '../components/BatchOrderModal';
import { SuccessNotification } from '../components/SuccessNotification';

interface ProcessingRecord {
  id: string;
  sorted_intake_id: string;
  intake_batch_reference: string;
  original_quantity_kg: number;
  processing_start_date: string;
  status: string;
  estimated_processing_completion_date: string;
  actual_processing_completion_date: string | null;
  post_processing_weight_kg: number | null;
  preprocessing_notes: string;
  post_processing_notes: string;
  created_at: string;
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

export function ProcessingContent() {
  const { user } = useAuth();
  const [processingRecords, setProcessingRecords] = React.useState<ProcessingRecord[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [viewingRecord, setViewingRecord] = React.useState<ProcessingRecord | null>(null);
  const [completingRecord, setCompletingRecord] = React.useState<ProcessingRecord | null>(null);
  const [deletingRecordId, setDeletingRecordId] = React.useState<string | null>(null);
  const [completionFormData, setCompletionFormData] = React.useState({
    actual_completion_date: new Date().toISOString().split('T')[0],
    post_processing_weight_kg: '',
    post_processing_notes: ''
  });
  const [convertingBatch, setConvertingBatch] = React.useState<ProcessingRecord | null>(null);
  const [batchConversionData, setBatchConversionData] = React.useState<BatchConversionData | null>(null);
  const [preparingBatch, setPreparingBatch] = React.useState(false);
  const [relatedOrders, setRelatedOrders] = React.useState<any[]>([]);
  const [loadingRelatedOrders, setLoadingRelatedOrders] = React.useState(false);
  const [successMessage, setSuccessMessage] = React.useState<string | null>(null);

  React.useEffect(() => {
    fetchProcessingRecords();
  }, [user?.id]);

  React.useEffect(() => {
    if (viewingRecord) {
      fetchRelatedOrders(viewingRecord.id);
    } else {
      setRelatedOrders([]);
    }
  }, [viewingRecord]);

  const fetchProcessingRecords = async () => {
    if (!user?.id) return;

    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('sorted_plastic_intake_processing')
        .select('*')
        .eq('created_by', user.id)
        .order('processing_start_date', { ascending: false });

      if (error) throw error;
      setProcessingRecords(data || []);
    } catch (err) {
      console.error('Error fetching processing records:', err);
      setError('Failed to load processing records');
    } finally {
      setLoading(false);
    }
  };

  const fetchRelatedOrders = async (processingBatchId: string) => {
    try {
      setLoadingRelatedOrders(true);
      const { data, error } = await supabase
        .from('orders')
        .select('id, order_number, status, created_at, customer:users!orders_customer_id_fkey(full_name)')
        .eq('processing_batch_id', processingBatchId)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setRelatedOrders(data || []);
    } catch (err) {
      console.error('Error fetching related orders:', err);
    } finally {
      setLoadingRelatedOrders(false);
    }
  };

  const getDateNotificationClass = (estimatedDate: string, status: string) => {
    if (status === 'completed') return '';

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const estimated = new Date(estimatedDate);
    estimated.setHours(0, 0, 0, 0);
    const diffDays = Math.floor((estimated.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));

    if (diffDays < 0) {
      return 'bg-red-100 text-red-800 font-semibold';
    } else if (diffDays <= 2) {
      return 'bg-orange-100 text-orange-800 font-semibold';
    }
    return '';
  };

  const getStatusBadge = (status: string) => {
    const statusColors = {
      processing: 'bg-blue-100 text-blue-800',
      completed: 'bg-green-100 text-green-800',
      lab: 'bg-teal-100 text-teal-800'
    };

    const statusLabels = {
      processing: 'Processing',
      completed: 'Completed',
      lab: 'In Lab Testing'
    };

    const colorClass = statusColors[status as keyof typeof statusColors] || 'bg-gray-100 text-gray-800';
    const label = statusLabels[status as keyof typeof statusLabels] || status;

    return (
      <span className={`px-2 py-1 rounded-full text-xs font-medium ${colorClass}`}>
        {label}
      </span>
    );
  };

  const handleCompleteProcessing = (record: ProcessingRecord) => {
    setCompletingRecord(record);
    setCompletionFormData({
      actual_completion_date: new Date().toISOString().split('T')[0],
      post_processing_weight_kg: '',
      post_processing_notes: ''
    });
    setError(null);
  };

  const handleSubmitCompletion = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!completingRecord) return;

    const postProcessingWeight = parseFloat(completionFormData.post_processing_weight_kg);
    if (postProcessingWeight > completingRecord.original_quantity_kg) {
      setError(`Post processing weight (${postProcessingWeight} kg) cannot exceed original quantity (${completingRecord.original_quantity_kg} kg)`);
      return;
    }

    try {
      const { error: updateError } = await supabase
        .from('sorted_plastic_intake_processing')
        .update({
          status: 'completed',
          actual_processing_completion_date: completionFormData.actual_completion_date,
          post_processing_weight_kg: postProcessingWeight,
          post_processing_notes: completionFormData.post_processing_notes
        })
        .eq('id', completingRecord.id);

      if (updateError) throw updateError;

      const { error: intakeUpdateError } = await supabase
        .from('sorted_plastic_intake')
        .update({ status: 'completed' })
        .eq('id', completingRecord.sorted_intake_id);

      if (intakeUpdateError) throw intakeUpdateError;

      setCompletingRecord(null);
      setCompletionFormData({
        actual_completion_date: new Date().toISOString().split('T')[0],
        post_processing_weight_kg: '',
        post_processing_notes: ''
      });
      fetchProcessingRecords();
    } catch (err: any) {
      console.error('Error completing processing:', err);
      setError(err.message || 'Failed to complete processing');
    }
  };

  const handleDelete = async () => {
    if (!deletingRecordId) return;

    try {
      const recordToDelete = processingRecords.find(r => r.id === deletingRecordId);
      if (!recordToDelete) return;

      const { error: deleteError } = await supabase
        .from('sorted_plastic_intake_processing')
        .delete()
        .eq('id', deletingRecordId);

      if (deleteError) throw deleteError;

      const { error: intakeUpdateError } = await supabase
        .from('sorted_plastic_intake')
        .update({ status: 'pending' })
        .eq('id', recordToDelete.sorted_intake_id);

      if (intakeUpdateError) throw intakeUpdateError;

      setDeletingRecordId(null);
      fetchProcessingRecords();
    } catch (err: any) {
      console.error('Error deleting processing record:', err);
      setError(err.message || 'Failed to delete processing record');
    }
  };

  const handleConvertToOrder = async (record: ProcessingRecord) => {
    setPreparingBatch(true);
    setError(null);

    try {
      const { data: intakeData, error: intakeError } = await supabase
        .from('sorted_plastic_intake')
        .select('plastic_type_names, grade, colour')
        .eq('id', record.sorted_intake_id)
        .maybeSingle();

      if (intakeError) throw intakeError;
      if (!intakeData) {
        throw new Error('Sorted intake record not found');
      }

      const plasticTypeName = intakeData.plastic_type_names;
      if (!plasticTypeName || typeof plasticTypeName !== 'string' || plasticTypeName.trim() === '') {
        console.error('Invalid plastic type data:', { plasticTypeName, intakeData });
        throw new Error('No plastic type found in sorted intake record');
      }

      console.log('Looking up plastic type:', plasticTypeName);
      const { data: plasticType, error: typeError } = await supabase
        .from('plastic_types')
        .select('id')
        .eq('name', plasticTypeName)
        .maybeSingle();

      if (typeError) throw typeError;
      if (!plasticType) {
        console.error('Plastic type not found:', { plasticTypeName, availableInIntake: intakeData });
        throw new Error(`Plastic type "${plasticTypeName}" not found in system. Please ensure the plastic type exists in the Types of Plastic management page.`);
      }

      const { data: plasticGrade, error: gradeError } = await supabase
        .from('plastic_grades')
        .select('id')
        .eq('name', intakeData.grade)
        .maybeSingle();

      if (gradeError) throw gradeError;
      if (!plasticGrade) {
        throw new Error(`Plastic grade "${intakeData.grade}" not found in system. Please ensure the plastic grade exists in the Plastic Grades management page.`);
      }

      if (!record.actual_processing_completion_date) {
        throw new Error('Completion date not found');
      }

      const completionDate = new Date(record.actual_processing_completion_date);
      const productionMonth = String(completionDate.getMonth() + 1);
      const productionYear = String(completionDate.getFullYear());

      setBatchConversionData({
        processing_batch_id: record.id,
        batch_reference: record.intake_batch_reference,
        plastic_type_id: plasticType.id,
        plastic_grade_id: plasticGrade.id,
        production_month: productionMonth,
        production_year: productionYear,
        batch_number: record.intake_batch_reference
      });

      setConvertingBatch(record);
    } catch (err: any) {
      console.error('Error preparing batch for conversion:', err);
      setError(err.message || 'Failed to prepare batch for order creation');
    } finally {
      setPreparingBatch(false);
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
    <div>
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-gray-900">Processing Operations</h2>
        <p className="mt-1 text-gray-600">
          Track and manage sorted plastic processing operations.
        </p>
      </div>

      {successMessage && (
        <SuccessNotification
          message={successMessage}
          onClose={() => setSuccessMessage(null)}
        />
      )}

      {error && (
        <div className="mb-6 bg-red-50 border-l-4 border-red-400 p-4 rounded-md">
          <div className="flex items-center">
            <AlertCircle className="h-6 w-6 text-red-400 mr-3" />
            <p className="text-red-700">{error}</p>
          </div>
        </div>
      )}

      <div className="bg-white rounded-lg shadow-md overflow-hidden">
        {processingRecords.length === 0 ? (
          <div className="p-6 text-center text-gray-500">
            No processing records found. Start processing from the Sorted Plastic Intake tab.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Batch Reference
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Start Date
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Status
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Est. Completion
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Actual Completion
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Original Weight
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Post Weight
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {processingRecords.map((record) => (
                  <tr key={record.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                      {record.intake_batch_reference}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {new Date(record.processing_start_date).toLocaleDateString()}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {getStatusBadge(record.status)}
                    </td>
                    <td className={`px-6 py-4 whitespace-nowrap text-sm text-gray-500 ${getDateNotificationClass(record.estimated_processing_completion_date, record.status)}`}>
                      {new Date(record.estimated_processing_completion_date).toLocaleDateString()}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {record.actual_processing_completion_date
                        ? new Date(record.actual_processing_completion_date).toLocaleDateString()
                        : '-'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {record.original_quantity_kg} kg
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {record.post_processing_weight_kg ? `${record.post_processing_weight_kg} kg` : '-'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      <div className="flex items-center space-x-3">
                        <button
                          onClick={() => setViewingRecord(record)}
                          className="text-gray-600 hover:text-gray-900"
                          title="View Details"
                        >
                          <Eye className="h-4 w-4" />
                        </button>
                        {record.status === 'completed' && (
                          <button
                            onClick={() => handleConvertToOrder(record)}
                            className="text-teal-600 hover:text-teal-900"
                            title="Create Order from Batch"
                            disabled={preparingBatch}
                          >
                            <Beaker className="h-4 w-4" />
                          </button>
                        )}
                        {record.status === 'lab' && (
                          <span className="text-xs text-teal-600 italic" title="Order already created from this batch">
                            Order Created
                          </span>
                        )}
                        {record.status === 'processing' && (
                          <>
                            <button
                              onClick={() => handleCompleteProcessing(record)}
                              className="text-green-600 hover:text-green-900"
                              title="Complete Processing"
                            >
                              <CheckCircle className="h-4 w-4" />
                            </button>
                            <button
                              onClick={() => setDeletingRecordId(record.id)}
                              className="text-red-600 hover:text-red-900"
                              title="Delete/Cancel"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {viewingRecord && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4" onClick={(e) => {
          if (e.target === e.currentTarget) {
            setViewingRecord(null);
          }
        }}>
          <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 flex justify-between items-center">
              <h2 className="text-xl font-semibold text-gray-900">Processing Details</h2>
              <button
                onClick={() => setViewingRecord(null)}
                className="text-gray-500 hover:text-gray-700"
              >
                <X className="h-6 w-6" />
              </button>
            </div>

            <div className="px-6 py-4 space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-500 mb-1">
                    Batch Reference
                  </label>
                  <p className="text-base text-gray-900 font-semibold">
                    {viewingRecord.intake_batch_reference}
                  </p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-500 mb-1">
                    Status
                  </label>
                  <p className="text-base text-gray-900">
                    {getStatusBadge(viewingRecord.status)}
                  </p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-500 mb-1">
                    Processing Start Date
                  </label>
                  <p className="text-base text-gray-900">
                    {new Date(viewingRecord.processing_start_date).toLocaleString()}
                  </p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-500 mb-1">
                    Estimated Completion Date
                  </label>
                  <p className="text-base text-gray-900">
                    {new Date(viewingRecord.estimated_processing_completion_date).toLocaleDateString()}
                  </p>
                </div>

                {viewingRecord.actual_processing_completion_date && (
                  <div>
                    <label className="block text-sm font-medium text-gray-500 mb-1">
                      Actual Completion Date
                    </label>
                    <p className="text-base text-gray-900">
                      {new Date(viewingRecord.actual_processing_completion_date).toLocaleDateString()}
                    </p>
                  </div>
                )}

                <div>
                  <label className="block text-sm font-medium text-gray-500 mb-1">
                    Original Quantity
                  </label>
                  <p className="text-base text-gray-900">
                    {viewingRecord.original_quantity_kg} kg
                  </p>
                </div>

                {viewingRecord.post_processing_weight_kg && (
                  <div>
                    <label className="block text-sm font-medium text-gray-500 mb-1">
                      Post Processing Weight
                    </label>
                    <p className="text-base text-gray-900">
                      {viewingRecord.post_processing_weight_kg} kg
                    </p>
                  </div>
                )}

                {viewingRecord.preprocessing_notes && (
                  <div className="md:col-span-2">
                    <label className="block text-sm font-medium text-gray-500 mb-1">
                      Preprocessing Notes
                    </label>
                    <p className="text-base text-gray-900 whitespace-pre-wrap">
                      {viewingRecord.preprocessing_notes}
                    </p>
                  </div>
                )}

                {viewingRecord.post_processing_notes && (
                  <div className="md:col-span-2">
                    <label className="block text-sm font-medium text-gray-500 mb-1">
                      Post Processing Notes
                    </label>
                    <p className="text-base text-gray-900 whitespace-pre-wrap">
                      {viewingRecord.post_processing_notes}
                    </p>
                  </div>
                )}
              </div>

              <div className="border-t border-gray-200 pt-4">
                <h3 className="text-sm font-medium text-gray-700 mb-3 flex items-center gap-2">
                  <Beaker className="h-4 w-4" />
                  Related Orders
                </h3>
                {loadingRelatedOrders ? (
                  <div className="text-sm text-gray-500 text-center py-4">Loading related orders...</div>
                ) : relatedOrders.length === 0 ? (
                  <div className="bg-gray-50 rounded-lg p-4 text-center">
                    <p className="text-sm text-gray-600">No orders created from this batch yet</p>
                  </div>
                ) : (
                  <div className="bg-gray-50 rounded-lg p-3">
                    <div className="space-y-2">
                      {relatedOrders.map((order) => (
                        <div key={order.id} className="flex justify-between items-center bg-white p-3 rounded border border-gray-200">
                          <div>
                            <p className="text-sm font-semibold text-gray-900">{order.order_number}</p>
                            <p className="text-xs text-gray-500">
                              Created: {new Date(order.created_at).toLocaleDateString()}
                            </p>
                            {order.customer && (
                              <p className="text-xs text-gray-500">
                                Customer: {order.customer.full_name}
                              </p>
                            )}
                          </div>
                          <div className="text-right">
                            <span className="inline-block px-2 py-1 text-xs rounded-full bg-blue-100 text-blue-800">
                              {order.status.replace('_', ' ').toUpperCase()}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                    <p className="text-xs text-gray-500 mt-3 text-center">
                      {relatedOrders.length} {relatedOrders.length === 1 ? 'order' : 'orders'} created from this batch
                    </p>
                  </div>
                )}
              </div>
            </div>

            <div className="sticky bottom-0 bg-gray-50 px-6 py-4 flex justify-end border-t border-gray-200">
              <button
                onClick={() => setViewingRecord(null)}
                className="px-4 py-2 bg-gray-600 text-white rounded-md hover:bg-gray-700"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {completingRecord && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4" onClick={(e) => {
          if (e.target === e.currentTarget) {
            setCompletingRecord(null);
          }
        }}>
          <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 flex justify-between items-center">
              <h2 className="text-xl font-semibold text-gray-900">Complete Processing</h2>
              <button
                onClick={() => setCompletingRecord(null)}
                className="text-gray-500 hover:text-gray-700"
              >
                <X className="h-6 w-6" />
              </button>
            </div>

            <form onSubmit={handleSubmitCompletion}>
              <div className="px-6 py-4">
                <div className="bg-gray-50 rounded-lg p-4 mb-6">
                  <h3 className="text-sm font-semibold text-gray-700 mb-3">Batch Information</h3>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-medium text-gray-500 mb-1">Batch Reference</label>
                      <p className="text-sm text-gray-900 font-semibold">{completingRecord.intake_batch_reference}</p>
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-500 mb-1">Start Date</label>
                      <p className="text-sm text-gray-900">{new Date(completingRecord.processing_start_date).toLocaleDateString()}</p>
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-500 mb-1">Est. Completion</label>
                      <p className="text-sm text-gray-900">{new Date(completingRecord.estimated_processing_completion_date).toLocaleDateString()}</p>
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-500 mb-1">Original Weight</label>
                      <p className="text-sm text-gray-900">{completingRecord.original_quantity_kg} kg</p>
                    </div>
                  </div>
                  {completingRecord.preprocessing_notes && (
                    <div className="mt-3">
                      <label className="block text-xs font-medium text-gray-500 mb-1">Preprocessing Notes</label>
                      <p className="text-sm text-gray-700 italic">{completingRecord.preprocessing_notes}</p>
                    </div>
                  )}
                </div>

                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Actual Completion Date *
                    </label>
                    <input
                      type="date"
                      required
                      min={completingRecord.processing_start_date.split('T')[0]}
                      max={new Date().toISOString().split('T')[0]}
                      value={completionFormData.actual_completion_date}
                      onChange={(e) => setCompletionFormData({ ...completionFormData, actual_completion_date: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Post Processing Weight (kg) *
                    </label>
                    <input
                      type="number"
                      required
                      min="0.01"
                      max={completingRecord.original_quantity_kg}
                      step="0.01"
                      value={completionFormData.post_processing_weight_kg}
                      onChange={(e) => setCompletionFormData({ ...completionFormData, post_processing_weight_kg: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                      placeholder="Enter final weight"
                    />
                    <p className="mt-1 text-xs text-gray-500">
                      Weight cannot exceed original quantity ({completingRecord.original_quantity_kg} kg)
                    </p>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Post Processing Notes *
                    </label>
                    <textarea
                      required
                      value={completionFormData.post_processing_notes}
                      onChange={(e) => setCompletionFormData({ ...completionFormData, post_processing_notes: e.target.value })}
                      rows={4}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                      placeholder="Enter final observations, quality notes, or other relevant information..."
                    />
                  </div>
                </div>
              </div>

              <div className="sticky bottom-0 bg-gray-50 px-6 py-4 flex justify-end space-x-4 border-t border-gray-200">
                <button
                  type="button"
                  onClick={() => setCompletingRecord(null)}
                  className="px-4 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-green-600 hover:bg-green-700"
                >
                  Complete Processing
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {deletingRecordId && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Confirm Delete</h3>
            <p className="text-gray-700 mb-6">
              Are you sure you want to delete this processing record? This will revert the sorted intake status back to pending. This action cannot be undone.
            </p>
            <div className="flex justify-end space-x-3">
              <button
                onClick={() => setDeletingRecordId(null)}
                className="px-4 py-2 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={handleDelete}
                className="px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {convertingBatch && batchConversionData && (
        <BatchOrderModal
          batchData={batchConversionData}
          onClose={() => {
            setConvertingBatch(null);
            setBatchConversionData(null);
            setError(null);
          }}
          onSuccess={(orderId, orderNumber) => {
            setConvertingBatch(null);
            setBatchConversionData(null);
            setError(null);
            setSuccessMessage(`Order ${orderNumber} created successfully from batch ${batchConversionData.batch_reference}`);
            fetchProcessingRecords();
          }}
        />
      )}
    </div>
  );
}
