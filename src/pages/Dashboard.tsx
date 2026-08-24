import React from 'react';
import { useAuth } from '../hooks/useAuth';
import { supabase } from '../lib/supabase';
import { AlertCircle, ClipboardList, CheckCircle, Clock, Trash2, Send } from 'lucide-react';

interface OrderStats {
  totalOrders: number;
  completedTests: number;
  pendingResults: number;
}

interface WasteStats {
  totalIntake: number;
  totalQuantityKg: number;
  thisMonthIntake: number;
}

interface SortedStats {
  totalSorted: number;
  totalSortedQuantityKg: number;
  thisMonthSorted: number;
}

export function Dashboard() {
  const { user } = useAuth();
  const [userStatus, setUserStatus] = React.useState<string | null>(null);
  const [userRole, setUserRole] = React.useState<string | null>(null);
  const [businessCategory, setBusinessCategory] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [orderStats, setOrderStats] = React.useState<OrderStats>({
    totalOrders: 0,
    completedTests: 0,
    pendingResults: 0
  });
  const [wasteStats, setWasteStats] = React.useState<WasteStats>({
    totalIntake: 0,
    totalQuantityKg: 0,
    thisMonthIntake: 0
  });
  const [sortedStats, setSortedStats] = React.useState<SortedStats>({
    totalSorted: 0,
    totalSortedQuantityKg: 0,
    thisMonthSorted: 0
  });

  React.useEffect(() => {
    const fetchUserData = async () => {
      if (!user?.id) return;
      
      try {
        const { data: userData, error } = await supabase
          .from('users')
          .select('status, role')
          .eq('id', user.id)
          .maybeSingle();

        if (error) throw error;
        setUserStatus(userData?.status || null);
        setUserRole(userData?.role || null);

        // Fetch business category if user is a customer
        if (userData?.role === 'customer') {
          const { data: profileData } = await supabase
            .from('customer_profiles')
            .select('business_categories(name)')
            .eq('user_id', user.id)
            .maybeSingle();

          if (profileData?.business_categories) {
            setBusinessCategory(profileData.business_categories.name);
          }
        }

        // Fetch order statistics if user is approved or is admin/technician
        if (userData?.status === 'approved' || userData?.role === 'admin' || userData?.role === 'technician') {
          await fetchOrderStats(userData.role);
        }

        // Fetch waste statistics if user is a recycler
        if (userData?.role === 'customer' && userData?.status === 'approved') {
          const { data: profileData } = await supabase
            .from('customer_profiles')
            .select('business_categories(name)')
            .eq('user_id', user.id)
            .maybeSingle();

          if (profileData?.business_categories?.name === 'Recycler') {
            await fetchWasteStats();
            await fetchSortedStats();
          }
        }
      } catch (err) {
        console.error('Error fetching user status:', err);
      } finally {
        setLoading(false);
      }
    };

    const fetchOrderStats = async (role: string) => {
      try {
        let query = supabase
          .from('orders')
          .select('status');

        // If user is a customer, only fetch their orders
        if (role === 'customer') {
          query = query.eq('customer_id', user?.id);
        }

        const { data: orders, error } = await query;

        if (error) throw error;

        const stats = {
          totalOrders: orders?.length || 0,
          completedTests: orders?.filter(order => order.status === 'completed' || order.status === 'results_approved').length || 0,
          pendingResults: orders?.filter(order => order.status === 'pending' || order.status === 'processing').length || 0
        };

        setOrderStats(stats);
      } catch (err) {
        console.error('Error fetching order statistics:', err);
      }
    };

    const fetchWasteStats = async () => {
      try {
        const { data: intakes, error } = await supabase
          .from('waste_plastic_intake')
          .select('quantity_kg, intake_date')
          .eq('created_by', user?.id);

        if (error) throw error;

        const now = new Date();
        const currentMonth = now.getMonth();
        const currentYear = now.getFullYear();

        const stats = {
          totalIntake: intakes?.length || 0,
          totalQuantityKg: intakes?.reduce((sum, intake) => sum + Number(intake.quantity_kg), 0) || 0,
          thisMonthIntake: intakes?.filter(intake => {
            const intakeDate = new Date(intake.intake_date);
            return intakeDate.getMonth() === currentMonth && intakeDate.getFullYear() === currentYear;
          }).length || 0
        };

        setWasteStats(stats);
      } catch (err) {
        console.error('Error fetching waste statistics:', err);
      }
    };

    const fetchSortedStats = async () => {
      try {
        const { data: intakes, error } = await supabase
          .from('sorted_plastic_intake')
          .select('quantity_kg, intake_date')
          .eq('created_by', user?.id);

        if (error) throw error;

        const now = new Date();
        const currentMonth = now.getMonth();
        const currentYear = now.getFullYear();

        const stats = {
          totalSorted: intakes?.length || 0,
          totalSortedQuantityKg: intakes?.reduce((sum, intake) => sum + Number(intake.quantity_kg), 0) || 0,
          thisMonthSorted: intakes?.filter(intake => {
            const intakeDate = new Date(intake.intake_date);
            return intakeDate.getMonth() === currentMonth && intakeDate.getFullYear() === currentYear;
          }).length || 0
        };

        setSortedStats(stats);
      } catch (err) {
        console.error('Error fetching sorted statistics:', err);
      }
    };

    fetchUserData();
  }, [user?.id]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900"></div>
      </div>
    );
  }

  if (userRole === 'customer' && userStatus === 'pending') {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="bg-yellow-50 border-l-4 border-yellow-400 p-4 rounded-md">
          <div className="flex items-center">
            <AlertCircle className="h-6 w-6 text-yellow-400 mr-3" />
            <div>
              <h3 className="text-lg font-medium text-yellow-800">Account Under Review</h3>
              <p className="text-yellow-700 mt-1">
                Your account is currently pending review. You'll have full access to the system once your account is approved.
              </p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900">
          {userRole ? `${userRole.charAt(0).toUpperCase() + userRole.slice(1)} Dashboard` : 'Dashboard'}
        </h1>
        <p className="mt-2 text-gray-600">
          Welcome back! Here's an overview of your {userRole === 'customer' ? 'orders' : 'system activity'}.
        </p>
      </div>
      
      {businessCategory === 'Recycler' && userStatus === 'approved' ? (
        <>
          <div className="mb-6">
            <h2 className="text-xl font-semibold text-gray-800 mb-4">Waste Plastic Intake</h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="bg-white rounded-lg shadow-md p-6 border-l-4 border-green-500">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-lg font-semibold text-gray-800 mb-2">Total Intake Records</h3>
                    <p className="text-3xl font-bold text-green-600">{wasteStats.totalIntake}</p>
                    <p className="text-sm text-gray-500 mt-1">Waste plastic batches received</p>
                  </div>
                  <Trash2 className="w-12 h-12 text-green-500" />
                </div>
              </div>

              <div className="bg-white rounded-lg shadow-md p-6 border-l-4 border-blue-500">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-lg font-semibold text-gray-800 mb-2">Total Quantity</h3>
                    <p className="text-3xl font-bold text-blue-600">{wasteStats.totalQuantityKg.toFixed(0)}</p>
                    <p className="text-sm text-gray-500 mt-1">Kilograms received</p>
                  </div>
                  <ClipboardList className="w-12 h-12 text-blue-500" />
                </div>
              </div>

              <div className="bg-white rounded-lg shadow-md p-6 border-l-4 border-yellow-500">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-lg font-semibold text-gray-800 mb-2">This Month</h3>
                    <p className="text-3xl font-bold text-yellow-600">{wasteStats.thisMonthIntake}</p>
                    <p className="text-sm text-gray-500 mt-1">Intake records this month</p>
                  </div>
                  <Clock className="w-12 h-12 text-yellow-500" />
                </div>
              </div>
            </div>
          </div>

          <div className="mb-12">
            <h2 className="text-xl font-semibold text-gray-800 mb-4">Sorted Plastic Intake</h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="bg-white rounded-lg shadow-md p-6 border-l-4 border-teal-500">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-lg font-semibold text-gray-800 mb-2">Total Sorted Records</h3>
                    <p className="text-3xl font-bold text-teal-600">{sortedStats.totalSorted}</p>
                    <p className="text-sm text-gray-500 mt-1">Sorted plastic batches processed</p>
                  </div>
                  <Send className="w-12 h-12 text-teal-500" />
                </div>
              </div>

              <div className="bg-white rounded-lg shadow-md p-6 border-l-4 border-cyan-500">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-lg font-semibold text-gray-800 mb-2">Total Quantity</h3>
                    <p className="text-3xl font-bold text-cyan-600">{sortedStats.totalSortedQuantityKg.toFixed(0)}</p>
                    <p className="text-sm text-gray-500 mt-1">Kilograms dispatched</p>
                  </div>
                  <CheckCircle className="w-12 h-12 text-cyan-500" />
                </div>
              </div>

              <div className="bg-white rounded-lg shadow-md p-6 border-l-4 border-orange-500">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-lg font-semibold text-gray-800 mb-2">This Month</h3>
                    <p className="text-3xl font-bold text-orange-600">{sortedStats.thisMonthSorted}</p>
                    <p className="text-sm text-gray-500 mt-1">Sorted records this month</p>
                  </div>
                  <Clock className="w-12 h-12 text-orange-500" />
                </div>
              </div>
            </div>
          </div>
        </>
      ) : (
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-12">
        <div className="bg-white rounded-lg shadow-md p-6 border-l-4 border-blue-500">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold text-gray-800 mb-2">
                {userRole === 'customer' ? 'My Orders' : 'Total Orders'}
              </h2>
              <p className="text-3xl font-bold text-blue-600">{orderStats.totalOrders}</p>
              <p className="text-sm text-gray-500 mt-1">
                {userRole === 'customer' ? 'Orders placed' : 'All orders in system'}
              </p>
            </div>
            <ClipboardList className="w-12 h-12 text-blue-500" />
          </div>
        </div>

        <div className="bg-white rounded-lg shadow-md p-6 border-l-4 border-green-500">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold text-gray-800 mb-2">Completed Tests</h2>
              <p className="text-3xl font-bold text-green-600">{orderStats.completedTests}</p>
              <p className="text-sm text-gray-500 mt-1">
                Orders with completed status
              </p>
            </div>
            <CheckCircle className="w-12 h-12 text-green-500" />
          </div>
        </div>

        <div className="bg-white rounded-lg shadow-md p-6 border-l-4 border-yellow-500">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold text-gray-800 mb-2">Pending Results</h2>
              <p className="text-3xl font-bold text-yellow-600">{orderStats.pendingResults}</p>
              <p className="text-sm text-gray-500 mt-1">
                Orders pending or in progress
              </p>
            </div>
            <Clock className="w-12 h-12 text-yellow-500" />
          </div>
        </div>
      </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <div className="bg-white rounded-lg shadow-md p-6">
          <h2 className="text-xl font-semibold text-gray-800 mb-4">Quick Actions</h2>
          <div className="space-y-3">
            {userRole === 'customer' && userStatus === 'approved' && businessCategory === 'Recycler' && (
              <>
                <a
                  href="/waste-management/intake"
                  className="block p-4 bg-green-50 rounded-lg hover:bg-green-100 transition-colors"
                >
                  <h3 className="font-medium text-green-900">Waste Plastic Intake</h3>
                  <p className="text-sm text-green-700">Record new waste plastic batch</p>
                </a>
                <a
                  href="/waste-management/dispatch"
                  className="block p-4 bg-blue-50 rounded-lg hover:bg-blue-100 transition-colors"
                >
                  <h3 className="font-medium text-blue-900">Sorted Plastic Intake</h3>
                  <p className="text-sm text-blue-700">Record incoming sorted plastic</p>
                </a>
              </>
            )}
            {userRole === 'customer' && userStatus === 'approved' && businessCategory !== 'Recycler' && (
              <a
                href="/orders"
                className="block p-4 bg-blue-50 rounded-lg hover:bg-blue-100 transition-colors"
              >
                <h3 className="font-medium text-blue-900">Place New Order</h3>
                <p className="text-sm text-blue-700">Submit samples for testing</p>
              </a>
            )}
            <a
              href="/orders"
              className="block p-4 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors"
            >
              <h3 className="font-medium text-gray-900">View All Orders</h3>
              <p className="text-sm text-gray-700">
                {userRole === 'customer' ? 'Check your order status and results' : 'Manage all orders in the system'}
              </p>
            </a>
            {userRole === 'finance' && (
              <a
                href="/finance-approval"
                className="block p-4 bg-green-50 rounded-lg hover:bg-green-100 transition-colors"
              >
                <h3 className="font-medium text-green-900">Finance Approval</h3>
                <p className="text-sm text-green-700">Review and approve pending orders</p>
              </a>
            )}
            {(userRole === 'admin' || userRole === 'technician') && (
              <a
                href="/orders"
                className="block p-4 bg-green-50 rounded-lg hover:bg-green-100 transition-colors"
              >
                <h3 className="font-medium text-green-900">Update Order Status</h3>
                <p className="text-sm text-green-700">Mark orders as processing or completed</p>
              </a>
            )}
            {userRole === 'manager' && (
              <a
                href="/orders"
                className="block p-4 bg-purple-50 rounded-lg hover:bg-purple-100 transition-colors"
              >
                <h3 className="font-medium text-purple-900">Approve Test Results</h3>
                <p className="text-sm text-purple-700">Review and approve individual test results</p>
              </a>
            )}
            {userRole === 'admin' && (
              <a
                href="/users"
                className="block p-4 bg-purple-50 rounded-lg hover:bg-purple-100 transition-colors"
              >
                <h3 className="font-medium text-purple-900">User Management</h3>
                <p className="text-sm text-purple-700">Approve new users and manage accounts</p>
              </a>
            )}
          </div>
        </div>

        <div className="bg-white rounded-lg shadow-md p-6">
          <h2 className="text-xl font-semibold text-gray-800 mb-4">System Status</h2>
          <div className="space-y-4">
            <div className="flex items-center justify-between p-3 bg-green-50 rounded-lg">
              <div className="flex items-center">
                <div className="w-3 h-3 bg-green-500 rounded-full mr-3"></div>
                <span className="text-green-800 font-medium">Laboratory System</span>
              </div>
              <span className="text-green-600 text-sm">Online</span>
            </div>
            <div className="flex items-center justify-between p-3 bg-green-50 rounded-lg">
              <div className="flex items-center">
                <div className="w-3 h-3 bg-green-500 rounded-full mr-3"></div>
                <span className="text-green-800 font-medium">Document Storage</span>
              </div>
              <span className="text-green-600 text-sm">Available</span>
            </div>
            <div className="flex items-center justify-between p-3 bg-blue-50 rounded-lg">
              <div className="flex items-center">
                <div className="w-3 h-3 bg-blue-500 rounded-full mr-3"></div>
                <span className="text-blue-800 font-medium">Test Processing</span>
              </div>
              <span className="text-blue-600 text-sm">Active</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}