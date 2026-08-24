import React from 'react';
import { useAuth } from '../hooks/useAuth';
import { supabase } from '../lib/supabase';
import { AlertCircle, Plus, Pencil, Trash2, ArrowLeft, Eye, X } from 'lucide-react';
import { Link } from 'react-router-dom';

interface PlasticType {
  id: string;
  number: string;
  name: string;
  description: string | null;
}

interface WasteIntake {
  id: string;
  intake_batch_reference: string;
  intake_date: string;
  supplier: string;
  quantity_kg: number;
  source: string;
  plastic_type_names: string[];
  condition: string;
  pic: string;
  remarks: string;
  created_at: string;
  no_scheduled_waste: boolean;
  inspector_name: string;
}

export function WasteIntake() {
  const { user } = useAuth();
  const [intakes, setIntakes] = React.useState<WasteIntake[]>([]);
  const [plasticTypes, setPlasticTypes] = React.useState<PlasticType[]>([]);
  const [referencedBatches, setReferencedBatches] = React.useState<Set<string>>(new Set());
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [showForm, setShowForm] = React.useState(false);
  const [editingIntake, setEditingIntake] = React.useState<WasteIntake | null>(null);
  const [viewingIntake, setViewingIntake] = React.useState<WasteIntake | null>(null);
  const [deletingIntakeId, setDeletingIntakeId] = React.useState<string | null>(null);
  const [businessCode, setBusinessCode] = React.useState<string>('');
  const [customerId, setCustomerId] = React.useState<string>('');

  const [formData, setFormData] = React.useState({
    intake_date: new Date().toISOString().split('T')[0],
    supplier: '',
    quantity_kg: '',
    source: 'Pre-consumer',
    plastic_type_names: [] as string[],
    condition: 'Pre-sorted',
    pic: '',
    remarks: '',
    no_scheduled_waste: false,
    inspector_name: ''
  });

  React.useEffect(() => {
    fetchUserProfile();
    fetchPlasticTypes();
    fetchIntakes();
    fetchReferencedBatches();
  }, [user?.id]);

  const fetchUserProfile = async () => {
    if (!user?.id) return;

    try {
      const { data, error } = await supabase
        .from('customer_profiles')
        .select('id, business_code')
        .eq('user_id', user.id)
        .maybeSingle();

      if (error) throw error;

      if (data) {
        setBusinessCode(data.business_code || '');
        setCustomerId(data.id);
      }
    } catch (err) {
      console.error('Error fetching user profile:', err);
    }
  };

  const fetchPlasticTypes = async () => {
    try {
      const { data, error } = await supabase
        .from('plastic_types')
        .select('*')
        .order('number', { ascending: true });

      if (error) throw error;
      setPlasticTypes(data || []);
    } catch (err) {
      console.error('Error fetching plastic types:', err);
    }
  };

  const fetchReferencedBatches = async () => {
    if (!user?.id) return;

    try {
      const batches = new Set<string>();

      const { data: orderData, error: orderError } = await supabase
        .from('orders')
        .select('batch_number')
        .eq('customer_id', user.id)
        .not('batch_number', 'is', null);

      if (orderError) throw orderError;

      orderData?.forEach(order => {
        if (order.batch_number) {
          batches.add(order.batch_number);
        }
      });

      const { data: wasteIntakes, error: wasteError } = await supabase
        .from('waste_plastic_intake')
        .select('id, intake_batch_reference')
        .eq('created_by', user.id);

      if (wasteError) throw wasteError;

      if (wasteIntakes && wasteIntakes.length > 0) {
        const wasteIntakeIds = wasteIntakes.map(w => w.id);

        const { data: allocData, error: allocError } = await supabase
          .from('sorted_plastic_intake_allocations')
          .select('waste_intake_batch_id, waste_intake_batch_reference')
          .in('waste_intake_batch_id', wasteIntakeIds);

        if (allocError) throw allocError;

        allocData?.forEach(alloc => {
          if (alloc.waste_intake_batch_reference) {
            batches.add(alloc.waste_intake_batch_reference);
          }
        });
      }

      setReferencedBatches(batches);
    } catch (err) {
      console.error('Error fetching referenced batches:', err);
    }
  };

  const fetchIntakes = async () => {
    if (!user?.id) return;

    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('waste_plastic_intake')
        .select('*')
        .eq('created_by', user.id)
        .order('intake_date', { ascending: false });

      if (error) throw error;
      setIntakes(data || []);
    } catch (err) {
      console.error('Error fetching intakes:', err);
      setError('Failed to load intake records');
    } finally {
      setLoading(false);
    }
  };

  const generateBatchReference = async () => {
    const today = new Date();
    const yymmdd = today.toISOString().slice(2, 10).replace(/-/g, '');
    const datePrefix = `${businessCode}${yymmdd}`;

    const { data, error } = await supabase
      .from('waste_plastic_intake')
      .select('intake_batch_reference')
      .like('intake_batch_reference', `${datePrefix}%`)
      .order('intake_batch_reference', { ascending: false })
      .limit(1);

    if (error) {
      console.error('Error generating batch reference:', error);
      return `${datePrefix}001`;
    }

    if (data && data.length > 0) {
      const lastRef = data[0].intake_batch_reference;
      const lastNumber = parseInt(lastRef.slice(-3), 10);
      const nextNumber = (lastNumber + 1).toString().padStart(3, '0');
      return `${datePrefix}${nextNumber}`;
    }

    return `${datePrefix}001`;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!user?.id || !customerId) {
      setError('User profile not loaded');
      return;
    }

    try {
      if (editingIntake) {
        // Update existing intake
        const { error: updateError } = await supabase
          .from('waste_plastic_intake')
          .update({
            intake_date: formData.intake_date,
            supplier: formData.supplier,
            quantity_kg: parseFloat(formData.quantity_kg),
            source: formData.source,
            plastic_type_names: formData.plastic_type_names,
            condition: formData.condition,
            pic: formData.pic,
            remarks: formData.remarks,
            no_scheduled_waste: formData.no_scheduled_waste,
            inspector_name: formData.inspector_name
          })
          .eq('id', editingIntake.id);

        if (updateError) throw updateError;
      } else {
        // Create new intake
        const batchReference = await generateBatchReference();

      const { error: insertError } = await supabase
        .from('waste_plastic_intake')
        .insert([{
          intake_batch_reference: batchReference,
          intake_date: formData.intake_date,
          supplier: formData.supplier,
          quantity_kg: parseFloat(formData.quantity_kg),
          source: formData.source,
          plastic_type_names: formData.plastic_type_names,
          condition: formData.condition,
          pic: formData.pic,
          remarks: formData.remarks,
          no_scheduled_waste: formData.no_scheduled_waste,
          inspector_name: formData.inspector_name,
          customer_id: customerId,
          created_by: user.id
        }]);

        if (insertError) throw insertError;
      }

      setFormData({
        intake_date: new Date().toISOString().split('T')[0],
        supplier: '',
        quantity_kg: '',
        source: 'Pre-consumer',
        plastic_type_names: [],
        condition: 'Pre-sorted',
        pic: '',
        remarks: '',
        no_scheduled_waste: false,
        inspector_name: ''
      });
      setEditingIntake(null);
      setShowForm(false);
      fetchIntakes();
      fetchReferencedBatches();
    } catch (err: any) {
      console.error('Error creating intake:', err);
      setError(err.message || 'Failed to create intake record');
    }
  };

  const handleEdit = (intake: WasteIntake) => {
    setEditingIntake(intake);
    setFormData({
      intake_date: intake.intake_date,
      supplier: intake.supplier,
      quantity_kg: intake.quantity_kg.toString(),
      source: intake.source,
      plastic_type_names: intake.plastic_type_names,
      condition: intake.condition,
      pic: intake.pic,
      remarks: intake.remarks,
      no_scheduled_waste: false,
      inspector_name: ''
    });
    setShowForm(true);
  };

  const handleCancelEdit = () => {
    setEditingIntake(null);
    setFormData({
      intake_date: new Date().toISOString().split('T')[0],
      supplier: '',
      quantity_kg: '',
      source: 'Pre-consumer',
      plastic_type_names: [],
      condition: 'Pre-sorted',
      pic: '',
      remarks: '',
      no_scheduled_waste: false,
      inspector_name: ''
    });
    setShowForm(false);
  };

  const handleDelete = async () => {
    if (!deletingIntakeId) return;

    try {
      const { error } = await supabase
        .from('waste_plastic_intake')
        .delete()
        .eq('id', deletingIntakeId);

      if (error) throw error;
      setDeletingIntakeId(null);
      fetchIntakes();
      fetchReferencedBatches();
    } catch (err: any) {
      console.error('Error deleting intake:', err);
      setError(err.message || 'Failed to delete intake record');
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
      <div className="mb-8 flex items-center justify-between">
        <div className="flex items-center">
          <Link
            to="/waste-management"
            className="mr-4 text-gray-500 hover:text-gray-700"
          >
            <ArrowLeft className="h-6 w-6" />
          </Link>
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Waste Plastic Intake</h1>
            <p className="mt-2 text-gray-600">
              Record incoming waste plastic from suppliers.
            </p>
          </div>
        </div>
        {!showForm && (
          <button
            onClick={() => {
              setEditingIntake(null);
              setShowForm(true);
            }}
            className="inline-flex items-center px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700"
          >
            <Plus className="h-4 w-4 mr-2" />
            New Intake
          </button>
        )}
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
        {intakes.length === 0 ? (
          <div className="p-6 text-center text-gray-500">
            No intake records found. Click "New Intake" to create your first record.
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
                    Date
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Supplier
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Quantity (Kg)
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Type
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Source
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {intakes.map((intake) => (
                  <tr key={intake.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                      {intake.intake_batch_reference}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {new Date(intake.intake_date).toLocaleDateString()}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {intake.supplier}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {intake.quantity_kg}
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-500">
                      <div className="flex flex-wrap gap-1">
                        {intake.plastic_type_names.map((type, idx) => (
                          <span key={idx} className="px-2 py-1 bg-indigo-100 text-indigo-800 rounded text-xs">
                            {type}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      <span className={`px-2 py-1 rounded-full text-xs ${
                        intake.source === 'Pre-consumer'
                          ? 'bg-blue-100 text-blue-800'
                          : 'bg-green-100 text-green-800'
                      }`}>
                        {intake.source}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      <div className="flex items-center space-x-3">
                        <button
                          onClick={() => setViewingIntake(intake)}
                          className="text-gray-600 hover:text-gray-900"
                          title="View"
                        >
                          <Eye className="h-4 w-4" />
                        </button>
                        {!referencedBatches.has(intake.intake_batch_reference) && (
                          <>
                            <button
                              onClick={() => handleEdit(intake)}
                              className="text-blue-600 hover:text-blue-900"
                              title="Edit"
                            >
                              <Pencil className="h-4 w-4" />
                            </button>
                            <button
                              onClick={() => setDeletingIntakeId(intake.id)}
                              className="text-red-600 hover:text-red-900"
                              title="Delete"
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

      {showForm && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4" onClick={(e) => {
          if (e.target === e.currentTarget) {
            handleCancelEdit();
          }
        }}>
          <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 flex justify-between items-center">
              <h2 className="text-xl font-semibold text-gray-900">
                {editingIntake ? 'Edit Waste Plastic Intake' : 'New Waste Plastic Intake'}
              </h2>
              <button
                onClick={handleCancelEdit}
                className="text-gray-500 hover:text-gray-700"
              >
                <X className="h-6 w-6" />
              </button>
            </div>

            <form onSubmit={handleSubmit}>
              <div className="px-6 py-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Date *
                    </label>
                    <input
                      type="date"
                      required
                      value={formData.intake_date}
                      onChange={(e) => setFormData({ ...formData, intake_date: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Supplier *
                    </label>
                    <input
                      type="text"
                      required
                      value={formData.supplier}
                      onChange={(e) => setFormData({ ...formData, supplier: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                      placeholder="Enter supplier name"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Quantity (Kgs) *
                    </label>
                    <input
                      type="number"
                      required
                      min="0.01"
                      step="0.01"
                      value={formData.quantity_kg}
                      onChange={(e) => setFormData({ ...formData, quantity_kg: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                      placeholder="Enter quantity in kilograms"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Source *
                    </label>
                    <select
                      required
                      value={formData.source}
                      onChange={(e) => setFormData({ ...formData, source: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      <option value="Pre-consumer">Pre-consumer</option>
                      <option value="Post-consumer">Post-consumer</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Plastic Types * (Select one or more)
                    </label>
                    <div className="border border-gray-300 rounded-md p-3 max-h-40 overflow-y-auto">
                      {plasticTypes.length === 0 ? (
                        <p className="text-sm text-gray-500">Loading plastic types...</p>
                      ) : (
                        plasticTypes.map((type) => (
                          <label key={type.id} className="flex items-center mb-2 cursor-pointer hover:bg-gray-50 p-1 rounded">
                            <input
                              type="checkbox"
                              checked={formData.plastic_type_names.includes(type.name)}
                              onChange={(e) => {
                                const newTypes = e.target.checked
                                  ? [...formData.plastic_type_names, type.name]
                                  : formData.plastic_type_names.filter(t => t !== type.name);
                                setFormData({ ...formData, plastic_type_names: newTypes });
                              }}
                              className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                            />
                            <span className="ml-2 text-sm text-gray-900">
                              {type.number} - {type.name}
                            </span>
                          </label>
                        ))
                      )}
                    </div>
                    {formData.plastic_type_names.length === 0 && (
                      <p className="mt-1 text-sm text-red-600">Please select at least one plastic type</p>
                    )}
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Condition *
                    </label>
                    <select
                      required
                      value={formData.condition}
                      onChange={(e) => setFormData({ ...formData, condition: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      <option value="Pre-sorted">Pre-sorted</option>
                      <option value="Cleaned">Cleaned</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Operator *
                    </label>
                    <input
                      type="text"
                      required
                      value={formData.pic}
                      onChange={(e) => setFormData({ ...formData, pic: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                      placeholder="Enter operator name"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Supervisor *
                    </label>
                    <input
                      type="text"
                      required
                      value={formData.inspector_name}
                      onChange={(e) => setFormData({ ...formData, inspector_name: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                      placeholder="Enter supervisor name"
                    />
                  </div>

                  <div className="md:col-span-2">
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Remarks
                    </label>
                    <textarea
                      value={formData.remarks}
                      onChange={(e) => setFormData({ ...formData, remarks: e.target.value })}
                      rows={3}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                      placeholder="Additional notes or comments"
                    />
                  </div>

                  <div className="md:col-span-2">
                    <label className="flex items-center cursor-pointer">
                      <input
                        type="checkbox"
                        required
                        checked={formData.no_scheduled_waste}
                        onChange={(e) => setFormData({ ...formData, no_scheduled_waste: e.target.checked })}
                        className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                      />
                      <span className="ml-2 text-sm text-gray-900">
                        No scheduled waste included in the intake *
                      </span>
                    </label>
                  </div>
                </div>
              </div>

              <div className="sticky bottom-0 bg-gray-50 px-6 py-4 flex justify-end space-x-4 border-t border-gray-200">
                <button
                  type="button"
                  onClick={handleCancelEdit}
                  className="px-4 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={
                    !formData.intake_date ||
                    !formData.supplier.trim() ||
                    !formData.quantity_kg ||
                    formData.plastic_type_names.length === 0 ||
                    !formData.pic.trim() ||
                    !formData.inspector_name.trim() ||
                    !formData.no_scheduled_waste
                  }
                  className="px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed"
                >
                  {editingIntake ? 'Update Intake Record' : 'Create Intake Record'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {deletingIntakeId && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Confirm Delete</h3>
            <p className="text-gray-700 mb-6">Are you sure you want to delete this intake record? This action cannot be undone.</p>
            <div className="flex justify-end space-x-3">
              <button
                onClick={() => setDeletingIntakeId(null)}
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

      {viewingIntake && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4" onClick={(e) => {
          if (e.target === e.currentTarget) {
            setViewingIntake(null);
          }
        }}>
          <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 flex justify-between items-center">
              <h2 className="text-xl font-semibold text-gray-900">Waste Plastic Intake Details</h2>
              <button
                onClick={() => setViewingIntake(null)}
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
                    {viewingIntake.intake_batch_reference}
                  </p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-500 mb-1">
                    Intake Date
                  </label>
                  <p className="text-base text-gray-900">
                    {new Date(viewingIntake.intake_date).toLocaleDateString()}
                  </p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-500 mb-1">
                    Supplier
                  </label>
                  <p className="text-base text-gray-900">
                    {viewingIntake.supplier}
                  </p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-500 mb-1">
                    Quantity
                  </label>
                  <p className="text-base text-gray-900">
                    {viewingIntake.quantity_kg} kg
                  </p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-500 mb-1">
                    Source
                  </label>
                  <p className="text-base text-gray-900">
                    <span className={`px-2 py-1 rounded-full text-xs ${
                      viewingIntake.source === 'Pre-consumer'
                        ? 'bg-blue-100 text-blue-800'
                        : 'bg-green-100 text-green-800'
                    }`}>
                      {viewingIntake.source}
                    </span>
                  </p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-500 mb-1">
                    Condition
                  </label>
                  <p className="text-base text-gray-900">
                    {viewingIntake.condition}
                  </p>
                </div>

                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-gray-500 mb-1">
                    Plastic Types
                  </label>
                  <div className="flex flex-wrap gap-2 mt-2">
                    {viewingIntake.plastic_type_names.map((type, idx) => (
                      <span key={idx} className="px-3 py-1 bg-indigo-100 text-indigo-800 rounded-md text-sm">
                        {type}
                      </span>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-500 mb-1">
                    Operator
                  </label>
                  <p className="text-base text-gray-900">
                    {viewingIntake.pic}
                  </p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-500 mb-1">
                    Supervisor
                  </label>
                  <p className="text-base text-gray-900">
                    {viewingIntake.inspector_name || 'N/A'}
                  </p>
                </div>

                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-gray-500 mb-1">
                    No Scheduled Waste Included
                  </label>
                  <p className="text-base text-gray-900">
                    {viewingIntake.no_scheduled_waste ? (
                      <span className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-green-100 text-green-800">
                        ✓ Confirmed
                      </span>
                    ) : (
                      <span className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-gray-100 text-gray-800">
                        Not confirmed
                      </span>
                    )}
                  </p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-500 mb-1">
                    Created At
                  </label>
                  <p className="text-base text-gray-900">
                    {new Date(viewingIntake.created_at).toLocaleString()}
                  </p>
                </div>

                {viewingIntake.remarks && (
                  <div className="md:col-span-2">
                    <label className="block text-sm font-medium text-gray-500 mb-1">
                      Remarks
                    </label>
                    <p className="text-base text-gray-900 whitespace-pre-wrap">
                      {viewingIntake.remarks}
                    </p>
                  </div>
                )}
              </div>
            </div>

            <div className="sticky bottom-0 bg-gray-50 px-6 py-4 flex justify-end border-t border-gray-200">
              <button
                onClick={() => setViewingIntake(null)}
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
