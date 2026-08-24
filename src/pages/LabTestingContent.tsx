import React from 'react';
import { useAuth } from '../hooks/useAuth';
import { supabase } from '../lib/supabase';
import { AlertCircle, Eye, FileText, X } from 'lucide-react';

interface LabBatch {
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

interface LabOrder {
  id: string;
  order_number: string;
  status: string;
  created_at: string;
  customer: {
    full_name: string;
  } | null;
  test_suite: {
    name: string;
  } | null;
}

interface Order {
  id: string;
  order_number: string;
  status: string;
  financial_status: string;
  qa_approval_status: string | null;
  created_at: string;
  production_month: number | null;
  production_year: number | null;
  batch_number: string | null;
  shipping_date: string | null;
  approval_notes: string | null;
  qa_approval_notes: string | null;
  shipped_number_of_samples: number | null;
  shipped_weight_kgs: number | null;
  shipping_notes: string | null;
  rejection_notes: string | null;
  rejection_date: string | null;
  sample_inspection_status: string | null;
  sample_inspection_date: string | null;
  sample_inspection_notes: string | null;
  sample_inspection_photo_path: string | null;
  inspected_by: string | null;
  certificate_uuid: string | null;
  certificate_path: string | null;
  completion_notes: string | null;
  order_source: string;
  processing_batch_id: string | null;
  inspector?: {
    full_name: string;
    role: string;
  } | null;
  customer: {
    full_name: string;
    customer_profile: {
      business_name: string;
      business_code: string;
    } | null;
  } | null;
  test_suite: {
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
  } | null;
  plastic_type: {
    id: string;
    number: string;
    name: string;
  };
  plastic_grade: {
    id: string;
    number: string;
    name: string;
  };
  order_results: {
    id: string;
    test_id: string;
    result: string | null;
    approval_status: string;
    notes: string | null;
    notes_app_rej: string | null;
    tests: {
      name: string;
    };
  }[];
  order_documents: {
    id: string;
    file_name: string;
    file_path: string;
  }[];
  processing_batch?: {
    id: string;
    intake_batch_reference: string;
    actual_processing_completion_date: string | null;
    original_quantity_kg: number;
  } | null;
}

export function LabTestingContent() {
  const { user } = useAuth();
  const [labBatches, setLabBatches] = React.useState<LabBatch[]>([]);
  const [batchOrders, setBatchOrders] = React.useState<Map<string, LabOrder>>(new Map());
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [viewingBatch, setViewingBatch] = React.useState<LabBatch | null>(null);
  const [viewingOrder, setViewingOrder] = React.useState<Order | null>(null);
  const [loadingOrderDetails, setLoadingOrderDetails] = React.useState(false);

  React.useEffect(() => {
    fetchLabBatches();
  }, [user?.id]);

  const fetchLabBatches = async () => {
    if (!user?.id) return;

    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('sorted_plastic_intake_processing')
        .select('*')
        .eq('status', 'lab')
        .order('actual_processing_completion_date', { ascending: false });

      if (error) throw error;

      const batches = data || [];
      setLabBatches(batches);

      const orderMap = new Map<string, LabOrder>();
      for (const batch of batches) {
        const { data: orderData } = await supabase
          .from('orders')
          .select(`
            id,
            order_number,
            status,
            created_at,
            customer:users!orders_customer_id_fkey(full_name),
            test_suite:test_suites(name)
          `)
          .eq('processing_batch_id', batch.id)
          .maybeSingle();

        if (orderData) {
          orderMap.set(batch.id, orderData as LabOrder);
        }
      }
      setBatchOrders(orderMap);
    } catch (err) {
      console.error('Error fetching lab batches:', err);
      setError('Failed to load lab testing batches');
    } finally {
      setLoading(false);
    }
  };

