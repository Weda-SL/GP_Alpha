import React, { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { UserCheck, UserX, CheckCircle, XCircle, AlertCircle, ShieldAlert } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { logAuditEvent } from '../utils/auditLogger';

interface User {
  id: string;
  full_name: string;
  role: string;
  status: string;
  is_active: boolean;
  created_at: string;
  approved_at: string | null;
  customer_profile?: {
    id: string;
    business_name: string;
    contact_person: string;
    phone: string;
    address: string;
    business_category_id: string | null;
    recycler_grade_id: string | null;
    business_category: {
      name: string;
    } | null;
    recycler_grade: {
      grade: string;
    } | null;
    customer_documents?: {
      id: string;
      file_name: string;
      file_path: string;
      document_type: {
        name: string;
      };
    }[];
  };
}

interface UserStats {
  active: number;
  pending: number;
  disabled: number;
}

interface BusinessCategory {
  id: string;
  name: string;
}

interface RecyclerGrade {
  id: string;
  grade: string;
}

export function UserManagement() {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [stats, setStats] = useState<UserStats>({ active: 0, pending: 0, disabled: 0 });
  const [selectedStatus, setSelectedStatus] = useState<string | null>(null);
  const [selectedUser, setSelectedUser] = useState<string | null>(null);
  const [userRole, setUserRole] = useState<string | null>(null);
  const [categories, setCategories] = useState<BusinessCategory[]>([]);
  const [recyclerGrades, setRecyclerGrades] = useState<RecyclerGrade[]>([]);
  const navigate = useNavigate();

  useEffect(() => {
    const checkUserRole = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) { navigate('/login'); return; }

        const { data, error } = await supabase
          .from('users')
          .select('role')
          .eq('id', user.id)
          .single();

        if (error) throw error;
        setUserRole(data.role);

        if (data.role !== 'admin') { navigate('/'); }
      } catch (err) {
        console.error('Error checking user role:', err);
        navigate('/login');
      }
    };

    checkUserRole();
  }, [navigate]);

  useEffect(() => {
    if (userRole === 'admin') {
      fetchUsers();
      fetchLookups();
    }
  }, [selectedStatus, userRole]);

  const fetchLookups = async () => {
    const [{ data: cats }, { data: grades }] = await Promise.all([
      supabase.from('business_categories').select('id, name').order('name'),
      supabase.from('recycler_grades').select('id, grade').order('grade'),
    ]);
    setCategories(cats || []);
    setRecyclerGrades(grades || []);
  };

  const fetchUsers = async () => {
    try {
      let query = supabase
        .from('users')
        .select(`
          id,
          full_name,
          role,
          status,
          is_active,
          created_at,
          approved_at,
          customer_profile:customer_profiles(
            id,
            business_name,
            contact_person,
            phone,
            address,
            business_category_id,
            recycler_grade_id,
            business_category:business_categories(name),
            recycler_grade:recycler_grades(grade),
            customer_documents(
              id,
              file_name,
              file_path,
              document_type:required_documents(name)
            )
          )
        `)
        .order('created_at', { ascending: false });

      if (selectedStatus) {
        if (selectedStatus === 'active') {
          query = query.eq('is_active', true).eq('status', 'approved');
        } else if (selectedStatus === 'disabled') {
          query = query.eq('is_active', false).eq('status', 'approved');
        } else {
          query = query.eq('status', selectedStatus);
        }
      }

      const { data, error: fetchError } = await query;
      if (fetchError) throw fetchError;
      setUsers(data || []);

      const newStats = {
        active: (data || []).filter(u => u.is_active && u.status === 'approved').length,
        pending: (data || []).filter(u => u.status === 'pending').length,
        disabled: (data || []).filter(u => !u.is_active && u.status === 'approved').length,
      };
      setStats(newStats);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch users');
    } finally {
      setLoading(false);
    }
  };

  const handleApprove = async (userId: string) => {
    try {
      const currentUser = (await supabase.auth.getUser()).data.user;
      const { error } = await supabase
        .from('users')
        .update({
          status: 'approved',
          is_active: true,
          approved_at: new Date().toISOString(),
          approved_by: currentUser?.id,
        })
        .eq('id', userId);

      if (error) throw error;
      await logAuditEvent('USER_APPROVED', 'users', userId, { approved_by: currentUser?.id });
      fetchUsers();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to approve user');
    }
  };

  const handleReject = async (userId: string) => {
    try {
      const { error } = await supabase
        .from('users')
        .update({ status: 'rejected', is_active: false })
        .eq('id', userId);

      if (error) throw error;
      await logAuditEvent('USER_REJECTED', 'users', userId);
      fetchUsers();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to reject user');
    }
  };

  const handleRoleChange = async (userId: string, newRole: string) => {
    try {
      const user = users.find(u => u.id === userId);
      const oldRole = user?.role;

      const { error } = await supabase
        .from('users')
        .update({ role: newRole })
        .eq('id', userId);

      if (error) throw error;
      await logAuditEvent('USER_ROLE_CHANGED', 'users', userId, { old_role: oldRole, new_role: newRole });
      fetchUsers();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update user role');
    }
  };

  const toggleUserStatus = async (userId: string, currentStatus: boolean) => {
    try {
      const action = currentStatus ? 'USER_DISABLED' : 'USER_ENABLED';
      const { error } = await supabase
        .from('users')
        .update({ is_active: !currentStatus })
        .eq('id', userId);

      if (error) throw error;
      await logAuditEvent(action, 'users', userId);
      fetchUsers();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update user status');
    }
  };

  const handleCategoryChange = async (profileId: string, newCategoryId: string, userId: string) => {
    try {
      const user = users.find(u => u.id === userId);
      const oldCategoryId = user?.customer_profile?.business_category_id;

      const { error } = await supabase
        .from('customer_profiles')
        .update({
          business_category_id: newCategoryId || null,
          recycler_grade_id: null, // clear grade when category changes
        })
        .eq('id', profileId);

      if (error) throw error;
      await logAuditEvent('ADMIN_UPDATE_PROFILE_CATEGORY', 'customer_profiles', profileId, {
        old_category_id: oldCategoryId,
        new_category_id: newCategoryId,
        user_id: userId,
      });
      fetchUsers();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update business category');
    }
  };

  const handleRecyclerGradeChange = async (profileId: string, newGradeId: string, userId: string) => {
    try {
      const user = users.find(u => u.id === userId);
      const oldGradeId = user?.customer_profile?.recycler_grade_id;

      const { error } = await supabase
        .from('customer_profiles')
        .update({ recycler_grade_id: newGradeId || null })
        .eq('id', profileId);

      if (error) throw error;
      await logAuditEvent('ADMIN_UPDATE_RECYCLER_GRADE', 'customer_profiles', profileId, {
        old_grade_id: oldGradeId,
        new_grade_id: newGradeId,
        user_id: userId,
      });
      fetchUsers();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update recycler grade');
    }
  };

  const downloadDocument = async (filePath: string, fileName: string) => {
    try {
      const { data, error } = await supabase.storage
        .from('customer-documents')
        .download(filePath);

      if (error) throw error;

      const url = URL.createObjectURL(data);
      const a = document.createElement('a');
      a.href = url;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to download document');
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
      <h1 className="text-2xl font-bold text-gray-900 mb-8">User Management</h1>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded mb-6">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        <div
          onClick={() => setSelectedStatus('active')}
          className={`cursor-pointer p-6 bg-white rounded-lg shadow hover:shadow-md transition-shadow ${
            selectedStatus === 'active' ? 'ring-2 ring-blue-500' : ''
          }`}
        >
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500">Active Users</p>
              <p className="text-2xl font-bold text-gray-900">{stats.active}</p>
            </div>
            <UserCheck className="w-8 h-8 text-green-500" />
          </div>
        </div>

        <div
          onClick={() => setSelectedStatus('pending')}
          className={`cursor-pointer p-6 bg-white rounded-lg shadow hover:shadow-md transition-shadow ${
            selectedStatus === 'pending' ? 'ring-2 ring-blue-500' : ''
          }`}
        >
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500">Pending Review</p>
              <p className="text-2xl font-bold text-gray-900">{stats.pending}</p>
            </div>
            <AlertCircle className="w-8 h-8 text-yellow-500" />
          </div>
        </div>

        <div
          onClick={() => setSelectedStatus('disabled')}
          className={`cursor-pointer p-6 bg-white rounded-lg shadow hover:shadow-md transition-shadow ${
            selectedStatus === 'disabled' ? 'ring-2 ring-blue-500' : ''
          }`}
        >
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500">Disabled Users</p>
              <p className="text-2xl font-bold text-gray-900">{stats.disabled}</p>
            </div>
            <UserX className="w-8 h-8 text-red-500" />
          </div>
        </div>
      </div>

      <div className="bg-white shadow-md rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  User
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Role
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Business
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Status
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Documents
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {users.map((user) => {
                const profile = user.customer_profile;
                const profileCategoryName = profile?.business_category?.name ?? '';
                const isRecycler = profileCategoryName === 'Recycler';

                return (
                  <React.Fragment key={user.id}>
                    <tr
                      className={`hover:bg-gray-50 cursor-pointer ${
                        selectedUser === user.id ? 'bg-blue-50' : ''
                      }`}
                      onClick={() => setSelectedUser(user.id === selectedUser ? null : user.id)}
                    >
                      <td className="px-6 py-4">
                        <div>
                          <div className="text-sm font-medium text-gray-900">{user.full_name}</div>
                          <div className="text-sm text-gray-500">{user.id}</div>
                        </div>
                      </td>
                      <td className="px-6 py-4" onClick={(e) => e.stopPropagation()}>
                        <div>
                          <div className="text-sm text-gray-900 mb-2">
                            Current: <span className="font-medium capitalize">{user.role}</span>
                          </div>
                          {userRole === 'admin' && (
                            <select
                              value={user.role}
                              onChange={(e) => handleRoleChange(user.id, e.target.value)}
                              className="text-sm border border-gray-300 rounded px-2 py-1 focus:outline-none focus:ring-2 focus:ring-blue-500"
                            >
                              <option value="customer">Customer</option>
                              <option value="technician">Technician</option>
                              <option value="manager">Manager</option>
                              <option value="finance">Finance</option>
                              <option value="admin">Admin</option>
                            </select>
                          )}
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        {profile ? (
                          <div>
                            <div className="text-sm font-medium text-gray-900">
                              {profile.business_name}
                            </div>
                            <div className="text-sm text-gray-500">
                              {profileCategoryName || 'No category'}
                            </div>
                            {isRecycler && profile.recycler_grade && (
                              <div className="text-xs text-blue-600 font-medium mt-0.5">
                                {profile.recycler_grade.grade}
                              </div>
                            )}
                          </div>
                        ) : (
                          <span className="text-sm text-gray-500">No profile</span>
                        )}
                      </td>
                      <td className="px-6 py-4">
                        <span
                          className={`px-2 py-1 text-xs rounded-full ${
                            user.status === 'approved'
                              ? user.is_active
                                ? 'bg-green-100 text-green-800'
                                : 'bg-red-100 text-red-800'
                              : user.status === 'pending'
                              ? 'bg-yellow-100 text-yellow-800'
                              : 'bg-gray-100 text-gray-800'
                          }`}
                        >
                          {user.status === 'approved'
                            ? user.is_active ? 'Active' : 'Disabled'
                            : user.status.charAt(0).toUpperCase() + user.status.slice(1)}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        {profile?.customer_documents && profile.customer_documents.length > 0 ? (
                          <div className="space-y-1">
                            {profile.customer_documents.slice(0, 2).map((doc) => (
                              <button
                                key={doc.id}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  downloadDocument(doc.file_path, doc.file_name);
                                }}
                                className="block text-sm text-blue-600 hover:text-blue-800 truncate max-w-32"
                              >
                                {doc.document_type.name}
                              </button>
                            ))}
                            {profile.customer_documents.length > 2 && (
                              <span className="text-xs text-gray-500">
                                +{profile.customer_documents.length - 2} more
                              </span>
                            )}
                          </div>
                        ) : (
                          <span className="text-sm text-gray-500">No documents</span>
                        )}
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex justify-end space-x-2">
                          {user.status === 'pending' ? (
                            <>
                              <button
                                onClick={(e) => { e.stopPropagation(); handleApprove(user.id); }}
                                className="text-green-600 hover:text-green-800"
                                title="Approve"
                              >
                                <CheckCircle className="w-5 h-5" />
                              </button>
                              <button
                                onClick={(e) => { e.stopPropagation(); handleReject(user.id); }}
                                className="text-red-600 hover:text-red-800"
                                title="Reject"
                              >
                                <XCircle className="w-5 h-5" />
                              </button>
                            </>
                          ) : user.status === 'approved' ? (
                            <button
                              onClick={(e) => { e.stopPropagation(); toggleUserStatus(user.id, user.is_active); }}
                              className={user.is_active ? 'text-red-600 hover:text-red-800' : 'text-green-600 hover:text-green-800'}
                              title={user.is_active ? 'Disable' : 'Enable'}
                            >
                              {user.is_active ? <UserX className="w-5 h-5" /> : <UserCheck className="w-5 h-5" />}
                            </button>
                          ) : null}
                        </div>
                      </td>
                    </tr>

                    {/* Expanded Profile Details */}
                    {selectedUser === user.id && profile && (
                      <tr className="bg-gray-50">
                        <td colSpan={6} className="px-6 py-4">
                          <div className="bg-white rounded-lg p-4 shadow-sm">
                            <h4 className="text-lg font-semibold text-gray-900 mb-4">User Profile Details</h4>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                              {/* Business Information */}
                              <div>
                                <h5 className="text-sm font-medium text-gray-700 mb-3">Business Information</h5>
                                <div className="space-y-3">
                                  <div>
                                    <span className="text-sm text-gray-500">Business Name:</span>
                                    <p className="text-sm font-medium text-gray-900">{profile.business_name}</p>
                                  </div>

                                  {/* Admin-editable Business Category */}
                                  <div onClick={(e) => e.stopPropagation()}>
                                    <label className="text-sm text-gray-500 block mb-1">Business Category:</label>
                                    <select
                                      value={profile.business_category_id || ''}
                                      onChange={(e) => handleCategoryChange(profile.id, e.target.value, user.id)}
                                      className="text-sm border border-gray-300 rounded px-2 py-1 w-full focus:outline-none focus:ring-2 focus:ring-blue-500"
                                    >
                                      <option value="">No category</option>
                                      {categories.map((cat) => (
                                        <option key={cat.id} value={cat.id}>{cat.name}</option>
                                      ))}
                                    </select>
                                  </div>

                                  {/* Admin-editable Recycler Grade (only when category is Recycler) */}
                                  {isRecycler && (
                                    <div onClick={(e) => e.stopPropagation()}>
                                      <label className="text-sm text-gray-500 block mb-1">Recycler Grade:</label>
                                      <select
                                        value={profile.recycler_grade_id || ''}
                                        onChange={(e) => handleRecyclerGradeChange(profile.id, e.target.value, user.id)}
                                        className="text-sm border border-gray-300 rounded px-2 py-1 w-full focus:outline-none focus:ring-2 focus:ring-blue-500"
                                      >
                                        <option value="">No grade assigned</option>
                                        {recyclerGrades.map((g) => (
                                          <option key={g.id} value={g.id}>{g.grade}</option>
                                        ))}
                                      </select>
                                    </div>
                                  )}

                                  <div>
                                    <span className="text-sm text-gray-500">Contact Person:</span>
                                    <p className="text-sm font-medium text-gray-900">{profile.contact_person}</p>
                                  </div>
                                  <div>
                                    <span className="text-sm text-gray-500">Phone:</span>
                                    <p className="text-sm font-medium text-gray-900">
                                      {profile.phone || 'Not provided'}
                                    </p>
                                  </div>
                                  <div>
                                    <span className="text-sm text-gray-500">Address:</span>
                                    <p className="text-sm font-medium text-gray-900">
                                      {profile.address || 'Not provided'}
                                    </p>
                                  </div>
                                </div>
                              </div>

                              {/* Documents */}
                              <div>
                                <h5 className="text-sm font-medium text-gray-700 mb-3">Uploaded Documents</h5>
                                {profile.customer_documents && profile.customer_documents.length > 0 ? (
                                  <div className="space-y-2">
                                    {profile.customer_documents.map((doc) => (
                                      <div key={doc.id} className="flex items-center justify-between p-2 bg-gray-50 rounded">
                                        <div>
                                          <p className="text-sm font-medium text-gray-900">{doc.document_type.name}</p>
                                          <p className="text-xs text-gray-500">{doc.file_name}</p>
                                        </div>
                                        <button
                                          onClick={() => downloadDocument(doc.file_path, doc.file_name)}
                                          className="text-blue-600 hover:text-blue-800 text-sm font-medium"
                                        >
                                          Download
                                        </button>
                                      </div>
                                    ))}
                                  </div>
                                ) : (
                                  <p className="text-sm text-gray-500 italic">No documents uploaded</p>
                                )}
                              </div>
                            </div>

                            {/* Account Information */}
                            <div className="mt-6 pt-4 border-t border-gray-200">
                              <h5 className="text-sm font-medium text-gray-700 mb-3">Account Information</h5>
                              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                <div>
                                  <span className="text-sm text-gray-500">User ID:</span>
                                  <p className="text-xs font-mono text-gray-900 break-all">{user.id}</p>
                                </div>
                                <div>
                                  <span className="text-sm text-gray-500">Created:</span>
                                  <p className="text-sm text-gray-900">{new Date(user.created_at).toLocaleDateString()}</p>
                                </div>
                                {user.approved_at && (
                                  <div>
                                    <span className="text-sm text-gray-500">Approved:</span>
                                    <p className="text-sm text-gray-900">{new Date(user.approved_at).toLocaleDateString()}</p>
                                  </div>
                                )}
                              </div>
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
