import React, { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../hooks/useAuth';
import { useNavigate } from 'react-router-dom';
import { CheckCircle, XCircle, DollarSign, FileText, Calendar, User, Package } from 'lucide-react';
import { logAuditEvent } from '../utils/auditLogger';

interface Order {
  id: string;
  order_number: string;
  status: string;
  financial_status: string;
  created_at: string;
  production_month: number | null;
  production_year: number | null;
  batch_number: string | null;
  approval_notes: string | null;
  approved_at: string | null;
  approved_by: string | null;
  customer: {
    full_name: string;
    customer_profile: {
      business_name: string;
      business_code: string;
    } | null;
  } | null;
  test_suite: {
    name: string;
    description: string;
    test_suite_items: {
      tests: {
        name: string;
        cost: number;
      };
    }[];
  } | null;
  individual_tests: {
    test_id: string;
    tests: {
      id: string;
      name: string;
      cost: number;
    };
  }[];
  plastic_type: {
    number: string;
    name: string;
  };
  plastic_grade: {
    number: string;
    name: string;
  };
}

export function FinanceApproval() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [userRole, setUserRole] = useState<string | null>(null);
  const [selectedOrder, setSelectedOrder] = useState<string | null>(null);
  const [approvalNotes, setApprovalNotes] = useState('');
  const [processingApproval, setProcessingApproval] = useState<string | null>(null);
  const [filter, setFilter] = useState<string>('pending_approval');
  const { user } = useAuth();
  const navigate = useNavigate();

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

        if (userData.role !== 'finance' && userData.role !== 'admin') {
          navigate('/');
          return;
        }

        setUserRole(userData.role);
      } catch (err) {
        console.error('Error checking user role:', err);
        navigate('/');
      }
    };

    checkUserRole();
  }, [user?.id, navigate]);

  useEffect(() => {
    const fetchOrders = async () => {
      if (!userRole || (userRole !== 'finance' && userRole !== 'admin')) return;

      try {
        let query = supabase
          .from('orders')
          .select(`
            *,
            customer:users!customer_id(
              full_name,
              customer_profile:customer_profiles(
                business_name,
                business_code
              )
            ),
            test_suite:test_suites(
              name, 
              description,
              test_suite_items(
                tests(name, cost)
              )
            ),
            individual_tests:order_results(
              test_id,
              tests(id, name, cost)
            ),
            plastic_type:plastic_types(number, name),
            plastic_grade:plastic_grades(number, name)
          `)
          .order('created_at', { ascending: false });

        const { data, error: fetchError } = await query;

        if (fetchError) throw fetchError;
        setOrders(data || []);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to fetch orders');
      } finally {
        setLoading(false);
      }
    };

    if (userRole) {
      fetchOrders();
    }
  }, [userRole]);

  // Filter orders for display based on selected filter
  const displayedOrders = React.useMemo(() => {
    if (filter === 'all') {
      return orders;
    }
    return orders.filter(order => order.financial_status === filter);
  }, [orders, filter]);

  const calculateOrderTotal = (order: Order) => {
    let total = 0;
    
    // Add costs from test suite items
    if (order.test_suite) {
      total += (order.test_suite.test_suite_items || []).reduce((suiteTotal, item) => suiteTotal + item.tests.cost, 0);
    }
    
    // Add costs from individual tests
    total += (order.individual_tests || []).reduce((individualTotal, item) => individualTotal + item.tests.cost, 0);
    
    return total;
  };

  const handleApproval = async (orderId: string, action: 'approved' | 'rejected') => {
    if (!approvalNotes.trim()) {
      setError('Please add approval notes before proceeding');
      return;
    }

    setProcessingApproval(orderId);
    try {
      const updateData = {
        financial_status: action,
        approved_by: user?.id,
        approved_at: new Date().toISOString(),
        approval_notes: approvalNotes.trim()
      };

      const { error } = await supabase
        .from('orders')
        .update(updateData)
        .eq('id', orderId);

      if (error) throw error;

      await logAuditEvent(
        action === 'approved' ? 'ORDER_APPROVED' : 'ORDER_REJECTED',
        'orders',
        orderId,
        {
          action,
          notes: approvalNotes.trim(),
          approved_by: user?.id
        }
      );

      // Refresh orders list
      const { data: updatedOrders, error: fetchError } = await supabase
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
            name, 
            description,
            test_suite_items(
              tests(name, cost)
            )
          ),
          individual_tests:order_results(
            test_id,
            tests(id, name, cost)
          ),
          plastic_type:plastic_types(number, name),
          plastic_grade:plastic_grades(number, name)
        `)
        .order('created_at', { ascending: false });

      if (fetchError) throw fetchError;
      setOrders(updatedOrders || []);

      setSelectedOrder(null);
      setApprovalNotes('');
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to process approval');
    } finally {
      setProcessingApproval(null);
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'pending_approval':
        return 'bg-yellow-100 text-yellow-800';
      case 'approved':
        return 'bg-green-100 text-green-800';
      case 'rejected':
        return 'bg-red-100 text-red-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900"></div>
      </div>
    );
  }

  if (userRole !== 'finance' && userRole !== 'admin') {
    return (
      <div className="flex flex-col items-center justify-center h-64">
        <DollarSign className="w-16 h-16 text-red-500 mb-4" />
        <h2 className="text-2xl font-bold text-gray-900 mb-2">Access Denied</h2>
        <p className="text-gray-600">You don't have permission to access finance approvals.</p>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="flex items-center gap-3 mb-8">
        <DollarSign className="w-8 h-8 text-green-600" />
        <h1 className="text-2xl font-bold text-gray-900">Finance Approval</h1>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded mb-6">
          {error}
        </div>
      )}

      {/* Filter Tabs */}
      <div className="mb-6">
        <div className="border-b border-gray-200">
          <nav className="-mb-px flex space-x-8">
            {[
              { key: 'pending_approval', label: 'Pending Approval', count: orders.filter(o => o.financial_status === 'pending_approval').length },
              { key: 'approved', label: 'Approved', count: orders.filter(o => o.financial_status === 'approved').length },
              { key: 'rejected', label: 'Rejected', count: orders.filter(o => o.financial_status === 'rejected').length },
              { key: 'all', label: 'All Orders', count: orders.length }
            ].map((tab) => (
              <button
                key={tab.key}
                onClick={() => setFilter(tab.key)}
                className={`py-2 px-1 border-b-2 font-medium text-sm ${
                  filter === tab.key
                    ? 'border-green-500 text-green-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                {tab.label} ({tab.count})
              </button>
            ))}
          </nav>
        </div>
      </div>

      {/* Approval Modal */}
      {selectedOrder && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-md">
            <h2 className="text-xl font-bold mb-4">Order Approval</h2>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Approval Notes *
                </label>
                <textarea
                  value={approvalNotes}
                  onChange={(e) => setApprovalNotes(e.target.value)}
                  placeholder="Add notes about payment details, PO number, etc..."
                  rows={4}
                  className="w-full rounded-md border-gray-300 shadow-sm focus:border-green-500 focus:ring-green-500"
                  required
                />
                <p className="text-xs text-gray-500 mt-1">
                  Include payment details, PO numbers, or other relevant information
                </p>
              </div>
            </div>
            <div className="mt-6 flex justify-end space-x-3">
              <button
                onClick={() => {
                  setSelectedOrder(null);
                  setApprovalNotes('');
                }}
                className="px-4 py-2 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50"
                disabled={processingApproval === selectedOrder}
              >
                Cancel
              </button>
              <button
                onClick={() => handleApproval(selectedOrder, 'rejected')}
                disabled={!approvalNotes.trim() || processingApproval === selectedOrder}
                className="px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
              >
                <XCircle className="w-4 h-4" />
                {processingApproval === selectedOrder ? 'Processing...' : 'Reject'}
              </button>
              <button
                onClick={() => handleApproval(selectedOrder, 'approved')}
                disabled={!approvalNotes.trim() || processingApproval === selectedOrder}
                className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
              >
                <CheckCircle className="w-4 h-4" />
                {processingApproval === selectedOrder ? 'Processing...' : 'Approve'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Orders List */}
      <div className="space-y-6">
        {displayedOrders.map((order) => (
          <div key={order.id} className="bg-white rounded-lg shadow-md p-6">
            <div className="flex justify-between items-start mb-4">
              <div className="flex-1">
                <div className="flex items-center gap-3 mb-2">
                  <h3 className="text-lg font-semibold text-gray-900">
                    Order #{order.order_number}
                  </h3>
                  <span className={`px-2 py-1 text-xs rounded-full ${getStatusColor(order.financial_status)}`}>
                    {order.financial_status.replace('_', ' ').toUpperCase()}
                  </span>
                </div>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                  <div>
                    <div className="flex items-center gap-2 mb-2">
                      <User className="w-4 h-4 text-gray-500" />
                      <span className="text-sm font-medium text-gray-700">Customer</span>
                    </div>
                    <p className="text-sm text-gray-900">{order.customer?.full_name || 'N/A'}</p>
                    <p className="text-sm text-gray-600">{order.customer?.customer_profile?.business_name || 'N/A'}</p>
                    <p className="text-sm text-gray-500">Code: {order.customer?.customer_profile?.business_code || 'N/A'}</p>
                  </div>
                  
                  <div>
                    <div className="flex items-center gap-2 mb-2">
                      <Calendar className="w-4 h-4 text-gray-500" />
                      <span className="text-sm font-medium text-gray-700">Order Details</span>
                    </div>
                    <p className="text-sm text-gray-900">Created: {new Date(order.created_at).toLocaleDateString()}</p>
                    {order.production_month && order.production_year && (
                      <p className="text-sm text-gray-600">
                        Production: {order.production_month}/{order.production_year}
                      </p>
                    )}
                    {order.batch_number && (
                      <p className="text-sm text-gray-600">Batch: {order.batch_number}</p>
                    )}
                  </div>
                </div>

                <div className="mb-4">
                  <div className="flex items-center gap-2 mb-2">
                    <Package className="w-4 h-4 text-gray-500" />
                    <span className="text-sm font-medium text-gray-700">
                      {order.test_suite ? `Test Suite: ${order.test_suite.name}` : 'Individual Tests'}
                    </span>
                  </div>
                  <div className="bg-gray-50 rounded-lg p-3">
                    <div className="space-y-2">
                      {order.test_suite && (order.test_suite.test_suite_items || []).map((item, index) => (
                        <div key={index} className="flex justify-between items-center text-sm">
                          <span className="text-gray-700">{item.tests.name}</span>
                          <span className="font-medium text-gray-900">LKR {item.tests.cost.toFixed(2)}</span>
                        </div>
                      ))}
                      {(order.individual_tests || []).map((item, index) => (
                        <div key={`individual-${index}`} className="flex justify-between items-center text-sm">
                          <span className="text-gray-700">{item.tests.name} (Individual)</span>
                          <span className="font-medium text-gray-900">LKR {item.tests.cost.toFixed(2)}</span>
                        </div>
                      ))}
                      <div className="border-t pt-2 mt-2">
                        <div className="flex justify-between items-center font-semibold">
                          <span>Total:</span>
                          <span className="text-green-600">LKR {calculateOrderTotal(order).toFixed(2)}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="mb-4">
                  <div className="text-sm font-medium text-gray-700 mb-1">Materials</div>
                  <p className="text-sm text-gray-600">
                    Type: {order.plastic_type.number} - {order.plastic_type.name}
                  </p>
                  <p className="text-sm text-gray-600">
                    Grade: {order.plastic_grade.number} - {order.plastic_grade.name}
                  </p>
                </div>

                {order.approval_notes && (
                  <div className="mb-4 p-3 bg-blue-50 rounded-lg">
                    <div className="text-sm font-medium text-blue-900 mb-1">Approval Notes:</div>
                    <p className="text-sm text-blue-800">{order.approval_notes}</p>
                    {order.approved_at && (
                      <p className="text-xs text-blue-600 mt-1">
                        Approved on {new Date(order.approved_at).toLocaleString()}
                      </p>
                    )}
                  </div>
                )}
              </div>

              {order.financial_status === 'pending_approval' && (
                <div className="ml-6">
                  <button
                    onClick={() => setSelectedOrder(order.id)}
                    className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 flex items-center gap-2"
                  >
                    <FileText className="w-4 h-4" />
                    Review & Approve
                  </button>
                </div>
              )}
            </div>
          </div>
        ))}

        {displayedOrders.length === 0 && (
          <div className="text-center py-12 bg-white rounded-lg">
            <DollarSign className="w-12 h-12 text-gray-400 mx-auto mb-4" />
            <p className="text-gray-500">
              {filter === 'pending_approval' 
                ? 'No orders pending approval' 
                : filter === 'all'
                ? 'No orders found'
                : `No ${filter.replace('_', ' ')} orders found`}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}