  const fetchFullOrderDetails = async (orderId: string) => {
    setLoadingOrderDetails(true);
    try {
      const { data, error } = await supabase
        .from('orders')
        .select(`
          *,
          customer:users!orders_customer_id_fkey(
            full_name,
            customer_profile:customer_profiles(
              business_name,
              business_code
            )
          ),
          test_suite:test_suites(
            id,
            name,
            description,
            test_suite_items(
              tests(id, name, cost, unit_of_measure, time_to_delivery, min_sample_size)
            )
          ),
          plastic_type:plastic_types(id, number, name),
          plastic_grade:plastic_grades(id, number, name),
          order_results(
            id,
            test_id,
            result,
            approval_status,
            notes,
            notes_app_rej,
            tests(name)
          ),
          order_documents(id, file_name, file_path),
          processing_batch:sorted_plastic_intake_processing(
            id,
            intake_batch_reference,
            actual_processing_completion_date,
            original_quantity_kg
          ),
          inspector:users!orders_inspected_by_fkey(full_name, role)
        `)
        .eq('id', orderId)
        .single();

      if (error) throw error;
      setViewingOrder(data as Order);
    } catch (err) {
      console.error('Error fetching order details:', err);
      setError('Failed to load order details');
    } finally {
      setLoadingOrderDetails(false);
    }
  };

