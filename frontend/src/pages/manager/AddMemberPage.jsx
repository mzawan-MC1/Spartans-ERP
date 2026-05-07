import React, { useState, useEffect, useCallback, useMemo, Fragment } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { toast } from 'sonner';
import { ArrowLeft, ArrowRight, User, Heart, Camera, CreditCard, FileText, Check, Loader2, Upload, Download, X, FileIcon, Eye, EyeOff } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import api, { membersAPI, membershipsAPI, paymentPlansAPI, agreementsAPI, paymentsAPI, programAPI, uploadAPI } from '@/lib/api';
import ManagerLayout from '@/components/ManagerLayout';

const STEPS = [
  { id: 'personal', label: 'Personal Info', icon: User },
  { id: 'medical', label: 'Medical Info', icon: Heart },
  { id: 'photo', label: 'Photo', icon: Camera },
  { id: 'membership', label: 'Membership', icon: CreditCard },
  { id: 'agreement', label: 'Agreement', icon: FileText },
  { id: 'payment', label: 'Payment', icon: CreditCard },
];

const REGISTRATION_STEPS = STEPS.filter(s => ['personal', 'photo', 'agreement'].includes(s.id));

export function AddMemberWizard({ locationId, basePath = '/manager/members', locationQuery = '' }) {
  const navigate = useNavigate();
  const { memberId } = useParams();
  const isEdit = !!memberId;
  const steps = isEdit ? STEPS : REGISTRATION_STEPS;
  
  const [currentStep, setCurrentStep] = useState(0);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [portalPassword, setPortalPassword] = useState('');
  const [updatingPortalPassword, setUpdatingPortalPassword] = useState(false);
  const [memberMeta, setMemberMeta] = useState({ primary_member_id: null, dependent_type: null });
  
  // Form data
  const [personalData, setPersonalData] = useState({
    full_name: '',
    gender: '',
    dob: '',
    phone: '',
    email: '',
    password: '',
    address: '',
  });
  
  const [emergencyContact, setEmergencyContact] = useState({
    name: '',
    phone: '',
    relation: '',
  });
  
  const [medicalData, setMedicalData] = useState({
    conditions: '',
    injuries: '',
    allergies: '',
    medications: '',
    notes: '',
    doctor_name: '',
    doctor_phone: '',
    consent: false,
  });
  
  const [photoUrl, setPhotoUrl] = useState('');
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  
  const [membershipData, setMembershipData] = useState({
    membership_id: '',
    type: 'full_access',
    program_id: '', // kept for backwards compatibility
    program_ids: [], // new array for multiple selection
    payment_plan_id: '',
    start_date: new Date().toISOString().split('T')[0],
    end_date: '',
    auto_renew: false,
  });

  // Reference data
  const [paymentPlans, setPaymentPlans] = useState([]);
  const [agreements, setAgreements] = useState([]);
  const [programs, setPrograms] = useState([]);

  useEffect(() => {
    if (membershipData.payment_plan_id && membershipData.type) {
      const plan = paymentPlans.find(p => p.plan_id === membershipData.payment_plan_id);
      if (plan && plan.membership_type && plan.membership_type !== membershipData.type) {
        setMembershipData(prev => ({ ...prev, payment_plan_id: '' }));
      }
    }
  }, [membershipData.type, membershipData.payment_plan_id, paymentPlans]);
  
  const [agreementData, setAgreementData] = useState({
    agreement_id: '',
    checkbox_agreed: false,
    signature_data: '',
    signer_name: '',
  });
  
  const [availablePaymentMethods, setAvailablePaymentMethods] = useState([]);
  const [paymentMethod, setPaymentMethod] = useState('cash');
  const [receiptInfo, setReceiptInfo] = useState('');
  const [receiptUrl, setReceiptUrl] = useState('');
  const [receiptFileName, setReceiptFileName] = useState('');
  const [uploadingReceipt, setUploadingReceipt] = useState(false);
  
  // Created data
  const [createdMember, setCreatedMember] = useState(null);
  const [createdMembership, setCreatedMembership] = useState(null);
  
  // Load existing member data for edit mode
  useEffect(() => {
    const loadMemberForEdit = async () => {
      if (!isEdit || !memberId || !locationId) return;
      try {
        setLoading(true);
        const [res, memRes, agreementsRes, paymentsRes] = await Promise.all([
          membersAPI.get(memberId, locationId),
          membershipsAPI.list(locationId, { member_id: memberId }).catch(() => ({ data: { memberships: [] } })),
          membersAPI.getSignedAgreements(memberId, locationId).catch(() => ({ data: [] })),
          paymentsAPI.list(locationId, { member_id: memberId }).catch(() => ({ data: { payments: [] } }))
        ]);
        
        const member = res.data;
        setMemberMeta({ primary_member_id: member.primary_member_id || null, dependent_type: member.dependent_type || null });
        const membershipsList = memRes.data.memberships || memRes.data || [];
        const signedAgreementsList = agreementsRes.data.signed_agreements || agreementsRes.data || [];
        const paymentsList = paymentsRes.data.payments || paymentsRes.data || [];
        
        // Populate personal data
        setPersonalData({
          full_name: member.full_name || '',
          gender: member.gender || '',
          dob: member.dob || '',
          phone: member.phone || '',
          email: member.email || '',
          address: member.address || '',
        });
        
        // Populate emergency contact
        if (member.emergency_contact) {
          setEmergencyContact({
            name: member.emergency_contact.name || '',
            phone: member.emergency_contact.phone || '',
            relation: member.emergency_contact.relation || '',
          });
        }
        
        // Populate medical data - handle both 'medical' and 'medical_info' field names
        const medicalInfo = member.medical || member.medical_info || {};
        setMedicalData({
          conditions: medicalInfo.conditions || medicalInfo.conditions_details || '',
          injuries: medicalInfo.injuries || medicalInfo.injuries_details || '',
          allergies: medicalInfo.allergies || '',
          medications: medicalInfo.medications || medicalInfo.medications_details || '',
          notes: medicalInfo.notes || '',
          doctor_name: medicalInfo.doctor_name || '',
          doctor_phone: medicalInfo.doctor_phone || '',
          consent: medicalInfo.consent || medicalInfo.medical_consent || false,
        });
        
        // Store profile photo if exists
        if (member.profile_photo_url) {
          setPhotoUrl(member.profile_photo_url);
        }

        // Populate membership data if any exists
        if (membershipsList.length > 0) {
          const m = membershipsList[0];
          setMembershipData({
            membership_id: m.membership_id,
            type: (m.type === 'kids_program' ? 'kids' : (m.type === 'dedicated_program' ? 'full_access' : (m.type || 'full_access'))),
            program_id: m.program_id || '',
            program_ids: m.program_ids || (m.program_id ? [m.program_id] : []),
            payment_plan_id: m.payment_plan_id || '',
            start_date: m.start_date ? m.start_date.split('T')[0] : new Date().toISOString().split('T')[0],
            end_date: m.end_date ? m.end_date.split('T')[0] : '',
            auto_renew: m.auto_renew || false,
          });
        }

        // Populate agreement data if any exists
        if (signedAgreementsList.length > 0) {
          const a = signedAgreementsList[0];
          setAgreementData({
            agreement_id: a.agreement_id || '',
            checkbox_agreed: true,
            signature_data: a.signature_data || '',
            signer_name: a.signer_name || member.full_name,
          });
        }

        // Populate payment data if any exists
        if (paymentsList.length > 0) {
          const p = paymentsList[0];
          setPaymentMethod(p.method || 'cash');
          setReceiptUrl(p.receipt_url || '');
          setReceiptInfo(p.receipt_info || '');
        }
        
      } catch (err) {
        console.error('Failed to load member data', err);
        toast.error('Failed to load member data');
      } finally {
        setLoading(false);
      }
    };
    loadMemberForEdit();
  }, [isEdit, memberId, locationId]);

  // Load reference data
  useEffect(() => {
    const loadData = async () => {
      if (!locationId) return;
      try {
        const [plansRes, agreementsRes, programsRes, methodsRes] = await Promise.all([
          paymentPlansAPI.list(locationId, false).catch(() => ({ data: [] })),  // Handle both array and {plans: []} structure
          agreementsAPI.list(locationId, false).catch(() => ({ data: [] })),
          programAPI.list(locationId).catch(() => ({ data: [] })),
          api.get('/payment-methods', { params: { location_id: locationId } }).catch(() => ({ data: [{ provider: 'cash', display_name: 'Cash / Manual Transfer' }] }))
        ]);
        
        // Handle API responses that might be wrapped in an object or just a direct array
        setPaymentPlans(Array.isArray(plansRes.data) ? plansRes.data : (plansRes.data?.plans || []));
        
        // Fix for agreements response which might be wrapped differently depending on the backend version
        let agreementsList = [];
        if (Array.isArray(agreementsRes.data)) {
          agreementsList = agreementsRes.data;
        } else if (agreementsRes.data?.agreements) {
          agreementsList = agreementsRes.data.agreements;
        } else if (agreementsRes.data?.items) {
          agreementsList = agreementsRes.data.items;
        }
        setAgreements(agreementsList);
        
        // Fix for methods response which might be wrapped differently
        let methodsList = [{ provider: 'cash', display_name: 'Cash / Manual Transfer' }];
        if (Array.isArray(methodsRes.data)) {
          methodsList = methodsRes.data;
        } else if (methodsRes.data?.methods) {
          methodsList = methodsRes.data.methods;
        } else if (methodsRes.data?.items) {
          methodsList = methodsRes.data.items;
        }
        
        // Ensure cash is always available if the list is somehow empty
        if (methodsList.length === 0) {
           methodsList = [{ provider: 'cash', display_name: 'Cash / Manual Transfer' }];
        }
        setAvailablePaymentMethods(methodsList);
        
        // Filter only active programs (is_active=true and not deleted)
        let programsList = [];
        if (Array.isArray(programsRes.data)) {
          programsList = programsRes.data;
        } else if (programsRes.data?.programs) {
          programsList = programsRes.data.programs;
        } else if (programsRes.data?.items) {
          programsList = programsRes.data.items;
        }
        
        const activePrograms = programsList.filter(p => 
          p.is_active !== false && !p.deleted_at
        );
        setPrograms(activePrograms);
        
        // Set defaults
        if (agreementsList.length > 0) {
          setAgreementData(prev => ({ ...prev, agreement_id: prev.agreement_id || agreementsList[0].agreement_id }));
        }
      } catch (err) {
        console.error('Failed to load reference data', err);
      }
    };
    loadData();
  }, [locationId]);

  // Calculate end date based on payment plan
  useEffect(() => {
    if (membershipData.payment_plan_id && membershipData.start_date) {
      const plan = paymentPlans.find(p => p.plan_id === membershipData.payment_plan_id);
      if (plan) {
        const start = new Date(membershipData.start_date);
        let end = new Date(start);
        const cycle = (plan.billing_cycle || plan.billing_period || '').toLowerCase();
        switch (cycle) {
          case 'single':
          case 'daily':
          case 'per class':
            end.setDate(end.getDate() + 1);
            break;
          case 'weekly':
            end.setDate(end.getDate() + 7);
            break;
          case 'monthly':
            end.setMonth(end.getMonth() + 1);
            break;
          case 'quarterly':
          case '3 months':
            end.setMonth(end.getMonth() + 3);
            break;
          case '4 months':
            end.setMonth(end.getMonth() + 4);
            break;
          case '6 months':
            end.setMonth(end.getMonth() + 6);
            break;
          case 'yearly':
          case 'annual':
            end.setFullYear(end.getFullYear() + 1);
            break;
          default:
            // Default to monthly if unknown
            end.setMonth(end.getMonth() + 1);
        }
        setMembershipData(prev => ({ ...prev, end_date: end.toISOString().split('T')[0] }));
      }
    }
  }, [membershipData.payment_plan_id, membershipData.start_date, paymentPlans]);

  const handlePhotoUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    try {
      setUploadingPhoto(true);
      const res = await uploadAPI.upload(file);
      setPhotoUrl(res.data.url);
      toast.success('Photo uploaded');
    } catch (err) {
      toast.error('Failed to upload photo');
    } finally {
      setUploadingPhoto(false);
    }
  };

  const handleReceiptUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const allowed = ['application/pdf', 'image/png', 'image/jpeg', 'image/jpg'];
    if (!allowed.includes(file.type)) {
      toast.error('Only PDF, PNG, JPEG, or JPG files are allowed');
      return;
    }
    try {
      setUploadingReceipt(true);
      const res = await uploadAPI.upload(file);
      setReceiptUrl(res.data.url);
      setReceiptFileName(file.name);
      toast.success('Receipt uploaded');
    } catch (err) {
      toast.error('Failed to upload receipt');
    } finally {
      setUploadingReceipt(false);
    }
  };

  const handleDownloadInvoice = async (paymentId) => {
    try {
      const res = await paymentsAPI.downloadInvoice(paymentId, locationId);
      const blob = new Blob([res.data], { type: 'application/pdf' });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `invoice_${paymentId.slice(-12)}.pdf`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      a.remove();
      toast.success('Invoice downloaded');
    } catch (err) {
      toast.error('Failed to download invoice');
    }
  };

  const validateStep = () => {
    const stepId = steps[currentStep]?.id;
    switch (stepId) {
      case 'personal':
        if (!personalData.full_name.trim()) {
          toast.error('Full name is required');
          return false;
        }
        if (!personalData.gender) {
          toast.error('Gender is required');
          return false;
        }
        if (!personalData.phone.trim()) {
          toast.error('Phone is required');
          return false;
        }
        if (!personalData.email.trim()) {
          toast.error('Email is required');
          return false;
        }
        if (!isEdit) {
          if (!personalData.password || personalData.password.length < 6) {
            toast.error('Password must be at least 6 characters');
            return false;
          }
        }
        return true;
      case 'medical':
        if (!medicalData.consent) {
          toast.error('Medical consent is required');
          return false;
        }
        return true;
      case 'photo':
        return true; // Optional
      case 'membership':
        if (!membershipData.payment_plan_id) {
          toast.error('Please select a payment plan');
          return false;
        }
        return true;
      case 'agreement':
        if (!agreementData.agreement_id) {
          toast.error('Please select an agreement');
          return false;
        }
        if (!agreementData.checkbox_agreed) {
          toast.error('Agreement must be accepted');
          return false;
        }
        return true;
      case 'payment':
        return true;
      default:
        return true;
    }
  };

  const handleSetPortalPassword = async () => {
    if (!memberId) return;
    if (!portalPassword || portalPassword.length < 6) {
      toast.error('Password must be at least 6 characters');
      return;
    }
    try {
      setUpdatingPortalPassword(true);
      await membersAPI.setPortalPassword(memberId, portalPassword, locationId);
      setPortalPassword('');
      toast.success('Portal password updated');
    } catch (err) {
      toast.error(err?.response?.data?.detail || 'Failed to update portal password');
    } finally {
      setUpdatingPortalPassword(false);
    }
  };

  const handleResetPortalPassword = async () => {
    if (!memberId) return;
    try {
      setUpdatingPortalPassword(true);
      const res = await membersAPI.resetPortalPassword(memberId, locationId);
      const temp = res?.data?.temp_password;
      if (temp) toast.success(`Temporary password: ${temp}`);
      else toast.success('Password reset');
    } catch (err) {
      toast.error(err?.response?.data?.detail || 'Failed to reset portal password');
    } finally {
      setUpdatingPortalPassword(false);
    }
  };

  const handleNext = async () => {
    if (!validateStep()) return;
    const stepId = steps[currentStep]?.id;
    
    // For edit mode, handle updates differently
    if (isEdit && memberId) {
      // Save personal data updates
      if (stepId === 'personal') {
        try {
          setSubmitting(true);
          await membersAPI.update(memberId, {
            ...personalData,
            emergency_contact: emergencyContact,
            profile_photo_url: photoUrl,
          }, locationId);
          toast.success('Personal info updated');
        } catch (err) {
          toast.error(err.response?.data?.detail || 'Failed to update');
          return;
        } finally {
          setSubmitting(false);
        }
      }
      
      // Save medical data updates
      if (stepId === 'medical') {
        try {
          setSubmitting(true);
          await membersAPI.update(memberId, {
            medical: medicalData,
          }, locationId);
          toast.success('Medical info updated');
        } catch (err) {
          console.error('Failed to update medical info', err);
        } finally {
          setSubmitting(false);
        }
      }
      
      // Save photo updates
      if (stepId === 'photo' && photoUrl) {
        try {
          setSubmitting(true);
          await membersAPI.update(memberId, {
            profile_photo_url: photoUrl,
          }, locationId);
          toast.success('Photo updated');
        } catch (err) {
          console.error('Failed to update photo', err);
        } finally {
          setSubmitting(false);
        }
      }
      
      // Save membership updates
      if (stepId === 'membership' && membershipData.membership_id) {
        try {
          setSubmitting(true);
          await membershipsAPI.update(membershipData.membership_id, {
            type: membershipData.type,
            start_date: membershipData.start_date,
            end_date: membershipData.end_date,
            payment_plan_id: membershipData.payment_plan_id,
            auto_renew: membershipData.auto_renew,
          }, locationId);
          toast.success('Membership updated');
        } catch (err) {
          console.error('Failed to update membership', err);
        } finally {
          setSubmitting(false);
        }
      }

      // Save agreement updates
      if (stepId === 'agreement' && agreementData.agreement_id && agreementData.checkbox_agreed) {
        try {
          setSubmitting(true);
          await membersAPI.signAgreement(memberId, {
            agreement_id: agreementData.agreement_id,
            checkbox_agreed: agreementData.checkbox_agreed,
            signature_data: agreementData.signature_data,
            signer_name: agreementData.signer_name || personalData.full_name,
          }, locationId);
          toast.success('Agreement signed');
        } catch (err) {
          console.error('Failed to sign agreement', err);
        } finally {
          setSubmitting(false);
        }
      }
      
      if (currentStep >= steps.length - 1) {
        navigate(`${basePath}${locationQuery}`);
        return;
      }
      
      setCurrentStep(currentStep + 1);
      return;
    }
    
    if (stepId === 'agreement' && !createdMember) {
      try {
        setSubmitting(true);
        const res = await membersAPI.create({
          ...personalData,
          password: personalData.password,
          emergency_contact: emergencyContact,
          medical: medicalData,
          profile_photo_url: photoUrl,
          accept_terms: true,
          agreement_id: agreementData.agreement_id,
        }, locationId);
        setCreatedMember(res.data);
        toast.success('Member registered');
        navigate(`${basePath}/${res.data.member_id}${locationQuery}`);
        return;
      } catch (err) {
        toast.error(err.response?.data?.detail || 'Failed to register member');
        return;
      } finally {
        setSubmitting(false);
      }
    }

    setCurrentStep(prev => Math.min(prev + 1, steps.length - 1));
  };

  const handleBack = () => {
    setCurrentStep(prev => Math.max(prev - 1, 0));
  };

  const handleComplete = async () => {
    if (!createdMember || !createdMembership) {
      toast.error('Please complete all previous steps');
      return;
    }
    
    try {
      setSubmitting(true);
      const plan = paymentPlans.find(p => p.plan_id === membershipData.payment_plan_id);
      const amount = plan?.price || 0;
      
      if (paymentMethod === 'cash') {
        const cashRes = await paymentsAPI.recordCash({
          member_id: createdMember.member_id,
          membership_id: createdMembership.membership_id,
          amount,
          currency: plan?.currency || 'AED',
          receipt_info: receiptInfo,
          receipt_url: receiptUrl || null,
        }, locationId);
        
        // Manual cash payments are created as 'pending' for manager review
        toast.success('Member created. Cash payment recorded and pending review. Membership will activate upon approval.');
        
        // Auto-download invoice if needed (only for finalized payments)
        if (cashRes.data?.payment_id && ['paid', 'approved', 'completed'].includes(cashRes.data?.status)) {
          handleDownloadInvoice(cashRes.data.payment_id);
        }
        
        // Redirect to member details directly instead of trying to auto-activate
        navigate(`${basePath}/${createdMember.member_id}${locationQuery}`);
      } else {
        // Initiate online payment
        const res = await paymentsAPI.initiate({
          member_id: createdMember.member_id,
          membership_id: createdMembership.membership_id,
          method: paymentMethod,
          amount,
          currency: plan?.currency || 'AED',
          receipt_url: receiptUrl || null,
          receipt_info: receiptInfo || null,
        }, locationId);
        
        if (res.data.checkout_url || res.data.checkout_data?.checkout_url) {
          toast.success('Online Payment Initiated');
          // Give a clear feedback to the manager
          const url = res.data.checkout_url || res.data.checkout_data.checkout_url;
          window.open(url, '_blank');
          toast.info('Payment link opened in a new tab. Status will update via webhook.');
        }
      }
      
      // If it's an edit mode save from the final step
      if (isEdit && currentStep >= 4) {
        navigate(`${basePath}/${memberId}${locationQuery}`);
      } else {
        navigate(`${basePath}${locationQuery}`);
      }
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to process payment');
    } finally {
      setSubmitting(false);
    }
  };

  const handleSaveChanges = async () => {
    if (!validateStep()) return;
    
    try {
      setSubmitting(true);
      
      // Save current step data
      if (currentStep === 0) {
        await membersAPI.update(memberId, {
          ...personalData,
          emergency_contact: emergencyContact,
          profile_photo_url: photoUrl,
        }, locationId);
        toast.success('Personal info saved');
      } else if (currentStep === 1) {
        await membersAPI.update(memberId, {
          medical: medicalData,
        }, locationId);
        toast.success('Medical info saved');
      } else if (currentStep === 2 && photoUrl) {
        await membersAPI.update(memberId, {
          profile_photo_url: photoUrl,
        }, locationId);
        toast.success('Photo saved');
      } else if (currentStep === 3 && membershipData.membership_id) {
        await membershipsAPI.update(membershipData.membership_id, {
          type: membershipData.type,
          start_date: membershipData.start_date,
          end_date: membershipData.end_date,
          payment_plan_id: membershipData.payment_plan_id,
          auto_renew: membershipData.auto_renew,
        }, locationId);
        toast.success('Membership updated');
      } else if (currentStep === 4) {
        // Signing a new agreement for the member (or updating if endpoint exists, but usually we just sign a new one)
        if (agreementData.agreement_id && agreementData.checkbox_agreed) {
          await membersAPI.signAgreement(memberId, {
            agreement_id: agreementData.agreement_id,
            checkbox_agreed: agreementData.checkbox_agreed,
            signature_data: agreementData.signature_data,
            signer_name: agreementData.signer_name || personalData.full_name,
          }, locationId);
          toast.success('Agreement updated/signed');
        }
      } else if (currentStep === 5) {
        // If manager specifically wants to record a payment while editing
        const plan = paymentPlans.find(p => p.plan_id === membershipData.payment_plan_id);
        const amount = plan?.price || 0;
        
        if (paymentMethod === 'cash') {
          await paymentsAPI.recordCash({
            member_id: memberId,
            membership_id: membershipData.membership_id,
            amount,
            currency: plan?.currency || 'AED',
            receipt_info: receiptInfo,
            receipt_url: receiptUrl || null,
          }, locationId);
          toast.success('Cash payment recorded');
        } else if (paymentMethod) {
          const res = await paymentsAPI.initiate({
            member_id: memberId,
            membership_id: membershipData.membership_id,
            method: paymentMethod,
            amount,
            currency: plan?.currency || 'AED',
            receipt_url: receiptUrl || null,
            receipt_info: receiptInfo || null,
          }, locationId);
          
          if (res.data.checkout_url || res.data.checkout_data?.checkout_url) {
            toast.success('Online Payment Initiated');
            const url = res.data.checkout_url || res.data.checkout_data.checkout_url;
            window.open(url, '_blank');
            toast.info('Payment link opened in a new tab. Status will update via webhook.');
          }
        }
      }
      
      navigate(`${basePath}/${memberId}${locationQuery}`);
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to save changes');
    } finally {
      setSubmitting(false);
    }
  };

  const selectedPlan = paymentPlans.find(p => p.plan_id === membershipData.payment_plan_id);
  const stepId = steps[currentStep]?.id;
  const isDependentMember = !!memberMeta.primary_member_id;
  const effectiveDependentType = memberMeta.dependent_type;
  const allowedMembershipTypes = useMemo(() => {
    if (isDependentMember) return effectiveDependentType === 'kids' ? ['kids'] : ['full_access', 'only_gym'];
    return ['full_access', 'only_gym'];
  }, [isDependentMember, effectiveDependentType]);

  useEffect(() => {
    if (!allowedMembershipTypes.includes(membershipData.type)) {
      setMembershipData(prev => ({ ...prev, type: allowedMembershipTypes[0], payment_plan_id: '' }));
    }
  }, [allowedMembershipTypes, membershipData.type]);
  const normalizedPlans = paymentPlans.map(p => ({ ...p, membership_type: p.membership_type || 'full_access' }));
  const filteredPaymentPlans = stepId === 'membership'
    ? normalizedPlans.filter(p => (p.membership_type || 'full_access') === membershipData.type)
    : normalizedPlans;

  return (
    <div className="p-6 sm:p-8 lg:p-10 max-w-4xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center gap-4">
          <Button variant="ghost" onClick={() => navigate(`${basePath}${locationQuery}`)}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold text-white font-heading uppercase tracking-wide">
              {isEdit ? 'Edit Member' : 'Add New Member'}
            </h1>
            <p className="text-zinc-400 text-sm">
              {isEdit ? 'Click on any section above to edit. Save when done.' : 'Complete the wizard to register a new member'}
            </p>
          </div>
        </div>

        {/* Progress Steps - Clickable in edit mode */}
        <div className="flex items-start w-full mb-12 px-2 sm:px-6">
          {steps.map((step, index) => {
            const Icon = step.icon;
            const isActive = index === currentStep;
            const isComplete = index < currentStep;
            // In edit mode, allow clicking any step. In create mode, only allow clicking completed steps
            const canClick = isEdit || isComplete;
            
            return (
              <Fragment key={step.id}>
                <div className="flex flex-col items-center relative z-10 shrink-0">
                  <button
                    type="button"
                    onClick={() => canClick && setCurrentStep(index)}
                    disabled={!canClick}
                    className={`flex items-center justify-center w-10 h-10 rounded-full border-2 transition-colors ${
                      isActive ? 'border-red-500 bg-red-500/20 text-red-500' :
                      isComplete ? 'border-green-500 bg-green-500/20 text-green-500' :
                      'border-zinc-700 bg-zinc-950 text-zinc-500'
                    } ${canClick ? 'cursor-pointer hover:scale-105' : 'cursor-not-allowed'}`}
                  >
                    {isComplete ? <Check className="h-5 w-5" /> : <Icon className="h-5 w-5" />}
                  </button>
                  <button
                    type="button"
                    onClick={() => canClick && setCurrentStep(index)}
                    disabled={!canClick}
                    className={`absolute top-12 text-[10px] sm:text-xs whitespace-nowrap hidden sm:block ${
                      isActive ? 'text-red-500 font-medium' : 
                      isComplete ? 'text-green-500' : 
                      'text-zinc-500'
                    } ${canClick ? 'cursor-pointer hover:underline' : 'cursor-not-allowed'}`}
                  >
                    {step.label}
                  </button>
                </div>
                {index < steps.length - 1 && (
                  <div className={`flex-1 h-0.5 mt-5 mx-1 sm:mx-4 ${isComplete ? 'bg-green-500' : 'bg-zinc-700'}`} />
                )}
              </Fragment>
            );
          })}
        </div>

        {/* Step Content */}
        <Card className="bg-zinc-900 border-zinc-800">
          <CardContent className="p-6">
            {/* Step 0: Personal Info */}
            {stepId === 'personal' && (
              <div className="space-y-6">
                <div>
                  <h2 className="text-lg font-semibold text-white mb-4">Personal Information</h2>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="md:col-span-2">
                      <Label htmlFor="full_name">Full Name *</Label>
                      <Input
                        id="full_name"
                        value={personalData.full_name}
                        onChange={(e) => setPersonalData({ ...personalData, full_name: e.target.value })}
                        className="bg-zinc-800 border-zinc-700 mt-1"
                        data-testid="input-full-name"
                      />
                    </div>
                    <div>
                      <Label htmlFor="gender">Gender *</Label>
                      <Select value={personalData.gender} onValueChange={(v) => setPersonalData({ ...personalData, gender: v })}>
                        <SelectTrigger className="bg-zinc-800 border-zinc-700 mt-1">
                          <SelectValue placeholder="Select gender" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="male">Male</SelectItem>
                          <SelectItem value="female">Female</SelectItem>
                          {isEdit && personalData.gender === 'other' ? <SelectItem value="other">Other</SelectItem> : null}
                        </SelectContent>
                      </Select>
                    </div>
                    {isEdit && (
                      <div>
                        <Label htmlFor="dob">Date of Birth</Label>
                        <Input
                          id="dob"
                          type="date"
                          value={personalData.dob}
                          onChange={(e) => setPersonalData({ ...personalData, dob: e.target.value })}
                          className="bg-zinc-800 border-zinc-700 mt-1"
                        />
                      </div>
                    )}
                    <div>
                      <Label htmlFor="phone">Phone *</Label>
                      <Input
                        id="phone"
                        value={personalData.phone}
                        onChange={(e) => setPersonalData({ ...personalData, phone: e.target.value })}
                        className="bg-zinc-800 border-zinc-700 mt-1"
                        data-testid="input-phone"
                      />
                    </div>
                    <div>
                      <Label htmlFor="email">Email *</Label>
                      <Input
                        id="email"
                        type="email"
                        value={personalData.email}
                        onChange={(e) => setPersonalData({ ...personalData, email: e.target.value })}
                        className="bg-zinc-800 border-zinc-700 mt-1"
                        data-testid="input-email"
                      />
                    </div>
                    {isEdit && (
                      <div className="md:col-span-2">
                        <Label>Portal Password</Label>
                        <div className="mt-1 flex flex-col md:flex-row gap-2">
                          <Input
                            type="password"
                            value={portalPassword}
                            onChange={(e) => setPortalPassword(e.target.value)}
                            className="bg-zinc-800 border-zinc-700"
                            placeholder="Set new password (min 6 chars)"
                          />
                          <div className="flex gap-2">
                            <Button type="button" onClick={handleSetPortalPassword} disabled={updatingPortalPassword} className="bg-red-600 hover:bg-red-700">
                              Save
                            </Button>
                            <Button type="button" variant="outline" onClick={handleResetPortalPassword} disabled={updatingPortalPassword} className="border-zinc-700 text-zinc-300">
                              Reset
                            </Button>
                          </div>
                        </div>
                      </div>
                    )}
                    {!isEdit && (
                      <div className="md:col-span-2">
                        <Label htmlFor="password">Password *</Label>
                        <div className="relative">
                          <Input
                            id="password"
                            type={showPassword ? 'text' : 'password'}
                            value={personalData.password}
                            onChange={(e) => setPersonalData({ ...personalData, password: e.target.value })}
                            className="bg-zinc-800 border-zinc-700 mt-1 pr-10"
                          />
                          <button
                            type="button"
                            onClick={() => setShowPassword(v => !v)}
                            className="absolute right-2 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-white"
                          >
                            {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                          </button>
                        </div>
                      </div>
                    )}
                    <div className="md:col-span-2">
                      <Label htmlFor="address">Address</Label>
                      <Textarea
                        id="address"
                        value={personalData.address}
                        onChange={(e) => setPersonalData({ ...personalData, address: e.target.value })}
                        className="bg-zinc-800 border-zinc-700 mt-1"
                        rows={2}
                      />
                    </div>
                  </div>
                </div>
                
                {isEdit && (
                  <div>
                    <h3 className="text-md font-semibold text-white mb-4">Emergency Contact</h3>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <div>
                        <Label htmlFor="ec_name">Name</Label>
                        <Input
                          id="ec_name"
                          value={emergencyContact.name}
                          onChange={(e) => setEmergencyContact({ ...emergencyContact, name: e.target.value })}
                          className="bg-zinc-800 border-zinc-700 mt-1"
                        />
                      </div>
                      <div>
                        <Label htmlFor="ec_phone">Phone</Label>
                        <Input
                          id="ec_phone"
                          value={emergencyContact.phone}
                          onChange={(e) => setEmergencyContact({ ...emergencyContact, phone: e.target.value })}
                          className="bg-zinc-800 border-zinc-700 mt-1"
                        />
                      </div>
                      <div>
                        <Label htmlFor="ec_relation">Relation</Label>
                        <Input
                          id="ec_relation"
                          value={emergencyContact.relation}
                          onChange={(e) => setEmergencyContact({ ...emergencyContact, relation: e.target.value })}
                          className="bg-zinc-800 border-zinc-700 mt-1"
                        />
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Step 1: Medical Info */}
            {stepId === 'medical' && (
              <div className="space-y-4">
                <h2 className="text-lg font-semibold text-white">Medical Information</h2>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="conditions">Medical Conditions</Label>
                    <Textarea
                      id="conditions"
                      value={medicalData.conditions}
                      onChange={(e) => setMedicalData({ ...medicalData, conditions: e.target.value })}
                      className="bg-zinc-800 border-zinc-700 mt-1"
                      placeholder="Any existing medical conditions..."
                      rows={2}
                    />
                  </div>
                  <div>
                    <Label htmlFor="injuries">Previous Injuries</Label>
                    <Textarea
                      id="injuries"
                      value={medicalData.injuries}
                      onChange={(e) => setMedicalData({ ...medicalData, injuries: e.target.value })}
                      className="bg-zinc-800 border-zinc-700 mt-1"
                      placeholder="Any previous injuries..."
                      rows={2}
                    />
                  </div>
                  <div>
                    <Label htmlFor="allergies">Allergies</Label>
                    <Input
                      id="allergies"
                      value={medicalData.allergies}
                      onChange={(e) => setMedicalData({ ...medicalData, allergies: e.target.value })}
                      className="bg-zinc-800 border-zinc-700 mt-1"
                    />
                  </div>
                  <div>
                    <Label htmlFor="medications">Current Medications</Label>
                    <Input
                      id="medications"
                      value={medicalData.medications}
                      onChange={(e) => setMedicalData({ ...medicalData, medications: e.target.value })}
                      className="bg-zinc-800 border-zinc-700 mt-1"
                    />
                  </div>
                  <div>
                    <Label htmlFor="doctor_name">Doctor Name</Label>
                    <Input
                      id="doctor_name"
                      value={medicalData.doctor_name}
                      onChange={(e) => setMedicalData({ ...medicalData, doctor_name: e.target.value })}
                      className="bg-zinc-800 border-zinc-700 mt-1"
                    />
                  </div>
                  <div>
                    <Label htmlFor="doctor_phone">Doctor Phone</Label>
                    <Input
                      id="doctor_phone"
                      value={medicalData.doctor_phone}
                      onChange={(e) => setMedicalData({ ...medicalData, doctor_phone: e.target.value })}
                      className="bg-zinc-800 border-zinc-700 mt-1"
                    />
                  </div>
                  <div className="md:col-span-2">
                    <Label htmlFor="notes">Additional Notes</Label>
                    <Textarea
                      id="notes"
                      value={medicalData.notes}
                      onChange={(e) => setMedicalData({ ...medicalData, notes: e.target.value })}
                      className="bg-zinc-800 border-zinc-700 mt-1"
                      rows={2}
                    />
                  </div>
                </div>
                <div className="flex items-center space-x-2 pt-4 border-t border-zinc-800">
                  <Checkbox
                    id="consent"
                    checked={medicalData.consent}
                    onCheckedChange={(checked) => setMedicalData({ ...medicalData, consent: checked })}
                    data-testid="medical-consent"
                  />
                  <Label htmlFor="consent" className="text-sm">
                    I consent to share this medical information with the facility for safety purposes *
                  </Label>
                </div>
              </div>
            )}

            {/* Step 2: Photo */}
            {stepId === 'photo' && (
              <div className="space-y-4">
                <h2 className="text-lg font-semibold text-white">Profile Photo</h2>
                <div className="flex flex-col items-center gap-4">
                  {photoUrl ? (
                    <img 
                      src={photoUrl.startsWith('/') ? `${process.env.REACT_APP_BACKEND_URL}${photoUrl}` : photoUrl}
                      alt="Profile"
                      className="w-40 h-40 rounded-full object-cover"
                    />
                  ) : (
                    <div className="w-40 h-40 rounded-full bg-zinc-800 flex items-center justify-center">
                      <Camera className="h-12 w-12 text-zinc-500" />
                    </div>
                  )}
                  <div>
                    <input
                      type="file"
                      accept="image/*"
                      onChange={handlePhotoUpload}
                      className="hidden"
                      id="photo-upload"
                    />
                    <Button
                      variant="outline"
                      onClick={() => document.getElementById('photo-upload').click()}
                      disabled={uploadingPhoto}
                    >
                      {uploadingPhoto ? (
                        <>
                          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                          Uploading...
                        </>
                      ) : (
                        <>
                          <Camera className="h-4 w-4 mr-2" />
                          {photoUrl ? 'Change Photo' : 'Upload Photo'}
                        </>
                      )}
                    </Button>
                  </div>
                  <p className="text-sm text-zinc-500">Optional - Upload a profile photo</p>
                </div>
              </div>
            )}

            {/* Step 3: Membership */}
            {stepId === 'membership' && (
              <div className="space-y-6">
                <h2 className="text-lg font-semibold text-white">Membership Selection</h2>
                
                <div>
                  <Label>Membership Type</Label>
                  <RadioGroup
                    value={membershipData.type}
                    onValueChange={(v) => setMembershipData({ ...membershipData, type: v })}
                    className="mt-2 grid grid-cols-2 gap-4"
                  >
                    {allowedMembershipTypes.includes('full_access') && (
                      <div className={`flex items-center space-x-2 p-4 rounded-lg border ${membershipData.type === 'full_access' ? 'border-orange-500 bg-orange-500/10' : 'border-zinc-700'}`}>
                        <RadioGroupItem value="full_access" id="full_access" />
                        <Label htmlFor="full_access" className="cursor-pointer">
                          <p className="font-medium">Full Access</p>
                          <p className="text-sm text-zinc-500">Access to all programs</p>
                        </Label>
                      </div>
                    )}
                    {allowedMembershipTypes.includes('only_gym') && (
                      <div className={`flex items-center space-x-2 p-4 rounded-lg border ${membershipData.type === 'only_gym' ? 'border-orange-500 bg-orange-500/10' : 'border-zinc-700'}`}>
                        <RadioGroupItem value="only_gym" id="only_gym" />
                        <Label htmlFor="only_gym" className="cursor-pointer">
                          <p className="font-medium">Only Gym</p>
                          <p className="text-sm text-zinc-500">Gym access only</p>
                        </Label>
                      </div>
                    )}
                    {allowedMembershipTypes.includes('kids') && (
                      <div className={`flex items-center space-x-2 p-4 rounded-lg border ${membershipData.type === 'kids' ? 'border-orange-500 bg-orange-500/10' : 'border-zinc-700'}`}>
                        <RadioGroupItem value="kids" id="kids" />
                        <Label htmlFor="kids" className="cursor-pointer">
                          <p className="font-medium">Kids</p>
                          <p className="text-sm text-zinc-500">Kids membership</p>
                        </Label>
                      </div>
                    )}
                  </RadioGroup>
                </div>

                <div>
                  <Label>Payment Plan *</Label>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-2">
                    {filteredPaymentPlans.map((plan) => (
                      <div
                        key={plan.plan_id}
                        onClick={() => setMembershipData({ ...membershipData, payment_plan_id: plan.plan_id })}
                        className={`p-4 rounded-lg border cursor-pointer transition-colors ${
                          membershipData.payment_plan_id === plan.plan_id
                            ? 'border-orange-500 bg-orange-500/10'
                            : 'border-zinc-700 hover:border-zinc-600'
                        }`}
                        data-testid={`plan-${plan.plan_id}`}
                      >
                        <p className="font-medium text-white">{plan.name || plan.title}</p>
                        <p className="text-xl font-bold text-orange-500">{plan.price} {plan.currency}</p>
                        <p className="text-sm text-zinc-500 capitalize">{plan.billing_cycle || plan.billing_period}</p>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="start_date">Start Date</Label>
                    <Input
                      id="start_date"
                      type="date"
                      value={membershipData.start_date}
                      onChange={(e) => setMembershipData({ ...membershipData, start_date: e.target.value })}
                      className="bg-zinc-800 border-zinc-700 mt-1"
                    />
                  </div>
                  <div>
                    <Label htmlFor="end_date">End Date</Label>
                    <Input
                      id="end_date"
                      type="date"
                      value={membershipData.end_date}
                      readOnly
                      className="bg-zinc-800 border-zinc-700 mt-1"
                    />
                  </div>
                </div>

                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="auto_renew"
                    checked={membershipData.auto_renew}
                    onCheckedChange={(checked) => setMembershipData({ ...membershipData, auto_renew: checked })}
                  />
                  <Label htmlFor="auto_renew">Auto-renew membership</Label>
                </div>
              </div>
            )}

            {/* Step 4: Agreement */}
            {stepId === 'agreement' && (
              <div className="space-y-6">
                <h2 className="text-lg font-semibold text-white">Agreement Signing</h2>
                
                <div>
                  <Label>Select Agreement</Label>
                  <Select value={agreementData.agreement_id} onValueChange={(v) => setAgreementData({ ...agreementData, agreement_id: v })}>
                    <SelectTrigger className="bg-zinc-800 border-zinc-700 mt-1">
                      <SelectValue placeholder="Select an agreement" />
                    </SelectTrigger>
                    <SelectContent>
                      {agreements.map((agreement) => (
                        <SelectItem key={agreement.agreement_id} value={agreement.agreement_id}>
                          {agreement.title} (v{agreement.version})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {agreementData.agreement_id && (
                  <div className="bg-zinc-800 p-4 rounded-lg max-h-60 overflow-y-auto">
                    <div 
                      dangerouslySetInnerHTML={{ 
                        __html: agreements.find(a => a.agreement_id === agreementData.agreement_id)?.content_html || '' 
                      }}
                      className="prose prose-invert prose-sm"
                    />
                  </div>
                )}

                <div>
                  <Label htmlFor="signer_name">Signer Name</Label>
                  <Input
                    id="signer_name"
                    value={agreementData.signer_name || personalData.full_name}
                    onChange={(e) => setAgreementData({ ...agreementData, signer_name: e.target.value })}
                    className="bg-zinc-800 border-zinc-700 mt-1"
                  />
                </div>

                <div className="flex items-center space-x-2 pt-4 border-t border-zinc-800">
                  <Checkbox
                    id="agreement_checkbox"
                    checked={agreementData.checkbox_agreed}
                    onCheckedChange={(checked) => setAgreementData({ ...agreementData, checkbox_agreed: checked })}
                    data-testid="agreement-checkbox"
                  />
                  <Label htmlFor="agreement_checkbox">
                    I have read and agree to the terms and conditions *
                  </Label>
                </div>
              </div>
            )}

            {/* Step 5: Payment */}
            {stepId === 'payment' && (
              <div className="space-y-6">
                <h2 className="text-lg font-semibold text-white">Payment</h2>
                
                {selectedPlan && (
                  <Card className="bg-zinc-800 border-zinc-700">
                    <CardContent className="p-4">
                      <div className="flex justify-between items-center">
                        <div>
                          <p className="text-zinc-400">Selected Plan</p>
                          <p className="text-lg font-medium text-white">{selectedPlan.name}</p>
                        </div>
                        <div className="text-right">
                          <p className="text-2xl font-bold text-orange-500">{selectedPlan.price} {selectedPlan.currency}</p>
                          <p className="text-sm text-zinc-500 capitalize">{selectedPlan.billing_cycle}</p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                )}

                <div>
                  <Label>Payment Method</Label>
                  <RadioGroup
                    value={paymentMethod}
                    onValueChange={setPaymentMethod}
                    className="mt-2 space-y-3"
                  >
                    {availablePaymentMethods.map((method) => (
                      <div key={method.provider} className={`flex items-center space-x-2 p-4 rounded-lg border ${paymentMethod === method.provider ? 'border-orange-500 bg-orange-500/10' : 'border-zinc-700'}`}>
                        <RadioGroupItem value={method.provider} id={`method-${method.provider}`} />
                        <Label htmlFor={`method-${method.provider}`} className="cursor-pointer flex-1">
                          <p className="font-medium">{method.display_name}</p>
                          <p className="text-sm text-zinc-500">
                            {method.provider === 'cash' ? 'Record payment manually' : 
                             method.is_sandbox ? 'Sandbox Mode' : 'Online Payment'}
                          </p>
                        </Label>
                      </div>
                    ))}
                  </RadioGroup>
                </div>

                {paymentMethod === 'cash' && (
                  <div>
                    <Label htmlFor="receipt_info">Receipt Info / Notes</Label>
                    <Textarea
                      id="receipt_info"
                      value={receiptInfo}
                      onChange={(e) => setReceiptInfo(e.target.value)}
                      className="bg-zinc-800 border-zinc-700 mt-1"
                      placeholder="Receipt number, notes..."
                      rows={2}
                    />
                  </div>
                )}

                {/* Receipt Upload */}
                <div>
                  <Label>Attach Payment Receipt</Label>
                  <p className="text-xs text-zinc-500 mb-2">Upload a receipt (PDF, PNG, JPEG, JPG)</p>
                  {receiptUrl ? (
                    <div className="flex items-center gap-3 p-3 bg-zinc-800 rounded-lg border border-zinc-700" data-testid="receipt-preview">
                      <FileIcon className="h-8 w-8 text-orange-500 flex-shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-white truncate">{receiptFileName || 'Receipt uploaded'}</p>
                        <a
                          href={receiptUrl.startsWith('/') ? `${process.env.REACT_APP_BACKEND_URL}${receiptUrl}` : receiptUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-xs text-orange-400 hover:underline"
                        >
                          View file
                        </a>
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => { setReceiptUrl(''); setReceiptFileName(''); }}
                        className="text-zinc-400 hover:text-red-400 flex-shrink-0"
                        data-testid="remove-receipt-btn"
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  ) : (
                    <div>
                      <input
                        type="file"
                        accept=".pdf,.png,.jpeg,.jpg"
                        onChange={handleReceiptUpload}
                        className="hidden"
                        id="receipt-upload"
                        data-testid="receipt-upload-input"
                      />
                      <button
                        type="button"
                        onClick={() => document.getElementById('receipt-upload').click()}
                        disabled={uploadingReceipt}
                        className="w-full flex flex-col items-center gap-2 p-6 border-2 border-dashed border-zinc-700 rounded-lg hover:border-orange-500/50 hover:bg-zinc-800/50 transition-colors cursor-pointer"
                        data-testid="receipt-upload-btn"
                      >
                        {uploadingReceipt ? (
                          <Loader2 className="h-8 w-8 text-orange-500 animate-spin" />
                        ) : (
                          <Upload className="h-8 w-8 text-zinc-500" />
                        )}
                        <span className="text-sm text-zinc-400">
                          {uploadingReceipt ? 'Uploading...' : 'Click to upload receipt'}
                        </span>
                        <span className="text-xs text-zinc-600">PDF, PNG, JPEG, JPG</span>
                      </button>
                    </div>
                  )}
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Navigation */}
        <div className="flex justify-between">
          <Button
            variant="outline"
            onClick={handleBack}
            disabled={currentStep === 0 || submitting}
          >
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back
          </Button>
          
          <div className="flex gap-2">
            {/* Save Changes button for edit mode */}
            {isEdit && (
              <Button
                onClick={handleSaveChanges}
                disabled={submitting}
                className="bg-green-600 hover:bg-green-700"
                data-testid="save-changes-btn"
              >
                {submitting ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Saving...
                  </>
                ) : (
                  <>
                    <Check className="h-4 w-4 mr-2" />
                    Save Changes
                  </>
                )}
              </Button>
            )}
            
            {/* Next/Complete button */}
            {!isEdit && currentStep < steps.length - 1 ? (
              <Button
                onClick={handleNext}
                disabled={submitting}
                className="bg-red-600 hover:bg-red-700"
                data-testid="next-step-btn"
              >
                {submitting ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Processing...
                  </>
                ) : (
                  <>
                    Next
                    <ArrowRight className="h-4 w-4 ml-2" />
                  </>
                )}
              </Button>
            ) : !isEdit && (
              <Button
                onClick={handleNext}
                disabled={submitting}
                className="bg-green-600 hover:bg-green-700"
                data-testid="complete-registration-btn"
              >
                {submitting ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Processing...
                  </>
                ) : (
                  <>
                    <Check className="h-4 w-4 mr-2" />
                    Register Member
                  </>
                )}
              </Button>
            )}
          </div>
        </div>
    </div>
  );
}

export default function AddMemberPage() {
  const user = JSON.parse(localStorage.getItem('user') || '{}');
  const locationId = user.location_id;
  return (
    <ManagerLayout>
      <AddMemberWizard locationId={locationId} basePath="/manager/members" />
    </ManagerLayout>
  );
}
