import React, { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../hooks/useAuth';
import { PlusCircle, FileText, Calendar, User, Package, Download, Upload, Trash2, CheckCircle, XCircle, Eye, Clock, AlertCircle, List, Send, Settings, RefreshCw, X, Award, ChevronDown, ChevronUp, Beaker } from 'lucide-react';
import { logAuditEvent } from '../utils/auditLogger';
import { generateCertificateUUID, generateCertificatePDF, storeCertificate, downloadCertificateFromStorage } from '../utils/certificateGenerator';
import QRCode from 'qrcode';
import jsPDF from 'jspdf';

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

interface PlasticType {
  id: string;
  number: string;
  name: string;
}

interface PlasticGrade {
  id: string;
  number: string;
  name: string;
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
  test_suite: TestSuite | null;
  plastic_type: {
    id: string;
    number: string;
    name: string;
  };
  plastic_grade: PlasticGrade;
  individual_tests: {
    test_id: string;
    tests: {
      id: string;
      name: string;
      cost: number;
      min_sample_size: number | null;
    };
  }[];
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

interface OrderFormData {
  testSuiteId: string;
  plasticTypeId: string;
  plasticGradeId: string;
  productionMonth: string;
  productionYear: string;
  batchNumber: string;
}

interface TestCompletionStatus {
  total_tests: number;
  completed_tests: number;
  all_completed: boolean;
  completion_percentage: number;
}

interface StatusTrailRecord {
  id: string;
  order_id: string;
  old_status: string | null;
  new_status: string;
  changed_by: string;
  changed_by_role: string;
  changed_by_name: string | null;
  notes: string | null;
  created_at: string;
}

export function Orders() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [testSuites, setTestSuites] = useState<TestSuite[]>([]);
  const [plasticTypes, setPlasticTypes] = useState<PlasticType[]>([]);
  const [plasticGrades, setPlasticGrades] = useState<PlasticGrade[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [userRole, setUserRole] = useState<string | null>(null);
  const [userStatus, setUserStatus] = useState<string | null>(null);
  const [showNewOrderModal, setShowNewOrderModal] = useState(false);
  const [showResultModal, setShowResultModal] = useState<string | null>(null);
  const [showQAModal, setShowQAModal] = useState<string | null>(null);
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [resultForm, setResultForm] = useState<{ [key: string]: string }>({});
  const [resultNotes, setResultNotes] = useState<{ [key: string]: string }>({});
  const [qaApprovalNotes, setQAApprovalNotes] = useState('');
  const [processingQA, setProcessingQA] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState<string | null>(null);
  const [showShippingModal, setShowShippingModal] = useState(false);
  const [selectedOrderForShipping, setSelectedOrderForShipping] = useState<Order | null>(null);
  const [showInspectionModal, setShowInspectionModal] = useState(false);
  const [selectedOrderForInspection, setSelectedOrderForInspection] = useState<Order | null>(null);
  const [inspectionAction, setInspectionAction] = useState<'accept' | 'reject' | null>(null);
  const [inspectionNotes, setInspectionNotes] = useState('');
  const [inspectionPhoto, setInspectionPhoto] = useState<File | null>(null);
  const [inspectionPhotoPreview, setInspectionPhotoPreview] = useState<string | null>(null);
  const [processingInspection, setProcessingInspection] = useState(false);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [viewingOrder, setViewingOrder] = useState<Order | null>(null);
  const [generatingCertificate, setGeneratingCertificate] = useState(false);
  const [shippingFormData, setShippingFormData] = useState({
    numberOfSamples: 0,
    shippedWeight: 0,
    shippingNotes: '',
    shippingDate: ''
  });
  const [shippingFormErrors, setShippingFormErrors] = useState<{
    numberOfSamples?: string;
    shippedWeight?: string;
    shippingNotes?: string;
    shippingDate?: string;
  }>({});
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState<string>('all');
  const [testCompletionStatus, setTestCompletionStatus] = useState<TestCompletionStatus | null>(null);
  const [showCompletionNotesModal, setShowCompletionNotesModal] = useState(false);
  const [completionNotes, setCompletionNotes] = useState('');
  const [selectedOrderForCompletion, setSelectedOrderForCompletion] = useState<Order | null>(null);
  const [processingCompletion, setProcessingCompletion] = useState(false);
  const [statusTrail, setStatusTrail] = useState<StatusTrailRecord[]>([]);
  const [loadingStatusTrail, setLoadingStatusTrail] = useState(false);
  const [showStatusTrail, setShowStatusTrail] = useState(false);
  const [sourceFilter, setSourceFilter] = useState<string>('all');

  const [orderForm, setOrderForm] = useState<OrderFormData>({
    testSuiteId: '',
    plasticTypeId: '',
    plasticGradeId: '',
    productionMonth: '',
    productionYear: '',
    batchNumber: '',
  });

  useEffect(() => {
    if (viewingOrder) {
      fetchStatusTrail(viewingOrder.id);
      fetchTestCompletionStatus(viewingOrder.id);
    } else {
      setStatusTrail([]);
      setTestCompletionStatus(null);
    }
  }, [viewingOrder]);

  useEffect(() => {
    if (showResultModal) {
      const order = orders.find(o => o.id === showResultModal);
      if (order) {
        const initialResultForm: { [key: string]: string } = {};
        const initialResultNotes: { [key: string]: string } = {};

        order.test_suite?.test_suite_items.forEach((item) => {
          const existingResult = order.order_results.find(r => r.test_id === item.tests.id);
          if (existingResult) {
            if (existingResult.result) {
              initialResultForm[item.tests.id] = existingResult.result;
            }
            if (existingResult.notes) {
              initialResultNotes[item.tests.id] = existingResult.notes;
            }
          }
        });

        setResultForm(initialResultForm);
        setResultNotes(initialResultNotes);
      }
    }
  }, [showResultModal, orders]);

  useEffect(() => {
    if (orders.length > 0 && !loading) {
      const orderIdToReopen = localStorage.getItem('reopenOrderDetails');
      if (orderIdToReopen) {
        const order = orders.find(o => o.id === orderIdToReopen);
        if (order) {
          setViewingOrder(order);
        }
        localStorage.removeItem('reopenOrderDetails');
      }
    }
  }, [orders, loading]);

  useEffect(() => {
    const fetchUserData = async () => {
      if (!user?.id) return;

      try {
        const { data: userData, error } = await supabase
          .from('users')
          .select('role, status')
          .eq('id', user.id)
          .single();

        if (error) throw error;
        setUserRole(userData.role);
        setUserStatus(userData.status);
      } catch (err) {
        console.error('Error fetching user data:', err);
      }
    };

    const fetchOrders = async () => {
      try {
        let query = supabase
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
            individual_tests:order_results(
              test_id,
              tests(id, name, cost, min_sample_size)
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
            shipped_number_of_samples,
            shipped_weight_kgs,
            shipping_notes,
            rejection_notes,
            rejection_date,
            sample_inspection_status,
            sample_inspection_date,
            sample_inspection_notes,
            sample_inspection_photo_path,
            inspected_by,
            inspector:users!orders_inspected_by_fkey(full_name, role),
            certificate_uuid,
            certificate_path,
            order_source,
            processing_batch_id,
            processing_batch:sorted_plastic_intake_processing(
              id,
              intake_batch_reference,
              actual_processing_completion_date,
              original_quantity_kg
            )
          `)
          .order('created_at', { ascending: false });

        // Filter based on user role
        if (userRole === 'customer') {
          query = query.eq('customer_id', user?.id);
        }

        const { data, error: fetchError } = await query;

        if (fetchError) throw fetchError;
        setOrders(data || []);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to fetch orders');
      } finally {
        setLoading(false);
      }
    };

    const fetchFormData = async () => {
      try {
        const [suitesRes, typesRes, gradesRes] = await Promise.all([
          supabase.from('test_suites').select(`
            id, name, description,
            test_suite_items(
              tests(id, name, cost, unit_of_measure, time_to_delivery, min_sample_size)
            )
          `).order('name'),
          supabase.from('plastic_types').select('*').order('number'),
          supabase.from('plastic_grades').select('*').order('number')
        ]);

        if (suitesRes.error) throw suitesRes.error;
        if (typesRes.error) throw typesRes.error;
        if (gradesRes.error) throw gradesRes.error;

        setTestSuites(suitesRes.data || []);
        setPlasticTypes(typesRes.data || []);
        setPlasticGrades(gradesRes.data || []);
      } catch (err) {
        console.error('Error fetching form data:', err);
      }
    };

    fetchUserData().then(() => {
      fetchOrders();
      fetchFormData();
    });
  }, [user?.id, userRole]);

  const handleCreateOrder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user?.id) return;

    try {
      const { data, error } = await supabase
        .from('orders')
        .insert([{
          customer_id: user.id,
          test_suite_id: orderForm.testSuiteId,
          plastic_type_id: orderForm.plasticTypeId,
          plastic_grade_id: orderForm.plasticGradeId,
          production_month: orderForm.productionMonth ? parseInt(orderForm.productionMonth) : null,
          production_year: orderForm.productionYear ? parseInt(orderForm.productionYear) : null,
          batch_number: orderForm.batchNumber || null,
          order_source: 'direct',
          processing_batch_id: null
        }])
        .select()
        .single();

      if (error) throw error;

      await logAuditEvent('CREATE_ORDER', 'orders', data.id);
      setShowNewOrderModal(false);
      setOrderForm({
        testSuiteId: '',
        plasticTypeId: '',
        plasticGradeId: '',
        productionMonth: '',
        productionYear: '',
        batchNumber: '',
      });

      // Refresh orders
      window.location.reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create order');
    }
  };

  const handleStatusUpdate = async (orderId: string, newStatus: string) => {
    try {
      const order = orders.find(o => o.id === orderId);
      const oldStatus = order?.status || '';

      // Prevent manual status change to processing (must use dual-approval workflow)
      if (newStatus === 'processing') {
        setError(
          'Orders cannot be manually set to processing status. ' +
          'Processing status is automatically set when both sample inspection is accepted AND financial approval is granted.'
        );
        return;
      }

      const { error } = await supabase
        .from('orders')
        .update({ status: newStatus })
        .eq('id', orderId);

      if (error) throw error;

      await logStatusChange(orderId, oldStatus, newStatus);
      await logAuditEvent('UPDATE_ORDER_STATUS', 'orders', orderId, { new_status: newStatus });

      setOrders(orders.map(order =>
        order.id === orderId ? { ...order, status: newStatus } : order
      ));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update order status');
    }
  };

  const handleResultSubmit = async (orderId: string) => {
    try {
      const order = orders.find(o => o.id === orderId);
      if (!order) return;

      // Update or insert results for each test
      for (const item of order.test_suite.test_suite_items) {
        const testId = item.tests.id;
        const result = resultForm[testId];
        const notes = resultNotes[testId];

        if (result) {
          const existingResult = order.order_results.find(r => r.test_id === testId);
          
          if (existingResult) {
            const { error } = await supabase
              .from('order_results')
              .update({
                result,
                notes,
                updated_by: user?.id,
                updated_at: new Date().toISOString(),
              })
              .eq('id', existingResult.id);

            if (error) throw error;
          } else {
            const { error } = await supabase
              .from('order_results')
              .insert([{
                order_id: orderId,
                test_id: testId,
                result,
                notes,
                updated_by: user?.id,
              }]);

            if (error) throw error;
          }
        }
      }

      await logAuditEvent('UPDATE_ORDER_RESULTS', 'orders', orderId);

      // Store order ID to restore after reload
      localStorage.setItem('reopenOrderDetails', orderId);

      setShowResultModal(null);
      setResultForm({});
      setResultNotes({});

      // Refresh orders
      window.location.reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update results');
    }
  };

  const handleQAApproval = async (orderId: string, action: 'approved' | 'rejected') => {
    if (!qaApprovalNotes.trim()) {
      setError('Please add notes before proceeding');
      return;
    }

    setProcessingQA(true);
    try {
      const order = orders.find(o => o.id === orderId);
      const oldStatus = order?.status || '';

      const updateData: any = {
        qa_approval_status: action,
        qa_approval_notes: qaApprovalNotes.trim(),
        qa_approved_at: new Date().toISOString(),
        qa_approved_by: user?.id,
      };

      if (action === 'rejected' && oldStatus === 'completed') {
        updateData.status = 'processing';
      }

      const { error } = await supabase
        .from('orders')
        .update(updateData)
        .eq('id', orderId);

      if (error) throw error;

      if (action === 'rejected' && oldStatus === 'completed') {
        await logStatusChange(orderId, oldStatus, 'processing', `QA Rejected: ${qaApprovalNotes.trim()}`);
      }

      await logAuditEvent(
        action === 'approved' ? 'QA_APPROVE_ORDER' : 'QA_REJECT_ORDER',
        'orders',
        orderId,
        { notes: qaApprovalNotes.trim(), statusReverted: action === 'rejected' && oldStatus === 'completed' }
      );

      // Store order ID to restore after reload
      localStorage.setItem('reopenOrderDetails', orderId);

      setShowQAModal(null);
      setQAApprovalNotes('');

      // Refresh orders
      window.location.reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to process QA approval');
    } finally {
      setProcessingQA(false);
    }
  };

  const handleDeleteOrder = async (orderId: string) => {
    try {
      const { error } = await supabase
        .from('orders')
        .delete()
        .eq('id', orderId);

      if (error) throw error;

      await logAuditEvent('DELETE_ORDER', 'orders', orderId);
      setOrders(orders.filter(order => order.id !== orderId));
      setShowDeleteModal(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete order');
    }
  };

  const handleShippingFormChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value, type } = e.target;
    setShippingFormData(prev => ({
      ...prev,
      [name]: type === 'number' ? parseFloat(value) || 0 : value
    }));
    setShippingFormErrors(prev => ({ ...prev, [name]: undefined })); // Clear error on change
  };

  const validateShippingForm = (order: Order) => {
    const errors: { numberOfSamples?: string; shippedWeight?: string; shippingNotes?: string; shippingDate?: string } = {};
    let isValid = true;

    if (!order.test_suite) {
      errors.numberOfSamples = 'Order test suite information is missing.';
      return { isValid: false, errors };
    }

    if (shippingFormData.numberOfSamples <= 0) {
      errors.numberOfSamples = 'Number of samples is required and must be greater than 0.';
      isValid = false;
    }
    if (shippingFormData.shippedWeight <= 0) {
      errors.shippedWeight = 'Total sample weight is required and must be greater than 0.';
      isValid = false;
    }
    if (!shippingFormData.shippingNotes.trim()) {
      errors.shippingNotes = 'Shipping notes are required.';
      isValid = false;
    }
    if (!shippingFormData.shippingDate.trim()) {
      errors.shippingDate = 'Shipping date is required.';
      isValid = false;
    } else {
      const selectedDate = new Date(shippingFormData.shippingDate);
      const today = new Date();
      today.setHours(23, 59, 59, 999); // Set to end of today to allow today's date
      if (selectedDate > today) {
        errors.shippingDate = 'Shipping date cannot be in the future.';
        isValid = false;
      }
    }

    const requiredWeight = calculateTotalSampleSize(order);
    if (shippingFormData.shippedWeight < requiredWeight) {
      errors.shippedWeight = `Total sample weight must be at least ${requiredWeight} Kgs.`;
      isValid = false;
    }

    return { isValid, errors };
  };

  const handleShipSampleSubmit = async () => {
    if (!selectedOrderForShipping || !user?.id) return;

    const validation = validateShippingForm(selectedOrderForShipping);
    if (!validation.isValid) {
      setShippingFormErrors(validation.errors);
      return;
    }

    try {
      const { error } = await supabase
        .from('orders')
        .update({
          status: 'sample_shipped',
          shipped_number_of_samples: shippingFormData.numberOfSamples,
          shipped_weight_kgs: shippingFormData.shippedWeight,
          shipping_notes: shippingFormData.shippingNotes,
          shipping_date: shippingFormData.shippingDate,
          sample_inspection_status: null,
          sample_inspection_date: null,
          sample_inspection_notes: null,
          sample_inspection_photo_path: null,
          inspected_by: null,
        })
        .eq('id', selectedOrderForShipping.id);

      if (error) throw error;

      await logAuditEvent('SAMPLE_SHIPPED', 'orders', selectedOrderForShipping.id, {
        numberOfSamples: shippingFormData.numberOfSamples,
        shippedWeight: shippingFormData.shippedWeight,
        shippingNotes: shippingFormData.shippingNotes,
      });

      // Store order ID to restore after reload
      localStorage.setItem('reopenOrderDetails', selectedOrderForShipping.id);

      setShowShippingModal(false);
      setSelectedOrderForShipping(null);
      setShippingFormData({ numberOfSamples: 0, shippedWeight: 0, shippingNotes: '', shippingDate: '' });
      setShippingFormErrors({});
      window.location.reload(); // Refresh orders to show updated status
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to ship sample');
    }
  };

  const handlePhotoSelection = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate file type
    if (!file.type.startsWith('image/')) {
      setError('Please select an image file (JPG, PNG, or WebP)');
      return;
    }

    // Validate file size (5MB max)
    if (file.size > 5 * 1024 * 1024) {
      setError('Image file size must be less than 5MB');
      return;
    }

    setInspectionPhoto(file);

    // Create preview
    const reader = new FileReader();
    reader.onloadend = () => {
      setInspectionPhotoPreview(reader.result as string);
    };
    reader.readAsDataURL(file);
  };

  const handleSampleInspection = async () => {
    if (!selectedOrderForInspection || !user?.id || !inspectionAction) return;

    // Validate inspection notes
    if (!inspectionNotes.trim() || inspectionNotes.trim().length < 10) {
      setError('Please provide detailed inspection notes (at least 10 characters)');
      return;
    }

    setProcessingInspection(true);
    setError(null);

    try {
      let photoPath: string | null = null;

      // Upload photo if provided
      if (inspectionPhoto) {
        setUploadingPhoto(true);
        const timestamp = Date.now();
        const fileExt = inspectionPhoto.name.split('.').pop();
        const fileName = `${selectedOrderForInspection.id}/inspection_${timestamp}.${fileExt}`;

        const { error: uploadError } = await supabase.storage
          .from('sample-inspections')
          .upload(fileName, inspectionPhoto, {
            contentType: inspectionPhoto.type,
            upsert: false
          });

        if (uploadError) {
          console.error('Photo upload error:', uploadError);
          setError('Warning: Photo upload failed. Continuing without image.');
        } else {
          photoPath = fileName;
        }
        setUploadingPhoto(false);
      }

      // Determine new status based on action
      // For rejection: status goes back to pending
      // For acceptance: status stays at current value, database trigger will check dual-approval
      const newStatus = inspectionAction === 'reject' ? 'pending' : selectedOrderForInspection.status;
      const oldStatus = selectedOrderForInspection.status;

      // Update order with inspection data
      const updateData: any = {
        sample_inspection_status: inspectionAction === 'accept' ? 'accepted' : 'rejected',
        sample_inspection_date: new Date().toISOString(),
        sample_inspection_notes: inspectionNotes.trim(),
        sample_inspection_photo_path: photoPath,
        inspected_by: user.id,
      };

      // Only update status for rejection (acceptance status is handled by database trigger)
      if (inspectionAction === 'reject') {
        updateData.status = 'pending';
        updateData.rejection_notes = inspectionNotes.trim();
        updateData.rejection_date = new Date().toISOString();
      }

      const { error: updateError } = await supabase
        .from('orders')
        .update(updateData)
        .eq('id', selectedOrderForInspection.id);

      if (updateError) throw updateError;

      // Log status change in status trail only if status actually changed
      if (inspectionAction === 'reject') {
        await logStatusChange(
          selectedOrderForInspection.id,
          oldStatus,
          newStatus,
          `Sample rejected: ${inspectionNotes.trim()}`
        );
      } else {
        // For acceptance, log inspection event but note that processing transition is conditional
        await logStatusChange(
          selectedOrderForInspection.id,
          oldStatus,
          oldStatus,
          `Sample accepted: ${inspectionNotes.trim()}. ${selectedOrderForInspection.financial_status === 'approved' ? 'Order will automatically transition to processing (dual approval complete).' : 'Awaiting financial approval for processing.'}`
        );
      }

      // Log audit event
      await logAuditEvent(
        inspectionAction === 'accept' ? 'SAMPLE_ACCEPTED' : 'SAMPLE_REJECTED',
        'orders',
        selectedOrderForInspection.id,
        {
          inspectionNotes: inspectionNotes.trim(),
          hasPhoto: !!photoPath,
          photoPath: photoPath,
        }
      );

      // Store order ID to restore after reload
      localStorage.setItem('reopenOrderDetails', selectedOrderForInspection.id);

      // Close modal and reset state
      setShowInspectionModal(false);
      setSelectedOrderForInspection(null);
      setInspectionAction(null);
      setInspectionNotes('');
      setInspectionPhoto(null);
      setInspectionPhotoPreview(null);

      window.location.reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to process sample inspection');
    } finally {
      setProcessingInspection(false);
      setUploadingPhoto(false);
    }
  };

  const handleResultApproval = async (resultId: string, action: 'approved' | 'rejected', notes: string) => {
    try {
      const { error } = await supabase
        .from('order_results')
        .update({
          approval_status: action,
          notes_app_rej: notes,
        })
        .eq('id', resultId);

      if (error) throw error;

      await logAuditEvent(
        action === 'approved' ? 'APPROVE_TEST_RESULT' : 'REJECT_TEST_RESULT',
        'order_results',
        resultId,
        { notes }
      );

      window.location.reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update result approval');
    }
  };

  const fetchTestCompletionStatus = async (orderId: string) => {
    try {
      const { data, error } = await supabase
        .rpc('get_order_test_completion_status', { p_order_id: orderId });

      if (error) throw error;

      setTestCompletionStatus(data);
      return data;
    } catch (err) {
      console.error('Error fetching test completion status:', err);
      return null;
    }
  };

  const fetchStatusTrail = async (orderId: string) => {
    setLoadingStatusTrail(true);
    try {
      const { data, error } = await supabase
        .from('order_status_trail')
        .select('*')
        .eq('order_id', orderId)
        .order('created_at', { ascending: false });

      if (error) throw error;

      setStatusTrail(data || []);
    } catch (err) {
      console.error('Error fetching status trail:', err);
      setStatusTrail([]);
    } finally {
      setLoadingStatusTrail(false);
    }
  };

  const logStatusChange = async (orderId: string, oldStatus: string, newStatus: string, notes?: string) => {
    try {
      const { error } = await supabase.rpc('log_order_status_change', {
        p_order_id: orderId,
        p_old_status: oldStatus,
        p_new_status: newStatus,
        p_changed_by: user?.id,
        p_notes: notes || null
      });

      if (error) throw error;
    } catch (err) {
      console.error('Error logging status change:', err);
    }
  };

  const handleMarkCompleted = async (order: Order, notes?: string) => {
    if (!user?.id) return;

    if ((userRole === 'manager' || userRole === 'admin') && !notes?.trim()) {
      setError('Completion notes are required for Manager and Admin roles');
      return;
    }

    setProcessingCompletion(true);
    try {
      const previousQAData = {
        qa_approval_status: order.qa_approval_status,
        qa_approval_notes: order.qa_approval_notes
      };

      const updateData: any = {
        status: 'completed',
        qa_approval_status: null,
        qa_approval_notes: null,
        qa_approved_at: null,
        qa_approved_by: null
      };

      if (notes?.trim()) {
        updateData.completion_notes = notes.trim();
      }

      const { error } = await supabase
        .from('orders')
        .update(updateData)
        .eq('id', order.id);

      if (error) throw error;

      await logStatusChange(order.id, order.status, 'completed', notes);
      await logAuditEvent('MARK_ORDER_COMPLETED', 'orders', order.id, {
        completion_notes: notes,
        role: userRole,
        previous_qa_data: previousQAData,
        qa_fields_cleared: previousQAData.qa_approval_status !== null
      });

      localStorage.setItem('reopenOrderDetails', order.id);

      setShowCompletionNotesModal(false);
      setSelectedOrderForCompletion(null);
      setCompletionNotes('');
      window.location.reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to mark order as completed');
    } finally {
      setProcessingCompletion(false);
    }
  };

  const generateQRCode = async (orderNumber: string) => {
    try {
      const qrCodeDataURL = await QRCode.toDataURL(orderNumber);
      return qrCodeDataURL;
    } catch (err) {
      console.error('Error generating QR code:', err);
      return null;
    }
  };

  const generateOrderLabel = async (order: Order) => {
    try {
      const qrCodeDataURL = await generateQRCode(order.order_number);
      
      const pdf = new jsPDF({
        orientation: 'portrait',
        unit: 'mm',
        format: [100, 150] // 100mm x 150mm label
      });

      // Add title
      pdf.setFontSize(16);
      pdf.text('GP Certified', 50, 15, { align: 'center' });
      
      // Add order number
      pdf.setFontSize(12);
      pdf.text(`Order: ${order.order_number}`, 50, 25, { align: 'center' });
      
      // Add customer info
      pdf.setFontSize(10);
      pdf.text(`Customer: ${order.customer?.full_name || 'N/A'}`, 10, 35);
      pdf.text(`Business: ${order.customer?.customer_profile?.business_name || 'N/A'}`, 10, 42);
      
      // Add material info
      pdf.text(`Type: ${order.plastic_type.number} - ${order.plastic_type.name}`, 10, 52);
      pdf.text(`Grade: ${order.plastic_grade.number} - ${order.plastic_grade.name}`, 10, 59);
      
      if (order.batch_number) {
        pdf.text(`Batch: ${order.batch_number}`, 10, 66);
      }
      
      // Add QR code if generated successfully
      if (qrCodeDataURL) {
        pdf.addImage(qrCodeDataURL, 'PNG', 25, 75, 50, 50);
      }
      
      // Add date
      pdf.text(`Date: ${new Date(order.created_at).toLocaleDateString()}`, 10, 135);
      
      pdf.save(`order-label-${order.order_number}.pdf`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to generate label');
    }
  };

  const handleFileUpload = async (orderId: string, file: File) => {
    try {
      const fileExt = file.name.split('.').pop();
      const fileName = `${Math.random()}.${fileExt}`;
      const filePath = `orders/${orderId}/${fileName}`;

      const { error: uploadError } = await supabase.storage
        .from('order-documents')
        .upload(filePath, file);

      if (uploadError) throw uploadError;

      const { error: dbError } = await supabase
        .from('order_documents')
        .insert([{
          order_id: orderId,
          file_name: file.name,
          file_path: filePath,
          uploaded_by: user?.id,
        }]);

      if (dbError) throw dbError;

      await logAuditEvent('UPLOAD_ORDER_DOCUMENT', 'order_documents', undefined, {
        order_id: orderId,
        file_name: file.name
      });

      // Store order ID to restore after reload
      localStorage.setItem('reopenOrderDetails', orderId);

      // Refresh orders
      window.location.reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to upload document');
    }
  };

  const downloadDocument = async (filePath: string, fileName: string) => {
    try {
      const { data, error } = await supabase.storage
        .from('order-documents')
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

  const handleDownloadCertificate = async (order: Order) => {
    setGeneratingCertificate(true);
    setError(null);

    try {
      let certificateUUID = order.certificate_uuid;
      let certificatePath = order.certificate_path;

      if (certificatePath) {
        await downloadCertificateFromStorage(
          certificatePath,
          `certificate_${order.order_number}.pdf`
        );
        await logAuditEvent('DOWNLOAD_CERTIFICATE', 'orders', order.id);
        return;
      }

      if (!certificateUUID) {
        certificateUUID = await generateCertificateUUID();

        const { error: updateError } = await supabase
          .from('orders')
          .update({ certificate_uuid: certificateUUID })
          .eq('id', order.id);

        if (updateError) throw updateError;

        order.certificate_uuid = certificateUUID;
      }

      const logoImg = new Image();
      logoImg.crossOrigin = 'anonymous';
      const logoDataUrl = await new Promise<string>((resolve, reject) => {
        logoImg.onload = () => {
          const canvas = document.createElement('canvas');
          canvas.width = logoImg.width;
          canvas.height = logoImg.height;
          const ctx = canvas.getContext('2d');
          if (ctx) {
            ctx.drawImage(logoImg, 0, 0);
            resolve(canvas.toDataURL('image/png'));
          } else {
            resolve('');
          }
        };
        logoImg.onerror = () => resolve('');
        logoImg.src = '/gpcertlogo.png';
      });

      const pdfBlob = await generateCertificatePDF(order, logoDataUrl);

      certificatePath = await storeCertificate(order.id, certificateUUID, pdfBlob);

      const url = URL.createObjectURL(pdfBlob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `certificate_${order.order_number}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      await logAuditEvent('GENERATE_CERTIFICATE', 'orders', order.id, {
        certificate_uuid: certificateUUID,
      });

      setOrders(orders.map(o =>
        o.id === order.id
          ? { ...o, certificate_uuid: certificateUUID, certificate_path: certificatePath }
          : o
      ));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to generate certificate');
      console.error('Certificate generation error:', err);
    } finally {
      setGeneratingCertificate(false);
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'pending': return 'bg-yellow-100 text-yellow-800';
      case 'processing': return 'bg-blue-100 text-blue-800';
      case 'completed': return 'bg-green-100 text-green-800';
      case 'results_approved': return 'bg-green-100 text-green-800';
      case 'sample_shipped': return 'bg-indigo-100 text-indigo-800';
      case 'sample_rejected': return 'bg-red-100 text-red-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const getFinancialStatusColor = (status: string) => {
    switch (status) {
      case 'pending_approval': return 'bg-yellow-100 text-yellow-800';
      case 'approved': return 'bg-green-100 text-green-800';
      case 'rejected': return 'bg-red-100 text-red-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const calculateOrderTotal = (order: Order) => {
    return order.test_suite.test_suite_items.reduce((total, item) => total + item.tests.cost, 0);
  };

  const calculateTotalSampleSize = (order: Order) => {
    if (!order.test_suite) return 0;

    return order.test_suite.test_suite_items.reduce((total, item) => {
      return total + (item.tests.min_sample_size || 0);
    }, 0);
  };

  const getFilteredOrders = () => {
    let filtered = orders;

    if (activeTab !== 'all') {
      if (activeTab === 'processing' && userRole === 'customer') {
        filtered = filtered.filter(order => order.status === 'processing' || order.status === 'completed');
      } else {
        filtered = filtered.filter(order => order.status === activeTab);
      }
    }

    if (sourceFilter !== 'all') {
      filtered = filtered.filter(order => order.order_source === sourceFilter);
    }

    return filtered;
  };

  const getOrderCountByStatus = (status: string) => {
    if (status === 'all') return orders.length;
    if (status === 'processing' && userRole === 'customer') {
      return orders.filter(order => order.status === 'processing' || order.status === 'completed').length;
    }
    return orders.filter(order => order.status === status).length;
  };

  const filteredOrders = getFilteredOrders();
  
  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900"></div>
      </div>
    );
  }

  if (userRole === 'customer' && userStatus !== 'approved') {
    return (
      <div className="flex flex-col items-center justify-center h-64">
        <AlertCircle className="w-16 h-16 text-yellow-500 mb-4" />
        <h2 className="text-2xl font-bold text-gray-900 mb-2">Account Pending Approval</h2>
        <p className="text-gray-600 text-center">
          Your account is currently under review. You'll be able to place orders once your account is approved.
        </p>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="mb-8">
        <div className="flex justify-between items-center mb-4">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Lab Orders</h1>
            <p className="mt-2 text-gray-600">
              Manage and track laboratory test orders through their lifecycle.
            </p>
          </div>
          {userRole === 'customer' && userStatus === 'approved' && (
            <button
              onClick={() => setShowNewOrderModal(true)}
              className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors"
            >
              <PlusCircle className="w-5 h-5" />
              New Lab Order
            </button>
          )}
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded mb-6">
            {error}
          </div>
        )}

        <div className="flex border-b border-gray-200">
          <button
            onClick={() => setActiveTab('all')}
            className={`px-6 py-3 text-sm font-medium flex items-center gap-2 ${
              activeTab === 'all'
                ? 'border-b-2 border-blue-500 text-blue-600'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            <List className="h-4 w-4" />
            All Orders
            <span className={`ml-1 px-2 py-0.5 rounded-full text-xs ${
              activeTab === 'all' ? 'bg-blue-100 text-blue-600' : 'bg-gray-100 text-gray-600'
            }`}>
              {getOrderCountByStatus('all')}
            </span>
          </button>
          <button
            onClick={() => setActiveTab('pending')}
            className={`px-6 py-3 text-sm font-medium flex items-center gap-2 ${
              activeTab === 'pending'
                ? 'border-b-2 border-blue-500 text-blue-600'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            <Clock className="h-4 w-4" />
            Pending
            <span className={`ml-1 px-2 py-0.5 rounded-full text-xs ${
              activeTab === 'pending' ? 'bg-blue-100 text-blue-600' : 'bg-gray-100 text-gray-600'
            }`}>
              {getOrderCountByStatus('pending')}
            </span>
          </button>
          <button
            onClick={() => setActiveTab('sample_shipped')}
            className={`px-6 py-3 text-sm font-medium flex items-center gap-2 ${
              activeTab === 'sample_shipped'
                ? 'border-b-2 border-blue-500 text-blue-600'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            <Send className="h-4 w-4" />
            Sample Shipped
            <span className={`ml-1 px-2 py-0.5 rounded-full text-xs ${
              activeTab === 'sample_shipped' ? 'bg-blue-100 text-blue-600' : 'bg-gray-100 text-gray-600'
            }`}>
              {getOrderCountByStatus('sample_shipped')}
            </span>
          </button>
          <button
            onClick={() => setActiveTab('processing')}
            className={`px-6 py-3 text-sm font-medium flex items-center gap-2 ${
              activeTab === 'processing'
                ? 'border-b-2 border-blue-500 text-blue-600'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            <RefreshCw className="h-4 w-4" />
            Processing
            <span className={`ml-1 px-2 py-0.5 rounded-full text-xs ${
              activeTab === 'processing' ? 'bg-blue-100 text-blue-600' : 'bg-gray-100 text-gray-600'
            }`}>
              {getOrderCountByStatus('processing')}
            </span>
          </button>
          {userRole !== 'customer' && (
            <button
              onClick={() => setActiveTab('completed')}
              className={`px-6 py-3 text-sm font-medium flex items-center gap-2 ${
                activeTab === 'completed'
                  ? 'border-b-2 border-blue-500 text-blue-600'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              <CheckCircle className="h-4 w-4" />
              Completed
              <span className={`ml-1 px-2 py-0.5 rounded-full text-xs ${
                activeTab === 'completed' ? 'bg-blue-100 text-blue-600' : 'bg-gray-100 text-gray-600'
              }`}>
                {getOrderCountByStatus('completed')}
              </span>
            </button>
          )}
          <button
            onClick={() => setActiveTab('results_approved')}
            className={`px-6 py-3 text-sm font-medium flex items-center gap-2 ${
              activeTab === 'results_approved'
                ? 'border-b-2 border-blue-500 text-blue-600'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            <Award className="h-4 w-4" />
            {userRole === 'customer' ? 'Ready' : 'Results Approved'}
            <span className={`ml-1 px-2 py-0.5 rounded-full text-xs ${
              activeTab === 'results_approved' ? 'bg-blue-100 text-blue-600' : 'bg-gray-100 text-gray-600'
            }`}>
              {getOrderCountByStatus('results_approved')}
            </span>
          </button>
        </div>

        <div className="mt-4 flex items-center gap-3">
          <label className="text-sm font-medium text-gray-700">Filter by Source:</label>
          <select
            value={sourceFilter}
            onChange={(e) => setSourceFilter(e.target.value)}
            className="px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="all">All Sources</option>
            <option value="direct">Direct Orders</option>
            <option value="waste_management">From Processing Batches</option>
          </select>
        </div>
      </div>

      {/* New Order Modal */}
      {showNewOrderModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-md max-h-[90vh] overflow-y-auto">
            <h2 className="text-xl font-bold mb-4">Create New Order</h2>
            <form onSubmit={handleCreateOrder}>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Test Suite</label>
                  <select
                    required
                    value={orderForm.testSuiteId}
                    onChange={(e) => setOrderForm({ ...orderForm, testSuiteId: e.target.value })}
                    className="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                  >
                    <option value="">Select a test suite</option>
                    {testSuites.map((suite) => (
                      <option key={suite.id} value={suite.id}>
                        {suite.name} - LKR {suite.test_suite_items.reduce((total, item) => total + item.tests.cost, 0).toFixed(2)}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Plastic Type</label>
                  <select
                    required
                    value={orderForm.plasticTypeId}
                    onChange={(e) => setOrderForm({ ...orderForm, plasticTypeId: e.target.value })}
                    className="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                  >
                    <option value="">Select plastic type</option>
                    {plasticTypes.map((type) => (
                      <option key={type.id} value={type.id}>
                        {type.number} - {type.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Plastic Grade</label>
                  <select
                    required
                    value={orderForm.plasticGradeId}
                    onChange={(e) => setOrderForm({ ...orderForm, plasticGradeId: e.target.value })}
                    className="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                  >
                    <option value="">Select plastic grade</option>
                    {plasticGrades.map((grade) => (
                      <option key={grade.id} value={grade.id}>
                        {grade.number} - {grade.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Production Month</label>
                    <select
                      value={orderForm.productionMonth}
                      onChange={(e) => setOrderForm({ ...orderForm, productionMonth: e.target.value })}
                      className="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                    >
                      <option value="">Select month</option>
                      {Array.from({ length: 12 }, (_, i) => (
                        <option key={i + 1} value={i + 1}>
                          {new Date(0, i).toLocaleString('default', { month: 'long' })}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Production Year</label>
                    <select
                      value={orderForm.productionYear}
                      onChange={(e) => setOrderForm({ ...orderForm, productionYear: e.target.value })}
                      className="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                    >
                      <option value="">Select year</option>
                      {Array.from({ length: 10 }, (_, i) => {
                        const year = new Date().getFullYear() - i;
                        return (
                          <option key={year} value={year}>
                            {year}
                          </option>
                        );
                      })}
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Batch Number</label>
                  <input
                    type="text"
                    value={orderForm.batchNumber}
                    onChange={(e) => setOrderForm({ ...orderForm, batchNumber: e.target.value })}
                    className="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                    placeholder="Optional batch number"
                  />
                </div>
              </div>

              <div className="mt-6 flex justify-end space-x-3">
                <button
                  type="button"
                  onClick={() => setShowNewOrderModal(false)}
                  className="px-4 py-2 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
                >
                  Create Order
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Result Entry Modal */}
      {showResultModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-[60]">
          <div className="bg-white rounded-lg p-6 w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <h2 className="text-xl font-bold mb-4">Enter Test Results</h2>
            {(() => {
              const order = orders.find(o => o.id === showResultModal);
              if (!order) return null;

              return (
                <div className="space-y-4">
                  {order.test_suite.test_suite_items.map((item) => {
                    const existingResult = order.order_results.find(r => r.test_id === item.tests.id);
                    return (
                      <div key={item.tests.id} className="border rounded-lg p-4">
                        <h3 className="font-medium text-gray-900 mb-2">{item.tests.name}</h3>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Result</label>
                            <input
                              type="text"
                              value={resultForm[item.tests.id] ?? ''}
                              onChange={(e) => setResultForm({ ...resultForm, [item.tests.id]: e.target.value })}
                              className="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                              placeholder={`Enter result in ${item.tests.unit_of_measure}`}
                            />
                          </div>
                          <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
                            <input
                              type="text"
                              value={resultNotes[item.tests.id] ?? ''}
                              onChange={(e) => setResultNotes({ ...resultNotes, [item.tests.id]: e.target.value })}
                              className="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                              placeholder="Optional notes"
                            />
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              );
            })()}

            <div className="mt-6 flex justify-end space-x-3">
              <button
                onClick={() => {
                  const orderId = showResultModal;
                  setShowResultModal(null);
                  setResultForm({});
                  setResultNotes({});
                  if (orderId) {
                    const order = orders.find(o => o.id === orderId);
                    if (order) {
                      setViewingOrder(order);
                    }
                  }
                }}
                className="px-4 py-2 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={() => showResultModal && handleResultSubmit(showResultModal)}
                className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
              >
                Save Results
              </button>
            </div>
          </div>
        </div>
      )}

      {/* QA Approval Modal */}
      {showQAModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-[60]">
          <div className="bg-white rounded-lg p-6 w-full max-w-md">
            <h2 className="text-xl font-bold mb-4">QA Approval</h2>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  QA Notes *
                </label>
                <textarea
                  value={qaApprovalNotes}
                  onChange={(e) => setQAApprovalNotes(e.target.value)}
                  placeholder="Add QA review notes..."
                  rows={4}
                  className="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                  required
                />
              </div>
            </div>
            <div className="mt-6 flex justify-end space-x-3">
              <button
                onClick={() => {
                  const orderId = showQAModal;
                  setShowQAModal(null);
                  setQAApprovalNotes('');
                  if (orderId) {
                    const order = orders.find(o => o.id === orderId);
                    if (order) {
                      setViewingOrder(order);
                    }
                  }
                }}
                className="px-4 py-2 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50"
                disabled={processingQA}
              >
                Cancel
              </button>
              <button
                onClick={() => showQAModal && handleQAApproval(showQAModal, 'rejected')}
                disabled={!qaApprovalNotes.trim() || processingQA}
                className="px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
              >
                <XCircle className="w-4 h-4" />
                {processingQA ? 'Processing...' : 'Reject'}
              </button>
              <button
                onClick={() => showQAModal && handleQAApproval(showQAModal, 'approved')}
                disabled={!qaApprovalNotes.trim() || processingQA}
                className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
              >
                <CheckCircle className="w-4 h-4" />
                {processingQA ? 'Processing...' : 'Approve'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {showDeleteModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg p-6 max-w-md w-full">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Confirm Delete</h3>
            <p className="text-gray-700 mb-6">Are you sure you want to delete this order? This action cannot be undone.</p>
            <div className="flex justify-end space-x-3">
              <button
                onClick={() => setShowDeleteModal(null)}
                className="px-4 py-2 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={() => handleDeleteOrder(showDeleteModal)}
                className="px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Shipping Details Modal */}
      {showShippingModal && selectedOrderForShipping && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-[60]">
          <div className="bg-white rounded-lg p-6 w-full max-w-md max-h-[90vh] overflow-y-auto">
            <h2 className="text-xl font-bold mb-4">Ship Sample for Order #{selectedOrderForShipping.order_number}</h2>
            <form onSubmit={(e) => { e.preventDefault(); handleShipSampleSubmit(); }}>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Number of Samples</label>
                  <div className="flex items-center border border-gray-300 rounded-md shadow-sm">
                    <button
                      type="button"
                      onClick={() => setShippingFormData(prev => ({ ...prev, numberOfSamples: Math.max(0, prev.numberOfSamples - 1) }))}
                      className="p-2 text-gray-600 hover:bg-gray-100 rounded-l-md"
                    >
                      -
                    </button>
                    <input
                      type="number"
                      name="numberOfSamples"
                      value={shippingFormData.numberOfSamples}
                      onChange={handleShippingFormChange}
                      className="flex-1 text-center border-none focus:ring-0 focus:outline-none"
                      min="0"
                      required
                    />
                    <button
                      type="button"
                      onClick={() => setShippingFormData(prev => ({ ...prev, numberOfSamples: prev.numberOfSamples + 1 }))}
                      className="p-2 text-gray-600 hover:bg-gray-100 rounded-r-md"
                    >
                      +
                    </button>
                  </div>
                  {shippingFormErrors.numberOfSamples && (
                    <p className="mt-1 text-sm text-red-600">{shippingFormErrors.numberOfSamples}</p>
                  )}
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Total Sample Weight (Kgs)</label>
                  <input
                    type="number"
                    name="shippedWeight"
                    step="0.01"
                    value={shippingFormData.shippedWeight}
                    onChange={handleShippingFormChange}
                    className="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                    required
                  />
                  <p className="mt-1 text-sm text-gray-500">
                    Required: {calculateTotalSampleSize(selectedOrderForShipping)} Kgs
                  </p>
                  {shippingFormErrors.shippedWeight && (
                    <p className="mt-1 text-sm text-red-600">{shippingFormErrors.shippedWeight}</p>
                  )}
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Shipping Notes</label>
                  <textarea
                    name="shippingNotes"
                    value={shippingFormData.shippingNotes}
                    onChange={handleShippingFormChange}
                    rows={3}
                    className="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                    required
                  />
                  {shippingFormErrors.shippingNotes && (
                    <p className="mt-1 text-sm text-red-600">{shippingFormErrors.shippingNotes}</p>
                  )}
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Shipping Date</label>
                  <input
                    type="date"
                    name="shippingDate"
                    value={shippingFormData.shippingDate}
                    onChange={handleShippingFormChange}
                    className="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                    required
                  />
                  {shippingFormErrors.shippingDate && (
                    <p className="mt-1 text-sm text-red-600">{shippingFormErrors.shippingDate}</p>
                  )}
                </div>
              </div>

              <div className="mt-6 flex justify-end space-x-3">
                <button
                  type="button"
                  onClick={() => {
                    const order = selectedOrderForShipping;
                    setShowShippingModal(false);
                    setSelectedOrderForShipping(null);
                    setShippingFormData({ numberOfSamples: 0, shippedWeight: 0, shippingNotes: '', shippingDate: '' });
                    setShippingFormErrors({});
                    if (order) {
                      setViewingOrder(order);
                    }
                  }}
                  className="px-4 py-2 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={!validateShippingForm(selectedOrderForShipping).isValid}
                  className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Ship Sample
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Sample Inspection Modal */}
      {showInspectionModal && selectedOrderForInspection && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-[60]">
          <div className="bg-white rounded-lg p-6 w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <h2 className="text-xl font-bold mb-4">
              Sample Inspection for Order #{selectedOrderForInspection.order_number}
            </h2>

            <div className="space-y-4">
              {/* Photo Upload Section */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Sample Photo (Optional)
                  <span className="text-gray-500 font-normal ml-2">- Document sample condition</span>
                </label>
                <div className="mt-2">
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    onChange={handlePhotoSelection}
                    className="block w-full text-sm text-gray-500
                      file:mr-4 file:py-2 file:px-4
                      file:rounded-md file:border-0
                      file:text-sm file:font-semibold
                      file:bg-blue-50 file:text-blue-700
                      hover:file:bg-blue-100
                      cursor-pointer"
                    disabled={processingInspection || uploadingPhoto}
                  />
                  <p className="mt-1 text-xs text-gray-500">
                    JPG, PNG, or WebP. Maximum file size: 5MB
                  </p>
                </div>

                {/* Photo Preview */}
                {inspectionPhotoPreview && (
                  <div className="mt-3 relative">
                    <img
                      src={inspectionPhotoPreview}
                      alt="Sample preview"
                      className="w-full h-48 object-cover rounded-lg border border-gray-300"
                    />
                    <button
                      onClick={() => {
                        setInspectionPhoto(null);
                        setInspectionPhotoPreview(null);
                      }}
                      className="absolute top-2 right-2 p-1 bg-red-600 text-white rounded-full hover:bg-red-700"
                      disabled={processingInspection || uploadingPhoto}
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                )}
              </div>

              {/* Inspection Notes */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Inspection Notes *
                </label>
                <textarea
                  value={inspectionNotes}
                  onChange={(e) => setInspectionNotes(e.target.value)}
                  placeholder="Describe the sample condition, quality, quantity, packaging... (minimum 10 characters)"
                  rows={5}
                  className="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                  required
                  disabled={processingInspection || uploadingPhoto}
                />
                <div className="mt-1 flex justify-between items-center">
                  <p className="text-xs text-gray-500">
                    Minimum 10 characters, recommended 50-500
                  </p>
                  <p className={`text-xs font-medium ${
                    inspectionNotes.length < 10 ? 'text-red-600' :
                    inspectionNotes.length < 50 ? 'text-yellow-600' :
                    inspectionNotes.length > 500 ? 'text-orange-600' :
                    'text-green-600'
                  }`}>
                    {inspectionNotes.length} characters
                  </p>
                </div>
              </div>

              {/* Action Selection Info */}
              {inspectionAction && (
                <div className={`p-3 rounded-lg ${
                  inspectionAction === 'accept' ? 'bg-green-50 border border-green-200' : 'bg-red-50 border border-red-200'
                }`}>
                  <p className={`text-sm font-medium ${
                    inspectionAction === 'accept' ? 'text-green-800' : 'text-red-800'
                  }`}>
                    {inspectionAction === 'accept' ? (
                      <>✓ Sample will be accepted and order moved to processing</>
                    ) : (
                      <>✗ Sample will be rejected and order returned to pending</>
                    )}
                  </p>
                </div>
              )}
            </div>

            {/* Action Buttons */}
            <div className="mt-6 flex justify-end space-x-3">
              <button
                onClick={() => {
                  const order = selectedOrderForInspection;
                  setShowInspectionModal(false);
                  setSelectedOrderForInspection(null);
                  setInspectionAction(null);
                  setInspectionNotes('');
                  setInspectionPhoto(null);
                  setInspectionPhotoPreview(null);
                  if (order) {
                    setViewingOrder(order);
                  }
                }}
                className="px-4 py-2 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50"
                disabled={processingInspection || uploadingPhoto}
              >
                Cancel
              </button>
              {inspectionAction === 'reject' && (
                <button
                  onClick={handleSampleInspection}
                  disabled={inspectionNotes.trim().length < 10 || processingInspection || uploadingPhoto}
                  className="px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                >
                  <XCircle className="w-4 h-4" />
                  {processingInspection ? 'Processing...' : 'Reject Sample'}
                </button>
              )}
              {inspectionAction === 'accept' && (
                <button
                  onClick={handleSampleInspection}
                  disabled={inspectionNotes.trim().length < 10 || processingInspection || uploadingPhoto}
                  className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                >
                  <CheckCircle className="w-4 h-4" />
                  {processingInspection ? 'Processing...' : 'Accept Sample'}
                </button>
              )}
            </div>

            {uploadingPhoto && (
              <div className="mt-3 text-center text-sm text-blue-600">
                Uploading photo...
              </div>
            )}
          </div>
        </div>
      )}

      {/* Completion Notes Modal */}
      {showCompletionNotesModal && selectedOrderForCompletion && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-[60]">
          <div className="bg-white rounded-lg p-6 w-full max-w-md">
            <h2 className="text-xl font-bold mb-4">Mark Order as Completed</h2>
            <p className="text-sm text-gray-600 mb-4">
              Order #{selectedOrderForCompletion.order_number}
            </p>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Completion Notes *
                </label>
                <textarea
                  value={completionNotes}
                  onChange={(e) => setCompletionNotes(e.target.value)}
                  placeholder="Provide notes explaining why this order is being marked as completed..."
                  rows={4}
                  className="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                  required
                />
                <p className="mt-1 text-xs text-gray-500">
                  As a {userRole}, you must provide notes when marking orders as completed.
                </p>
              </div>
            </div>
            <div className="mt-6 flex justify-end space-x-3">
              <button
                onClick={() => {
                  const order = selectedOrderForCompletion;
                  setShowCompletionNotesModal(false);
                  setSelectedOrderForCompletion(null);
                  setCompletionNotes('');
                  if (order) {
                    setViewingOrder(order);
                  }
                }}
                className="px-4 py-2 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50"
                disabled={processingCompletion}
              >
                Cancel
              </button>
              <button
                onClick={() => handleMarkCompleted(selectedOrderForCompletion, completionNotes)}
                disabled={!completionNotes.trim() || processingCompletion}
                className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
              >
                <CheckCircle className="w-4 h-4" />
                {processingCompletion ? 'Processing...' : 'Mark Completed'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Orders Table */}
      <div className="bg-white rounded-lg shadow-md overflow-hidden">
        {filteredOrders.length === 0 ? (
          <div className="text-center py-12">
            <Package className="w-12 h-12 text-gray-400 mx-auto mb-4" />
            <p className="text-gray-500">
              {activeTab === 'all'
                ? 'No orders found.'
                : activeTab === 'results_approved'
                  ? (userRole === 'customer' ? 'No ready orders found.' : 'No results approved orders found.')
                  : `No ${activeTab.replace('_', ' ')} orders found.`
              }
            </p>
            {userRole === 'customer' && userStatus === 'approved' && activeTab === 'all' && (
              <button
                onClick={() => setShowNewOrderModal(true)}
                className="mt-4 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
              >
                Create Your First Order
              </button>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Order Number
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Batch Number
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Material
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    {activeTab === 'sample_shipped' ? 'Shipped Date' : 'Date'}
                  </th>
                  {userRole !== 'customer' && (
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Customer
                    </th>
                  )}
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Test Suite
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Status
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {filteredOrders.map((order) => (
                  <tr key={order.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 text-sm text-gray-500">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-gray-900">{order.order_number}</span>
                          {order.order_source === 'waste_management' && (
                            <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-teal-100 text-teal-800" title="Order created from processing batch">
                              <Beaker className="h-3 w-3 mr-1" />
                              Batch
                            </span>
                          )}
                        </div>
                        <div className="text-xs text-gray-500">{new Date(order.created_at).toLocaleDateString()}</div>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {order.batch_number || 'N/A'}
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-500">
                      <div>
                        <div className="font-medium text-gray-900">Type: {order.plastic_type.number} - {order.plastic_type.name}</div>
                        <div className="text-xs text-gray-500">Grade: {order.plastic_grade.number} - {order.plastic_grade.name}</div>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {activeTab === 'sample_shipped'
                        ? (order.shipping_date ? new Date(order.shipping_date).toLocaleDateString() : 'N/A')
                        : new Date(order.created_at).toLocaleDateString()
                      }
                    </td>
                    {userRole !== 'customer' && (
                      <td className="px-6 py-4 text-sm text-gray-500">
                        <div>
                          <div className="font-medium text-gray-900">{order.customer?.full_name || 'N/A'}</div>
                          <div className="text-xs text-gray-500">{order.customer?.customer_profile?.business_name || 'N/A'}</div>
                        </div>
                      </td>
                    )}
                    <td className="px-6 py-4 text-sm text-gray-500">
                      <div>
                        <div className="font-medium text-gray-900">{order.test_suite.name}</div>
                        <div className="text-xs text-gray-500">{order.test_suite.test_suite_items.length} tests</div>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm">
                      <div className="space-y-1">
                        <div className="flex items-center gap-1">
                          <span className={`inline-block px-2 py-1 text-xs rounded-full ${getStatusColor(order.status)}`}>
                            {order.status.replace('_', ' ').toUpperCase()}
                          </span>
                          {order.qa_approval_status === 'rejected' && order.status === 'processing' && (
                            <AlertCircle className="w-3 h-3 text-orange-600" title="Returned after QA rejection" />
                          )}
                        </div>
                        {userRole !== 'customer' && (
                          <span className={`inline-block px-2 py-1 text-xs rounded-full ${getFinancialStatusColor(order.financial_status)}`}>
                            Finance: {order.financial_status.replace('_', ' ').toUpperCase()}
                          </span>
                        )}
                        {order.qa_approval_status && (
                          <span className={`inline-block px-2 py-1 text-xs rounded-full ${
                            order.qa_approval_status === 'approved' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                          }`}>
                            QA: {order.qa_approval_status.toUpperCase()}
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      <div className="flex items-center space-x-3">
                        <button
                          onClick={() => setViewingOrder(order)}
                          className="text-gray-600 hover:text-gray-900"
                          title="View Details"
                        >
                          <Eye className="h-4 w-4" />
                        </button>
                        {((userRole === 'customer' || userRole === 'admin') &&
                          order.status === 'pending' && order.financial_status === 'pending_approval') && (
                          <button
                            onClick={() => setShowDeleteModal(order.id)}
                            className="text-red-600 hover:text-red-900"
                            title="Delete"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
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

      {/* View Order Modal */}
      {viewingOrder && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4" onClick={(e) => {
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

            <div className="px-6 py-4">
              <div className="space-y-6">
                <div className="space-y-2">
                  <div className="flex flex-wrap gap-2">
                    <span className={`px-3 py-1 text-xs rounded-full ${getStatusColor(viewingOrder.status)}`}>
                      Status: {viewingOrder.status.replace('_', ' ').toUpperCase()}
                    </span>
                    {userRole !== 'customer' && (
                      <span className={`px-3 py-1 text-xs rounded-full ${getFinancialStatusColor(viewingOrder.financial_status)}`}>
                        Finance: {viewingOrder.financial_status.replace('_', ' ').toUpperCase()}
                      </span>
                    )}
                    {viewingOrder.qa_approval_status && (
                      <span className={`px-3 py-1 text-xs rounded-full ${
                        viewingOrder.qa_approval_status === 'approved' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                      }`}>
                        QA: {viewingOrder.qa_approval_status.toUpperCase()}
                      </span>
                    )}
                  </div>
                  {viewingOrder.qa_approval_status === 'rejected' && viewingOrder.status === 'processing' && (
                    <div className="flex items-center gap-2 text-xs text-orange-700 bg-orange-50 px-3 py-2 rounded-md border border-orange-200">
                      <AlertCircle className="w-4 h-4 flex-shrink-0" />
                      <span className="font-medium">Order returned to processing after QA rejection</span>
                    </div>
                  )}
                </div>

                {/* Dual-Approval Status Section */}
                {userRole !== 'customer' && (
                  <div className="bg-gradient-to-r from-blue-50 to-teal-50 rounded-lg p-4 border border-blue-200">
                    <h3 className="text-sm font-semibold text-gray-900 mb-3 flex items-center gap-2">
                      <CheckCircle className="w-5 h-5 text-blue-600" />
                      Approval Status
                    </h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {/* Sample Inspection Approval */}
                      <div className="bg-white rounded-lg p-3 border border-gray-200">
                        <div className="flex items-start justify-between mb-2">
                          <span className="text-xs font-medium text-gray-600">Sample Inspection</span>
                          {viewingOrder.sample_inspection_status === 'accepted' ? (
                            <CheckCircle className="w-5 h-5 text-green-600" />
                          ) : viewingOrder.sample_inspection_status === 'rejected' ? (
                            <XCircle className="w-5 h-5 text-red-600" />
                          ) : (
                            <Clock className="w-5 h-5 text-yellow-600" />
                          )}
                        </div>
                        <div className={`px-2 py-1 rounded-full text-xs font-medium inline-block ${
                          viewingOrder.sample_inspection_status === 'accepted'
                            ? 'bg-green-100 text-green-800'
                            : viewingOrder.sample_inspection_status === 'rejected'
                            ? 'bg-red-100 text-red-800'
                            : 'bg-yellow-100 text-yellow-800'
                        }`}>
                          {viewingOrder.sample_inspection_status === 'accepted'
                            ? 'Accepted'
                            : viewingOrder.sample_inspection_status === 'rejected'
                            ? 'Rejected'
                            : 'Pending Inspection'}
                        </div>
                        {viewingOrder.sample_inspection_date && (
                          <p className="text-xs text-gray-500 mt-2">
                            {new Date(viewingOrder.sample_inspection_date).toLocaleString()}
                          </p>
                        )}
                        {viewingOrder.inspector && (
                          <p className="text-xs text-gray-600 mt-1">
                            By: {viewingOrder.inspector.full_name}
                          </p>
                        )}
                      </div>

                      {/* Financial Approval */}
                      <div className="bg-white rounded-lg p-3 border border-gray-200">
                        <div className="flex items-start justify-between mb-2">
                          <span className="text-xs font-medium text-gray-600">Financial Approval</span>
                          {viewingOrder.financial_status === 'approved' ? (
                            <CheckCircle className="w-5 h-5 text-green-600" />
                          ) : viewingOrder.financial_status === 'rejected' ? (
                            <XCircle className="w-5 h-5 text-red-600" />
                          ) : (
                            <Clock className="w-5 h-5 text-yellow-600" />
                          )}
                        </div>
                        <div className={`px-2 py-1 rounded-full text-xs font-medium inline-block ${
                          viewingOrder.financial_status === 'approved'
                            ? 'bg-green-100 text-green-800'
                            : viewingOrder.financial_status === 'rejected'
                            ? 'bg-red-100 text-red-800'
                            : 'bg-yellow-100 text-yellow-800'
                        }`}>
                          {viewingOrder.financial_status === 'approved'
                            ? 'Approved'
                            : viewingOrder.financial_status === 'rejected'
                            ? 'Rejected'
                            : 'Pending Approval'}
                        </div>
                        {viewingOrder.approved_at && (
                          <p className="text-xs text-gray-500 mt-2">
                            {new Date(viewingOrder.approved_at).toLocaleString()}
                          </p>
                        )}
                      </div>
                    </div>

                    {/* Processing Eligibility Indicator */}
                    <div className="mt-3 pt-3 border-t border-gray-200">
                      {viewingOrder.sample_inspection_status === 'accepted' && viewingOrder.financial_status === 'approved' ? (
                        <div className="flex items-center gap-2 text-sm">
                          <CheckCircle className="w-5 h-5 text-green-600" />
                          <span className="font-semibold text-green-800">Both Approvals Complete</span>
                          <span className="text-gray-600">- Ready for Processing</span>
                        </div>
                      ) : (
                        <div className="flex items-start gap-2 text-sm">
                          <AlertCircle className="w-5 h-5 text-yellow-600 flex-shrink-0 mt-0.5" />
                          <div>
                            <span className="font-semibold text-yellow-800">Awaiting Approvals:</span>
                            <ul className="text-gray-600 mt-1 space-y-0.5 text-xs">
                              {viewingOrder.sample_inspection_status !== 'accepted' && (
                                <li>• Sample inspection must be accepted</li>
                              )}
                              {viewingOrder.financial_status !== 'approved' && (
                                <li>• Financial approval must be granted</li>
                              )}
                            </ul>
                            <p className="text-xs text-gray-500 mt-1 italic">
                              Order will automatically transition to processing when both approvals are complete
                            </p>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-4">
                    <div>
                      <h3 className="text-sm font-medium text-gray-500 mb-2 flex items-center gap-2">
                        <User className="w-4 h-4" />
                        Customer Information
                      </h3>
                      <div className="bg-gray-50 rounded-lg p-3">
                        <p className="text-sm font-medium text-gray-900">{viewingOrder.customer?.full_name || 'N/A'}</p>
                        <p className="text-sm text-gray-600">{viewingOrder.customer?.customer_profile?.business_name || 'N/A'}</p>
                        <p className="text-sm text-gray-500">Code: {viewingOrder.customer?.customer_profile?.business_code || 'N/A'}</p>
                      </div>
                    </div>

                    <div>
                      <h3 className="text-sm font-medium text-gray-500 mb-2 flex items-center gap-2">
                        <Calendar className="w-4 h-4" />
                        Order Information
                      </h3>
                      <div className="bg-gray-50 rounded-lg p-3 space-y-1">
                        <p className="text-sm text-gray-900">Created: {new Date(viewingOrder.created_at).toLocaleDateString()}</p>
                        {viewingOrder.production_month && viewingOrder.production_year && (
                          <p className="text-sm text-gray-600">
                            Production: {viewingOrder.production_month}/{viewingOrder.production_year}
                          </p>
                        )}
                        {viewingOrder.batch_number && (
                          <p className="text-sm text-gray-600">Batch: {viewingOrder.batch_number}</p>
                        )}
                      </div>
                    </div>

                    {viewingOrder.order_source === 'waste_management' && viewingOrder.processing_batch && (
                      <div>
                        <h3 className="text-sm font-medium text-gray-500 mb-2 flex items-center gap-2">
                          <Beaker className="w-4 h-4" />
                          Source Processing Batch
                        </h3>
                        <div className="bg-teal-50 rounded-lg p-3 space-y-1 border border-teal-200">
                          <p className="text-sm font-semibold text-teal-900">
                            {viewingOrder.processing_batch.intake_batch_reference}
                          </p>
                          <p className="text-sm text-teal-700">
                            Original Weight: {viewingOrder.processing_batch.original_quantity_kg} kg
                          </p>
                          {viewingOrder.processing_batch.actual_processing_completion_date && (
                            <p className="text-sm text-teal-700">
                              Completed: {new Date(viewingOrder.processing_batch.actual_processing_completion_date).toLocaleDateString()}
                            </p>
                          )}
                          <p className="text-xs text-teal-600 italic mt-2">
                            This order was created from a completed waste management processing batch
                          </p>
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="space-y-4">
                    <div>
                      <h3 className="text-sm font-medium text-gray-500 mb-2">Materials</h3>
                      <div className="bg-gray-50 rounded-lg p-3 space-y-1">
                        <p className="text-sm text-gray-900">
                          Type: {viewingOrder.plastic_type.number} - {viewingOrder.plastic_type.name}
                        </p>
                        <p className="text-sm text-gray-900">
                          Grade: {viewingOrder.plastic_grade.number} - {viewingOrder.plastic_grade.name}
                        </p>
                      </div>
                    </div>
                  </div>
                </div>

                <div>
                  <h3 className="text-sm font-medium text-gray-500 mb-2 flex items-center gap-2">
                    <Package className="w-4 h-4" />
                    Test Suite: {viewingOrder.test_suite.name}
                  </h3>
                  <div className="bg-gray-50 rounded-lg p-4">
                    <div className="space-y-2">
                      {viewingOrder.test_suite.test_suite_items.map((item, index) => {
                        const result = viewingOrder.order_results.find(r => r.test_id === item.tests.id);
                        return (
                          <div key={index} className="flex justify-between items-start text-sm border-b border-gray-200 pb-2 last:border-0 last:pb-0">
                            <div className="flex-1">
                              <span className="font-medium text-gray-700">{item.tests.name}</span>
                              {item.tests.min_sample_size && (
                                <div className="text-xs text-gray-500 mt-0.5">
                                  Min sample: {item.tests.min_sample_size} Kgs
                                </div>
                              )}
                              {result && (
                                <div className="text-xs text-gray-500 mt-1">
                                  Result: {result.result || 'Pending'}
                                  {result.approval_status !== 'pending' && (
                                    <span className={`ml-2 px-1 py-0.5 rounded text-xs ${
                                      result.approval_status === 'approved'
                                        ? 'bg-green-100 text-green-800'
                                        : 'bg-red-100 text-red-800'
                                    }`}>
                                      {result.approval_status}
                                    </span>
                                  )}
                                  {result.notes && (
                                    <div className="text-xs text-gray-500 mt-1">Notes: {result.notes}</div>
                                  )}
                                </div>
                              )}
                            </div>
                            <span className="font-medium text-gray-900 ml-4">LKR {item.tests.cost.toFixed(2)}</span>
                          </div>
                        );
                      })}
                      <div className="border-t pt-3 mt-3">
                        <div className="flex justify-between items-center text-sm mb-1">
                          <span className="font-medium">Total Sample Required:</span>
                          <span className="font-medium text-blue-600">{calculateTotalSampleSize(viewingOrder)} Kgs</span>
                        </div>
                        <div className="flex justify-between items-center font-semibold text-base">
                          <span>Total Cost:</span>
                          <span className="text-green-600">LKR {calculateOrderTotal(viewingOrder).toFixed(2)}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                {(viewingOrder.shipped_number_of_samples || viewingOrder.shipped_weight_kgs || viewingOrder.shipping_notes || viewingOrder.shipping_date) && (
                  <div>
                    <h3 className="text-sm font-medium text-gray-500 mb-2">Shipping Details</h3>
                    <div className="bg-blue-50 rounded-lg p-3 space-y-1">
                      {viewingOrder.shipped_number_of_samples && (
                        <p className="text-sm text-blue-900">Samples: {viewingOrder.shipped_number_of_samples}</p>
                      )}
                      {viewingOrder.shipped_weight_kgs && (
                        <p className="text-sm text-blue-900">Weight: {viewingOrder.shipped_weight_kgs} kg</p>
                      )}
                      {viewingOrder.shipping_date && (
                        <p className="text-sm text-blue-900">
                          Shipped: {new Date(viewingOrder.shipping_date).toLocaleDateString()}
                        </p>
                      )}
                      {viewingOrder.shipping_notes && (
                        <p className="text-sm text-blue-900">Notes: {viewingOrder.shipping_notes}</p>
                      )}
                    </div>
                  </div>
                )}

                {/* Sample Inspection Details */}
                {(viewingOrder.sample_inspection_status || viewingOrder.rejection_notes || viewingOrder.rejection_date) && (
                  <div>
                    <h3 className="text-sm font-medium text-gray-500 mb-2">
                      {viewingOrder.sample_inspection_status ? 'Sample Inspection' : 'Rejection Details'}
                    </h3>
                    <div className={`rounded-lg p-4 space-y-3 ${
                      viewingOrder.sample_inspection_status === 'accepted' ? 'bg-green-50 border border-green-200' :
                      viewingOrder.sample_inspection_status === 'rejected' ? 'bg-red-50 border border-red-200' :
                      'bg-red-50'
                    }`}>
                      {/* New inspection system */}
                      {viewingOrder.sample_inspection_status && (
                        <>
                          <div className="flex items-center gap-2">
                            {viewingOrder.sample_inspection_status === 'accepted' ? (
                              <CheckCircle className="w-5 h-5 text-green-700" />
                            ) : (
                              <XCircle className="w-5 h-5 text-red-700" />
                            )}
                            <span className={`font-semibold text-sm ${
                              viewingOrder.sample_inspection_status === 'accepted' ? 'text-green-900' : 'text-red-900'
                            }`}>
                              Sample {viewingOrder.sample_inspection_status === 'accepted' ? 'Accepted' : 'Rejected'}
                            </span>
                          </div>

                          {viewingOrder.sample_inspection_date && (
                            <p className={`text-sm ${
                              viewingOrder.sample_inspection_status === 'accepted' ? 'text-green-900' : 'text-red-900'
                            }`}>
                              <span className="font-medium">Date:</span> {new Date(viewingOrder.sample_inspection_date).toLocaleDateString()} at {new Date(viewingOrder.sample_inspection_date).toLocaleTimeString()}
                            </p>
                          )}

                          {viewingOrder.inspector && (
                            <p className={`text-sm ${
                              viewingOrder.sample_inspection_status === 'accepted' ? 'text-green-900' : 'text-red-900'
                            }`}>
                              <span className="font-medium">Inspected by:</span> {viewingOrder.inspector.full_name} ({viewingOrder.inspector.role})
                            </p>
                          )}

                          {viewingOrder.sample_inspection_notes && (
                            <div className={`text-sm ${
                              viewingOrder.sample_inspection_status === 'accepted' ? 'text-green-900' : 'text-red-900'
                            }`}>
                              <span className="font-medium">Notes:</span>
                              <p className="mt-1 whitespace-pre-wrap">{viewingOrder.sample_inspection_notes}</p>
                            </div>
                          )}

                          {viewingOrder.sample_inspection_photo_path && (
                            <div>
                              <p className={`text-sm font-medium mb-2 ${
                                viewingOrder.sample_inspection_status === 'accepted' ? 'text-green-900' : 'text-red-900'
                              }`}>
                                Inspection Photo:
                              </p>
                              <img
                                src={`${supabase.storage.from('sample-inspections').getPublicUrl(viewingOrder.sample_inspection_photo_path).data.publicUrl}`}
                                alt="Sample inspection"
                                className="w-full max-w-md h-48 object-cover rounded-lg border-2 border-gray-300 cursor-pointer hover:opacity-90"
                                onClick={() => {
                                  window.open(
                                    `${supabase.storage.from('sample-inspections').getPublicUrl(viewingOrder.sample_inspection_photo_path!).data.publicUrl}`,
                                    '_blank'
                                  );
                                }}
                              />
                              <p className="text-xs text-gray-600 mt-1">Click to view full size</p>
                            </div>
                          )}
                        </>
                      )}

                      {/* Legacy rejection system (for backward compatibility) */}
                      {!viewingOrder.sample_inspection_status && (viewingOrder.rejection_date || viewingOrder.rejection_notes) && (
                        <>
                          {viewingOrder.rejection_date && (
                            <p className="text-sm text-red-900">
                              Rejected: {new Date(viewingOrder.rejection_date).toLocaleDateString()} {new Date(viewingOrder.rejection_date).toLocaleTimeString()}
                            </p>
                          )}
                          {viewingOrder.rejection_notes && (
                            <p className="text-sm text-red-900">Reason: {viewingOrder.rejection_notes}</p>
                          )}
                        </>
                      )}
                    </div>
                  </div>
                )}

                {viewingOrder.approval_notes && (
                  <div>
                    <h3 className="text-sm font-medium text-gray-500 mb-2">Finance Notes</h3>
                    <div className="bg-blue-50 rounded-lg p-3">
                      <p className="text-sm text-blue-900">{viewingOrder.approval_notes}</p>
                    </div>
                  </div>
                )}

                {viewingOrder.qa_approval_notes && (
                  <div>
                    <h3 className="text-sm font-medium text-gray-500 mb-2">
                      QA {viewingOrder.qa_approval_status === 'rejected' ? 'Rejection' : 'Approval'} Notes
                    </h3>
                    <div className={viewingOrder.qa_approval_status === 'rejected' ? 'bg-red-50 rounded-lg p-3' : 'bg-purple-50 rounded-lg p-3'}>
                      {viewingOrder.qa_approval_status === 'rejected' && viewingOrder.status === 'processing' && (
                        <div className="flex items-start gap-2 mb-2 pb-2 border-b border-red-200">
                          <XCircle className="w-4 h-4 text-red-600 mt-0.5 flex-shrink-0" />
                          <p className="text-sm font-medium text-red-900">
                            This order was rejected during QA review and has been returned to processing for corrections.
                          </p>
                        </div>
                      )}
                      <p className={viewingOrder.qa_approval_status === 'rejected' ? 'text-sm text-red-900' : 'text-sm text-purple-900'}>
                        {viewingOrder.qa_approval_notes}
                      </p>
                    </div>
                  </div>
                )}

                {viewingOrder.completion_notes && (
                  <div>
                    <h3 className="text-sm font-medium text-gray-500 mb-2">Completion Notes</h3>
                    <div className="bg-green-50 rounded-lg p-3">
                      <p className="text-sm text-green-900">{viewingOrder.completion_notes}</p>
                    </div>
                  </div>
                )}

                {statusTrail.length > 0 && (
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <h3 className="text-sm font-medium text-gray-500">Status Trail</h3>
                      <button
                        onClick={() => setShowStatusTrail(!showStatusTrail)}
                        className="relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
                        style={{ backgroundColor: showStatusTrail ? '#3B82F6' : '#D1D5DB' }}
                        role="switch"
                        aria-checked={showStatusTrail}
                        aria-label={showStatusTrail ? "Hide status trail" : "Show status trail"}
                      >
                        <span
                          className="inline-block h-4 w-4 transform rounded-full bg-white transition-transform"
                          style={{ transform: showStatusTrail ? 'translateX(1.5rem)' : 'translateX(0.25rem)' }}
                        />
                      </button>
                    </div>
                    {showStatusTrail && (
                      <div className="bg-gray-50 rounded-lg p-3 space-y-3">
                      {statusTrail.map((trail, index) => (
                        <div key={trail.id} className="border-l-2 border-blue-500 pl-3">
                          <div className="flex items-start justify-between">
                            <div className="flex-1">
                              <div className="flex items-center gap-2">
                                {trail.old_status ? (
                                  <p className="text-sm font-medium text-gray-900">
                                    {trail.old_status.replace('_', ' ').toUpperCase()} → {trail.new_status.replace('_', ' ').toUpperCase()}
                                  </p>
                                ) : (
                                  <p className="text-sm font-medium text-gray-900">
                                    {trail.new_status.replace('_', ' ').toUpperCase()}
                                  </p>
                                )}
                                <span className={`px-2 py-0.5 text-xs rounded-full ${
                                  trail.changed_by_role === 'admin' ? 'bg-red-100 text-red-800' :
                                  trail.changed_by_role === 'manager' ? 'bg-purple-100 text-purple-800' :
                                  trail.changed_by_role === 'technician' ? 'bg-blue-100 text-blue-800' :
                                  'bg-gray-100 text-gray-800'
                                }`}>
                                  {trail.changed_by_role}
                                </span>
                              </div>
                              <p className="text-xs text-gray-600 mt-1">
                                by {trail.changed_by_name || 'Unknown User'}
                              </p>
                              <p className="text-xs text-gray-500 mt-0.5">
                                {new Date(trail.created_at).toLocaleString()}
                              </p>
                              {trail.notes && (
                                <p className="text-sm text-gray-700 mt-2 italic">
                                  "{trail.notes}"
                                </p>
                              )}
                            </div>
                          </div>
                        </div>
                      ))}
                      </div>
                    )}
                  </div>
                )}

                {viewingOrder.order_documents.length > 0 && (
                  <div>
                    <h3 className="text-sm font-medium text-gray-500 mb-2">Documents</h3>
                    <div className="bg-gray-50 rounded-lg p-3 space-y-2">
                      {viewingOrder.order_documents.map((doc) => (
                        <button
                          key={doc.id}
                          onClick={() => downloadDocument(doc.file_path, doc.file_name)}
                          className="flex items-center gap-2 text-sm text-blue-600 hover:text-blue-800"
                        >
                          <FileText className="w-4 h-4" />
                          {doc.file_name}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                <div className="border-t pt-4">
                  <h3 className="text-sm font-medium text-gray-500 mb-3">Available Actions</h3>
                  <div className="flex flex-wrap gap-2">
                    {(userRole === 'admin' || userRole === 'technician') && (
                      <>
                        {viewingOrder.status === 'pending' && viewingOrder.financial_status === 'approved' && (
                          <button
                            onClick={() => {
                              handleStatusUpdate(viewingOrder.id, 'processing');
                              setViewingOrder(null);
                            }}
                            className="px-3 py-2 bg-blue-600 text-white rounded-md text-sm hover:bg-blue-700 flex items-center gap-2"
                          >
                            <RefreshCw className="w-4 h-4" />
                            Start Processing
                          </button>
                        )}

                        {viewingOrder.status === 'processing' && (
                          <>
                            <button
                              onClick={() => {
                                setShowResultModal(viewingOrder.id);
                              }}
                              className="px-3 py-2 bg-green-600 text-white rounded-md text-sm hover:bg-green-700 flex items-center gap-2"
                            >
                              <FileText className="w-4 h-4" />
                              Enter Results
                            </button>
                            <button
                              onClick={async () => {
                                const completionStatus = await fetchTestCompletionStatus(viewingOrder.id);
                                if (userRole === 'technician') {
                                  if (completionStatus?.all_completed) {
                                    await handleMarkCompleted(viewingOrder);
                                  } else {
                                    setError(`Cannot mark as completed. Only ${completionStatus?.completed_tests || 0} of ${completionStatus?.total_tests || 0} tests have results.`);
                                  }
                                } else if (userRole === 'manager' || userRole === 'admin') {
                                  setSelectedOrderForCompletion(viewingOrder);
                                  setShowCompletionNotesModal(true);
                                }
                              }}
                              disabled={userRole === 'technician' && testCompletionStatus && !testCompletionStatus.all_completed}
                              className="px-3 py-2 bg-green-600 text-white rounded-md text-sm hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                              title={
                                userRole === 'technician' && testCompletionStatus && !testCompletionStatus.all_completed
                                  ? `Complete all test results first (${testCompletionStatus.completed_tests}/${testCompletionStatus.total_tests})`
                                  : 'Mark order as completed'
                              }
                              onMouseEnter={() => fetchTestCompletionStatus(viewingOrder.id)}
                            >
                              <CheckCircle className="w-4 h-4" />
                              Mark Complete
                              {testCompletionStatus && (
                                <span className="ml-1 text-xs">
                                  ({testCompletionStatus.completed_tests}/{testCompletionStatus.total_tests})
                                </span>
                              )}
                            </button>
                          </>
                        )}

                        <label className="px-3 py-2 bg-gray-600 text-white rounded-md text-sm hover:bg-gray-700 cursor-pointer flex items-center gap-2">
                          <Upload className="w-4 h-4" />
                          Upload Document
                          <input
                            type="file"
                            className="hidden"
                            onChange={(e) => {
                              const file = e.target.files?.[0];
                              if (file) {
                                handleFileUpload(viewingOrder.id, file);
                              }
                            }}
                          />
                        </label>
                      </>
                    )}

                    {((userRole === 'customer' || userRole === 'admin') && viewingOrder.status === 'pending') && (
                      <button
                        onClick={() => {
                          setSelectedOrderForShipping(viewingOrder);
                          setShippingFormData({
                            numberOfSamples: viewingOrder.shipped_number_of_samples || 0,
                            shippedWeight: viewingOrder.shipped_weight_kgs || 0,
                            shippingNotes: viewingOrder.shipping_notes || '',
                            shippingDate: viewingOrder.shipping_date ? viewingOrder.shipping_date.split('T')[0] : '',
                          });
                          setShowShippingModal(true);
                        }}
                        className="px-3 py-2 bg-orange-600 text-white rounded-md text-sm hover:bg-orange-700 flex items-center gap-2"
                      >
                        <Package className="w-4 h-4" />
                        Ship Sample
                      </button>
                    )}

                    {((userRole === 'admin' || userRole === 'manager' || userRole === 'technician') &&
                      viewingOrder.status === 'sample_shipped' &&
                      !viewingOrder.sample_inspection_status) && (
                      <>
                        <button
                          onClick={() => {
                            setSelectedOrderForInspection(viewingOrder);
                            setInspectionAction('accept');
                            setShowInspectionModal(true);
                          }}
                          className="px-3 py-2 bg-green-600 text-white rounded-md text-sm hover:bg-green-700 flex items-center gap-2"
                        >
                          <CheckCircle className="w-4 h-4" />
                          Accept Sample
                        </button>
                        <button
                          onClick={() => {
                            setSelectedOrderForInspection(viewingOrder);
                            setInspectionAction('reject');
                            setShowInspectionModal(true);
                          }}
                          className="px-3 py-2 bg-red-600 text-white rounded-md text-sm hover:bg-red-700 flex items-center gap-2"
                        >
                          <XCircle className="w-4 h-4" />
                          Reject Sample
                        </button>
                      </>
                    )}

                    {userRole === 'manager' && viewingOrder.status === 'completed' && !viewingOrder.qa_approval_status && (
                      <button
                        onClick={() => {
                          setShowQAModal(viewingOrder.id);
                        }}
                        className="px-3 py-2 bg-purple-600 text-white rounded-md text-sm hover:bg-purple-700 flex items-center gap-2"
                      >
                        <CheckCircle className="w-4 h-4" />
                        QA Review
                      </button>
                    )}

                    <button
                      onClick={() => {
                        generateOrderLabel(viewingOrder);
                      }}
                      className="px-3 py-2 bg-indigo-600 text-white rounded-md text-sm hover:bg-indigo-700 flex items-center gap-2"
                    >
                      <Download className="w-4 h-4" />
                      Download Label
                    </button>

                    {viewingOrder.status === 'results_approved' && (
                      <button
                        onClick={() => {
                          handleDownloadCertificate(viewingOrder);
                        }}
                        disabled={generatingCertificate}
                        className="px-3 py-2 bg-green-600 text-white rounded-md text-sm hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                      >
                        {generatingCertificate ? (
                          <>
                            <RefreshCw className="w-4 h-4 animate-spin" />
                            Generating...
                          </>
                        ) : (
                          <>
                            <Award className="w-4 h-4" />
                            Download Certificate
                          </>
                        )}
                      </button>
                    )}
                  </div>
                </div>
              </div>
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