  const getOrderStatusBadge = (status: string) => {
    const statusColors: { [key: string]: string } = {
      pending: 'bg-yellow-100 text-yellow-800',
      processing: 'bg-blue-100 text-blue-800',
      completed: 'bg-green-100 text-green-800',
      results_approved: 'bg-green-100 text-green-800',
      sample_shipped: 'bg-indigo-100 text-indigo-800',
      sample_rejected: 'bg-red-100 text-red-800'
    };

    const colorClass = statusColors[status] || 'bg-gray-100 text-gray-800';

    return (
      <span className={`px-2 py-1 rounded-full text-xs font-medium ${colorClass}`}>
        {status.replace('_', ' ').toUpperCase()}
      </span>
    );
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
        <h2 className="text-2xl font-bold text-gray-900">Lab Testing Operations</h2>
        <p className="mt-1 text-gray-600">
          Track processing batches currently undergoing laboratory testing.
        </p>
      </div>

      {error && (
        <div className="mb-6 bg-red-50 border-l-4 border-red-400 p-4 rounded-md">
          <div className="flex items-center">
            <AlertCircle className="h-6 w-6 text-red-400 mr-3" />
            <p className="text-red-700">{error}</p>
          </div>
        </div>
      )}

      <div className="bg-white rounded-lg shadow-md overflow-hidden">
        {labBatches.length === 0 ? (
          <div className="p-6 text-center text-gray-500">
            No batches currently in lab testing.
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
                    Completion Date
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Post Weight
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Order Number
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Order Status
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {labBatches.map((batch) => {
                  const order = batchOrders.get(batch.id);
                  return (
                    <tr key={batch.id} className="hover:bg-gray-50">
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                        {batch.intake_batch_reference}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {batch.actual_processing_completion_date
                          ? new Date(batch.actual_processing_completion_date).toLocaleDateString()
                          : '-'}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {batch.post_processing_weight_kg ? `${batch.post_processing_weight_kg} kg` : '-'}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {order ? (
                          <span className="font-medium">{order.order_number}</span>
                        ) : (
                          <span className="text-gray-400 italic">No order found</span>
                        )}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {order ? getOrderStatusBadge(order.status) : '-'}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        <div className="flex items-center space-x-3">
                          <button
                            onClick={() => setViewingBatch(batch)}
                            className="text-gray-600 hover:text-gray-900"
                            title="View Batch Details"
                          >
                            <Eye className="h-4 w-4" />
                          </button>
                          {order && (
                            <button
                              onClick={() => fetchFullOrderDetails(order.id)}
                              className="text-blue-600 hover:text-blue-900"
                              title="View Order Details"
                            >
                              <FileText className="h-4 w-4" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {viewingBatch && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4" onClick={(e) => {
          if (e.target === e.currentTarget) {
            setViewingBatch(null);
          }
        }}>
          <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 flex justify-between items-center">
              <h2 className="text-xl font-semibold text-gray-900">Batch Details</h2>
              <button
                onClick={() => setViewingBatch(null)}
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
                    {viewingBatch.intake_batch_reference}
                  </p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-500 mb-1">
                    Status
                  </label>
                  <span className="px-2 py-1 rounded-full text-xs font-medium bg-teal-100 text-teal-800">
                    In Lab Testing
                  </span>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-500 mb-1">
                    Processing Start Date
                  </label>
                  <p className="text-base text-gray-900">
                    {new Date(viewingBatch.processing_start_date).toLocaleString()}
                  </p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-500 mb-1">
                    Completion Date
                  </label>
                  <p className="text-base text-gray-900">
                    {viewingBatch.actual_processing_completion_date
                      ? new Date(viewingBatch.actual_processing_completion_date).toLocaleDateString()
                      : '-'}
                  </p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-500 mb-1">
                    Original Quantity
                  </label>
                  <p className="text-base text-gray-900">
                    {viewingBatch.original_quantity_kg} kg
                  </p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-500 mb-1">
                    Post Processing Weight
                  </label>
                  <p className="text-base text-gray-900">
                    {viewingBatch.post_processing_weight_kg ? `${viewingBatch.post_processing_weight_kg} kg` : '-'}
                  </p>
                </div>

                {viewingBatch.preprocessing_notes && (
                  <div className="md:col-span-2">
                    <label className="block text-sm font-medium text-gray-500 mb-1">
                      Preprocessing Notes
                    </label>
                    <p className="text-base text-gray-900 whitespace-pre-wrap">
                      {viewingBatch.preprocessing_notes}
                    </p>
                  </div>
                )}

                {viewingBatch.post_processing_notes && (
                  <div className="md:col-span-2">
                    <label className="block text-sm font-medium text-gray-500 mb-1">
                      Post Processing Notes
                    </label>
                    <p className="text-base text-gray-900 whitespace-pre-wrap">
                      {viewingBatch.post_processing_notes}
                    </p>
                  </div>
                )}
              </div>

              <div className="border-t border-gray-200 pt-4">
                <h3 className="text-sm font-medium text-gray-700 mb-3">Associated Order</h3>
                {(() => {
                  const order = batchOrders.get(viewingBatch.id);
                  if (!order) {
                    return (
                      <div className="bg-gray-50 rounded-lg p-4 text-center">
                        <p className="text-sm text-gray-600">No order found for this batch</p>
                      </div>
                    );
                  }
                  return (
                    <div className="bg-gray-50 rounded-lg p-4">
                      <div className="flex justify-between items-start">
                        <div>
                          <p className="text-sm font-semibold text-gray-900">{order.order_number}</p>
                          <p className="text-xs text-gray-500 mt-1">
                            Created: {new Date(order.created_at).toLocaleDateString()}
                          </p>
                          {order.customer && (
                            <p className="text-xs text-gray-500">
                              Customer: {order.customer.full_name}
                            </p>
                          )}
                          {order.test_suite && (
                            <p className="text-xs text-gray-500">
                              Test Suite: {order.test_suite.name}
                            </p>
                          )}
                        </div>
                        <div className="text-right">
                          {getOrderStatusBadge(order.status)}
                          <button
                            onClick={() => fetchFullOrderDetails(order.id)}
                            className="mt-2 text-xs text-blue-600 hover:text-blue-800 underline"
                          >
                            View Full Details
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })()}
              </div>
            </div>

            <div className="sticky bottom-0 bg-gray-50 px-6 py-4 flex justify-end border-t border-gray-200">
              <button
                onClick={() => setViewingBatch(null)}
                className="px-4 py-2 bg-gray-600 text-white rounded-md hover:bg-gray-700"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {loadingOrderDetails && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[60]">
          <div className="bg-white rounded-lg p-6">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900 mx-auto"></div>
            <p className="mt-4 text-gray-700">Loading order details...</p>
          </div>
        </div>
      )}

      {viewingOrder && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[60] p-4" onClick={(e) => {
          if (e.target === e.currentTarget) {
            setViewingOrder(null);
          }
        }}>
          <div className="bg-white rounded-lg shadow-xl max-w-4xl w-full max-h-[90vh] overflow-y-auto">
            <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 flex justify-between items-center">
              <h2 className="text-xl font-semibold text-gray-900">Order Details - #{viewingOrder.order_number}</h2>
              <button
                onClick={() => setViewingOrder(null)}
                className="text-gray-500 hover:text-gray-700"
              >
                <X className="h-6 w-6" />
              </button>
            </div>

            <div className="px-6 py-4 space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <h3 className="text-sm font-medium text-gray-500 mb-2">Order Information</h3>
                  <div className="space-y-2">
                    <div>
                      <span className="text-xs text-gray-500">Order Number:</span>
                      <p className="text-sm font-semibold text-gray-900">{viewingOrder.order_number}</p>
                    </div>
                    <div>
                      <span className="text-xs text-gray-500">Status:</span>
                      <div className="mt-1">{getOrderStatusBadge(viewingOrder.status)}</div>
                    </div>
                    <div>
                      <span className="text-xs text-gray-500">Created:</span>
                      <p className="text-sm text-gray-900">{new Date(viewingOrder.created_at).toLocaleString()}</p>
                    </div>
                    {viewingOrder.customer && (
                      <div>
                        <span className="text-xs text-gray-500">Customer:</span>
                        <p className="text-sm text-gray-900">{viewingOrder.customer.full_name}</p>
                        {viewingOrder.customer.customer_profile && (
                          <p className="text-xs text-gray-500">
                            {viewingOrder.customer.customer_profile.business_name} ({viewingOrder.customer.customer_profile.business_code})
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                </div>

                <div>
                  <h3 className="text-sm font-medium text-gray-500 mb-2">Material Information</h3>
                  <div className="space-y-2">
                    <div>
                      <span className="text-xs text-gray-500">Plastic Type:</span>
                      <p className="text-sm text-gray-900">{viewingOrder.plastic_type.number} - {viewingOrder.plastic_type.name}</p>
                    </div>
                    <div>
                      <span className="text-xs text-gray-500">Grade:</span>
                      <p className="text-sm text-gray-900">{viewingOrder.plastic_grade.number} - {viewingOrder.plastic_grade.name}</p>
                    </div>
                    {viewingOrder.batch_number && (
                      <div>
                        <span className="text-xs text-gray-500">Batch Number:</span>
                        <p className="text-sm text-gray-900">{viewingOrder.batch_number}</p>
                      </div>
                    )}
                    {viewingOrder.processing_batch && (
                      <div>
                        <span className="text-xs text-gray-500">Processing Batch:</span>
                        <p className="text-sm text-gray-900">{viewingOrder.processing_batch.intake_batch_reference}</p>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {viewingOrder.test_suite && (
                <div>
                  <h3 className="text-sm font-medium text-gray-500 mb-2">Test Suite</h3>
                  <div className="bg-gray-50 rounded-lg p-4">
                    <p className="text-sm font-semibold text-gray-900">{viewingOrder.test_suite.name}</p>
                    <p className="text-xs text-gray-600 mt-1">{viewingOrder.test_suite.description}</p>
                    <div className="mt-3 space-y-1">
                      <p className="text-xs font-medium text-gray-700">Tests included:</p>
                      {viewingOrder.test_suite.test_suite_items.map((item, idx) => (
                        <p key={idx} className="text-xs text-gray-600">
                          • {item.tests.name} ({item.tests.unit_of_measure}) - LKR {item.tests.cost.toFixed(2)}
                        </p>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {viewingOrder.order_results.length > 0 && (
                <div>
                  <h3 className="text-sm font-medium text-gray-500 mb-2">Test Results</h3>
                  <div className="bg-gray-50 rounded-lg p-4 space-y-2">
                    {viewingOrder.order_results.map((result) => (
                      <div key={result.id} className="flex justify-between items-center text-sm">
                        <span className="text-gray-700">{result.tests.name}:</span>
                        <span className="font-medium text-gray-900">{result.result || 'Pending'}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div className="sticky bottom-0 bg-gray-50 px-6 py-4 flex justify-end border-t border-gray-200">
              <button
                onClick={() => setViewingOrder(null)}
                className="px-4 py-2 bg-gray-600 text-white rounded-md hover:bg-gray-700"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
