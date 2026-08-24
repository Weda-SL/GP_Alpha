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

interface PlasticGrade {
  id: string;
  name: string;
  description: string | null;
}

interface SortedIntake {
  id: string;
  intake_batch_reference: string;
  intake_date: string;
  quantity_kg: number;
  plastic_type_names: string;
  grade: string;
  condition: string;
  colour: string;
  pic: string;
  remarks: string;
  created_at: string;
  quality_check_confirmed: boolean;
  inspector_name: string;
}

interface WasteIntakeBatch {
  id: string;
  intake_batch_reference: string;
  intake_date: string;
  quantity_kg: number;
  plastic_type_names: string[];
  remaining_weight: number;
}

interface BatchAllocation {
  batch_id: string;
  batch_reference: string;
  allocated_weight: string;
}

export function SortedIntake() {
  const { user } = useAuth();
  const [intakes, setIntakes] = React.useState<SortedIntake[]>([]);
  const [plasticTypes, setPlasticTypes] = React.useState<PlasticType[]>([]);
  const [plasticGrades, setPlasticGrades] = React.useState<PlasticGrade[]>([]);
  const [wasteIntakeBatches, setWasteIntakeBatches] = React.useState<WasteIntakeBatch[]>([]);
  const [referencedBatches, setReferencedBatches] = React.useState<Set<string>>(new Set());
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [showForm, setShowForm] = React.useState(false);
  const [editingIntake, setEditingIntake] = React.useState<SortedIntake | null>(null);
  const [viewingIntake, setViewingIntake] = React.useState<SortedIntake | null>(null);
  const [viewingAllocations, setViewingAllocations] = React.useState<BatchAllocation[]>([]);
  const [deletingIntakeId, setDeletingIntakeId] = React.useState<string | null>(null);
  const [businessCode, setBusinessCode] = React.useState<string>('');
  const [customerId, setCustomerId] = React.useState<string>('');

  const [formData, setFormData] = React.useState({
    intake_date: new Date().toISOString().split('T')[0],
    quantity_kg: '',
    plastic_type_names: '',
    grade: '',
    condition: 'Clean',
    colour: 'CLEAR',
    pic: '',
    remarks: '',
    quality_check_confirmed: false,
    inspector_name: ''
  });

  const [batchAllocations, setBatchAllocations] = React.useState<BatchAllocation[]>([]);

  React.useEffect(() => {
    fetchUserProfile();
    fetchPlasticTypes();
    fetchPlasticGrades();
    fetchIntakes();
    fetchReferencedBatches();
  }, [user?.id]);

  React.useEffect(() => {
    if (formData.plastic_type_names) {
      fetchWasteIntakeBatches(formData.plastic_type_names);
    } else {
      setWasteIntakeBatches([]);
    }
  }, [formData.plastic_type_names]);

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

  const fetchPlasticGrades = async () => {
    try {
      const { data, error } = await supabase
        .from('plastic_grades')
        .select('*')
        .order('name', { ascending: true });

      if (error) throw error;
      setPlasticGrades(data || []);
    } catch (err) {
      console.error('Error fetching plastic grades:', err);
    }
  };

  const fetchWasteIntakeBatches = async (selectedPlasticType: string) => {
    if (!user?.id) return;

    try {
      const { data, error } = await supabase
        .from('waste_plastic_intake')
        .select('id, intake_batch_reference, intake_date, quantity_kg, plastic_type_names')
        .eq('created_by', user.id)
        .contains('plastic_type_names', [selectedPlasticType])
        .order('intake_date', { ascending: false });

      if (error) throw error;

      const batchesWithRemaining = await Promise.all(
        (data || []).map(async (batch) => {
          const { data: allocData, error: allocError } = await supabase
            .from('sorted_plastic_intake_allocations')
            .select('allocated_weight_kg')
            .eq('waste_intake_batch_id', batch.id);

          if (allocError) {
            console.error('Error fetching allocations:', allocError);
            return null;
          }

          const totalAllocated = allocData?.reduce((sum, alloc) => sum + Number(alloc.allocated_weight_kg), 0) || 0;
          const remaining = Number(batch.quantity_kg) - totalAllocated;

          return {
            ...batch,
            remaining_weight: remaining
          };
        })
      );

      setWasteIntakeBatches(batchesWithRemaining.filter(b => b !== null && b.remaining_weight > 0) as WasteIntakeBatch[]);
    } catch (err) {
      console.error('Error fetching waste intake batches:', err);
    }
  };

  const fetchReferencedBatches = async () => {
    if (!user?.id) return;

    try {
      const { data, error } = await supabase
        .from('orders')
        .select('batch_number')
        .eq('customer_id', user.id)
        .not('batch_number', 'is', null);

      if (error) throw error;

      const batches = new Set<string>();
      data?.forEach(order => {
        if (order.batch_number) {
          batches.add(order.batch_number);
        }
      });
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
        .from('sorted_plastic_intake')
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
    const month = (today.getMonth() + 1).toString().padStart(2, '0');
    const year = today.getFullYear().toString();
    const mmyyyy = `${month}${year}`;

    const selectedType = plasticTypes.find(t => t.name === formData.plastic_type_names);
    const selectedGrade = plasticGrades.find(g => g.name === formData.grade);

    if (!selectedType || !selectedGrade) {
      return '';
    }

    const typeNum = selectedType.number;
    const gradeNum = selectedGrade.number;
    const datePrefix = `${businessCode}${typeNum}${gradeNum}${mmyyyy}`;

    const { data, error } = await supabase
      .from('sorted_plastic_intake')
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

    const totalAllocated = batchAllocations.reduce((sum, alloc) => sum + parseFloat(alloc.allocated_weight || '0'), 0);
    const totalQuantity = parseFloat(formData.quantity_kg);

    if (Math.abs(totalAllocated - totalQuantity) > 0.01) {
      setError(`Total allocated weight (${totalAllocated} kg) must equal the total quantity (${totalQuantity} kg)`);
      return;
    }

    if (batchAllocations.length === 0) {
      setError('Please select at least one waste intake batch');
      return;
    }

    try {
      if (editingIntake) {
        await supabase
          .from('sorted_plastic_intake_allocations')
          .delete()
          .eq('sorted_intake_id', editingIntake.id);

        const { error: updateError } = await supabase
          .from('sorted_plastic_intake')
          .update({
            intake_date: formData.intake_date,
            quantity_kg: parseFloat(formData.quantity_kg),
            plastic_type_names: formData.plastic_type_names,
            grade: formData.grade,
            condition: formData.condition,
            colour: formData.colour,
            pic: formData.pic,
            remarks: formData.remarks,
            quality_check_confirmed: formData.quality_check_confirmed,
            inspector_name: formData.inspector_name
          })
          .eq('id', editingIntake.id);

        if (updateError) throw updateError;

        const allocationsToInsert = batchAllocations.map(alloc => ({
          sorted_intake_id: editingIntake.id,
          waste_intake_batch_id: alloc.batch_id,
          waste_intake_batch_reference: alloc.batch_reference,
          allocated_weight_kg: parseFloat(alloc.allocated_weight),
          created_by: user.id
        }));

        const { error: allocError } = await supabase
          .from('sorted_plastic_intake_allocations')
          .insert(allocationsToInsert);

        if (allocError) throw allocError;
      } else {
        const batchReference = await generateBatchReference();

        if (!batchReference) {
          setError('Failed to generate batch reference. Please ensure plastic type and grade are selected.');
          return;
        }

        const { data: intakeData, error: insertError } = await supabase
          .from('sorted_plastic_intake')
          .insert([{
            intake_batch_reference: batchReference,
            intake_date: formData.intake_date,
            quantity_kg: parseFloat(formData.quantity_kg),
            plastic_type_names: formData.plastic_type_names,
            grade: formData.grade,
            condition: formData.condition,
            colour: formData.colour,
            pic: formData.pic,
            remarks: formData.remarks,
            quality_check_confirmed: formData.quality_check_confirmed,
            inspector_name: formData.inspector_name,
            customer_id: customerId,
            created_by: user.id
          }])
          .select();

        if (insertError) throw insertError;
        if (!intakeData || intakeData.length === 0) throw new Error('Failed to create intake record');

        const allocationsToInsert = batchAllocations.map(alloc => ({
          sorted_intake_id: intakeData[0].id,
          waste_intake_batch_id: alloc.batch_id,
          waste_intake_batch_reference: alloc.batch_reference,
          allocated_weight_kg: parseFloat(alloc.allocated_weight),
          created_by: user.id
        }));

        const { error: allocError } = await supabase
          .from('sorted_plastic_intake_allocations')
          .insert(allocationsToInsert);

        if (allocError) throw allocError;
      }

      setFormData({
        intake_date: new Date().toISOString().split('T')[0],
        quantity_kg: '',
        plastic_type_names: '',
        grade: '',
        condition: 'Clean',
        colour: 'CLEAR',
        pic: '',
        remarks: '',
        quality_check_confirmed: false,
        inspector_name: ''
      });
      setBatchAllocations([]);
      setEditingIntake(null);
      setShowForm(false);
      fetchIntakes();
      fetchReferencedBatches();
    } catch (err: any) {
      console.error('Error creating intake:', err);
      setError(err.message || 'Failed to create intake record');
    }
  };

  const handleEdit = async (intake: SortedIntake) => {
    setEditingIntake(intake);
    setFormData({
      intake_date: intake.intake_date,
      quantity_kg: intake.quantity_kg.toString(),
      plastic_type_names: intake.plastic_type_names,
      grade: intake.grade,
      condition: intake.condition,
      colour: intake.colour || 'CLEAR',
      pic: intake.pic,
      remarks: intake.remarks,
      quality_check_confirmed: intake.quality_check_confirmed,
      inspector_name: intake.inspector_name
    });

    try {
      const { data: allocData, error } = await supabase
        .from('sorted_plastic_intake_allocations')
        .select('waste_intake_batch_id, waste_intake_batch_reference, allocated_weight_kg')
        .eq('sorted_intake_id', intake.id);

      if (error) throw error;

      const allocations = allocData?.map(alloc => ({
        batch_id: alloc.waste_intake_batch_id,
        batch_reference: alloc.waste_intake_batch_reference,
        allocated_weight: alloc.allocated_weight_kg.toString()
      })) || [];

      setBatchAllocations(allocations);
    } catch (err) {
      console.error('Error loading allocations:', err);
      setBatchAllocations([]);
    }

    setShowForm(true);
  };

  const handleCancelEdit = () => {
    setEditingIntake(null);
    setFormData({
      intake_date: new Date().toISOString().split('T')[0],
      quantity_kg: '',
      plastic_type_names: '',
      grade: '',
      condition: 'Clean',
      colour: 'CLEAR',
      pic: '',
      remarks: '',
      quality_check_confirmed: false,
      inspector_name: ''
    });
    setBatchAllocations([]);
    setShowForm(false);
  };

  const handleDelete = async () => {
    if (!deletingIntakeId) return;

    try {
      const { error } = await supabase
        .from('sorted_plastic_intake')
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
            <h1 className="text-3xl font-bold text-gray-900">Sorted Plastic Intake</h1>
            <p className="mt-2 text-gray-600">
              Record incoming sorted plastic from processing operations.
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
                    Quantity (Kg)
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Colour
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Type
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Grade
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
                      {intake.quantity_kg}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      <span className="px-2 py-1 bg-gray-100 text-gray-800 rounded text-xs">
                        {intake.colour || 'N/A'}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-500">
                      <span className="px-2 py-1 bg-blue-100 text-blue-800 rounded text-xs">
                        {intake.plastic_type_names}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      <span className="px-2 py-1 bg-green-100 text-green-800 rounded-full text-xs">
                        {intake.grade}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      <div className="flex items-center space-x-3">
                        <button
                          onClick={async () => {
                            setViewingIntake(intake);
                            try {
                              const { data: allocData, error } = await supabase
                                .from('sorted_plastic_intake_allocations')
                                .select('waste_intake_batch_reference, allocated_weight_kg')
                                .eq('sorted_intake_id', intake.id);

                              if (error) throw error;

                              const allocations = allocData?.map(alloc => ({
                                batch_id: '',
                                batch_reference: alloc.waste_intake_batch_reference,
                                allocated_weight: alloc.allocated_weight_kg.toString()
                              })) || [];

                              setViewingAllocations(allocations);
                            } catch (err) {
                              console.error('Error loading allocations:', err);
                              setViewingAllocations([]);
                            }
                          }}
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
                {editingIntake ? 'Edit Sorted Plastic Intake' : 'New Sorted Plastic Intake'}
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
                      Plastic Type *
                    </label>
                    <select
                      required
                      value={formData.plastic_type_names}
                      onChange={(e) => {
                        setFormData({ ...formData, plastic_type_names: e.target.value });
                        setBatchAllocations([]);
                      }}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      <option value="">Select plastic type</option>
                      {plasticTypes.map((type) => (
                        <option key={type.id} value={type.name}>
                          {type.number} - {type.name}
                        </option>
                      ))}
                    </select>
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
                      Grade *
                    </label>
                    <select
                      required
                      value={formData.grade}
                      onChange={(e) => setFormData({ ...formData, grade: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      <option value="">Select grade</option>
                      {plasticGrades.map((grade) => (
                        <option key={grade.id} value={grade.name}>
                          {grade.name}
                        </option>
                      ))}
                    </select>
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
                      <option value="Clean">Clean</option>
                      <option value="Baled">Baled</option>
                      <option value="Shredded">Shredded</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Colour *
                    </label>
                    <select
                      required
                      value={formData.colour}
                      onChange={(e) => setFormData({ ...formData, colour: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      <option value="RED">Red</option>
                      <option value="GREEN">Green</option>
                      <option value="BLUE">Blue</option>
                      <option value="YELLOW">Yellow</option>
                      <option value="MULTI">Multi</option>
                      <option value="CLEAR">Clear</option>
                    </select>
                  </div>

                  <div className="md:col-span-2">
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Waste Intake Batch References *
                    </label>
                    {!formData.plastic_type_names ? (
                      <p className="text-sm text-gray-500 italic">Please select a plastic type first</p>
                    ) : wasteIntakeBatches.length === 0 ? (
                      <p className="text-sm text-gray-500 italic">No available waste intake batches for this plastic type</p>
                    ) : (
                      <div className="space-y-3">
                        {wasteIntakeBatches.map((batch) => {
                          const allocation = batchAllocations.find(a => a.batch_id === batch.id);
                          const isSelected = !!allocation;
                          const allocatedWeight = allocation?.allocated_weight || '';

                          return (
                            <div key={batch.id} className="border border-gray-300 rounded-md p-3 bg-gray-50">
                              <div className="flex items-start justify-between">
                                <div className="flex items-start space-x-3 flex-1">
                                  <input
                                    type="checkbox"
                                    checked={isSelected}
                                    onChange={(e) => {
                                      if (e.target.checked) {
                                        setBatchAllocations([...batchAllocations, {
                                          batch_id: batch.id,
                                          batch_reference: batch.intake_batch_reference,
                                          allocated_weight: ''
                                        }]);
                                      } else {
                                        setBatchAllocations(batchAllocations.filter(a => a.batch_id !== batch.id));
                                      }
                                    }}
                                    className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded mt-1"
                                  />
                                  <div className="flex-1">
                                    <p className="text-sm font-medium text-gray-900">{batch.intake_batch_reference}</p>
                                    <p className="text-xs text-gray-500">Date: {new Date(batch.intake_date).toLocaleDateString()}</p>
                                    <p className="text-xs text-gray-500">Available: {batch.remaining_weight.toFixed(2)} kg</p>
                                  </div>
                                </div>
                                {isSelected && (
                                  <div className="ml-3">
                                    <input
                                      type="number"
                                      min="0.01"
                                      max={batch.remaining_weight}
                                      step="0.01"
                                      value={allocatedWeight}
                                      onChange={(e) => {
                                        const value = e.target.value;
                                        const numValue = parseFloat(value);
                                        if (value && numValue > batch.remaining_weight) {
                                          setError(`Cannot allocate more than ${batch.remaining_weight} kg from this batch`);
                                          return;
                                        }
                                        setError(null);
                                        setBatchAllocations(batchAllocations.map(a =>
                                          a.batch_id === batch.id ? { ...a, allocated_weight: value } : a
                                        ));
                                      }}
                                      placeholder="Weight (kg)"
                                      className="w-32 px-2 py-1 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                                      required
                                    />
                                  </div>
                                )}
                              </div>
                            </div>
                          );
                        })}
                        {(() => {
                          const totalAllocated = batchAllocations.reduce((sum, a) => sum + parseFloat(a.allocated_weight || '0'), 0);
                          const totalRequired = parseFloat(formData.quantity_kg || '0');
                          const isEqual = Math.abs(totalAllocated - totalRequired) < 0.01;
                          const allocationBgColor = isEqual ? 'bg-green-50' : 'bg-red-50';
                          const allocationTextColor = isEqual ? 'text-green-900' : 'text-red-900';
                          const allocationSubTextColor = isEqual ? 'text-green-700' : 'text-red-700';

                          return (
                            <div className={`mt-3 p-3 ${allocationBgColor} rounded-md`}>
                              <p className={`text-sm font-medium ${allocationTextColor}`}>
                                Total Allocated: {totalAllocated.toFixed(2)} kg
                              </p>
                              <p className={`text-sm ${allocationSubTextColor}`}>
                                Total Required: {totalRequired.toFixed(2)} kg
                              </p>
                            </div>
                          );
                        })()}
                      </div>
                    )}
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
                    <label className="flex items-center cursor-pointer">
                      <input
                        type="checkbox"
                        required
                        checked={formData.quality_check_confirmed}
                        onChange={(e) => setFormData({ ...formData, quality_check_confirmed: e.target.checked })}
                        className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                      />
                      <span className="ml-2 text-sm text-gray-900">
                        Quality check completed and approved *
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
                  disabled={(() => {
                    const totalAllocated = batchAllocations.reduce((sum, a) => sum + parseFloat(a.allocated_weight || '0'), 0);
                    const totalRequired = parseFloat(formData.quantity_kg || '0');
                    const allocationMatches = Math.abs(totalAllocated - totalRequired) < 0.01;

                    return !formData.intake_date ||
                      !formData.quantity_kg ||
                      !formData.plastic_type_names ||
                      !formData.grade ||
                      !formData.colour ||
                      !formData.pic.trim() ||
                      !formData.inspector_name.trim() ||
                      !formData.quality_check_confirmed ||
                      batchAllocations.length === 0 ||
                      batchAllocations.some(a => !a.allocated_weight || parseFloat(a.allocated_weight) <= 0) ||
                      !allocationMatches;
                  })()}
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
              <h2 className="text-xl font-semibold text-gray-900">Sorted Plastic Intake Details</h2>
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
                    Quantity
                  </label>
                  <p className="text-base text-gray-900">
                    {viewingIntake.quantity_kg} kg
                  </p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-500 mb-1">
                    Plastic Type
                  </label>
                  <p className="text-base text-gray-900">
                    <span className="px-3 py-1 bg-blue-100 text-blue-800 rounded-md text-sm">
                      {viewingIntake.plastic_type_names}
                    </span>
                  </p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-500 mb-1">
                    Grade
                  </label>
                  <p className="text-base text-gray-900">
                    <span className="px-2 py-1 bg-green-100 text-green-800 rounded-full text-xs">
                      {viewingIntake.grade}
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

                <div>
                  <label className="block text-sm font-medium text-gray-500 mb-1">
                    Colour
                  </label>
                  <p className="text-base text-gray-900">
                    <span className="px-2 py-1 bg-gray-100 text-gray-800 rounded text-xs">
                      {viewingIntake.colour || 'N/A'}
                    </span>
                  </p>
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
                    Quality Check Status
                  </label>
                  <p className="text-base text-gray-900">
                    {viewingIntake.quality_check_confirmed ? (
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

                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-gray-500 mb-2">
                    Waste Intake Batch Allocations
                  </label>
                  {viewingAllocations.length === 0 ? (
                    <p className="text-sm text-gray-500 italic">No allocations found</p>
                  ) : (
                    <div className="space-y-2">
                      {viewingAllocations.map((alloc, idx) => (
                        <div key={idx} className="flex items-center justify-between p-3 bg-gray-50 rounded-md border border-gray-200">
                          <span className="text-sm font-medium text-gray-900">{alloc.batch_reference}</span>
                          <span className="text-sm text-gray-700">{parseFloat(alloc.allocated_weight).toFixed(2)} kg</span>
                        </div>
                      ))}
                      <div className="p-3 bg-blue-50 rounded-md border border-blue-200">
                        <span className="text-sm font-semibold text-blue-900">
                          Total: {viewingAllocations.reduce((sum, a) => sum + parseFloat(a.allocated_weight), 0).toFixed(2)} kg
                        </span>
                      </div>
                    </div>
                  )}
                </div>
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
