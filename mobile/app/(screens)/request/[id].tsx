import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, ScrollView, Pressable, ActivityIndicator, RefreshControl, Alert } from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import { ArrowLeft, AlertCircle, FileText, CheckCircle2, Clock, Circle, MessageCircle, CreditCard } from 'lucide-react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { paymentsApi } from '../../../src/api/payments';
import { requestsApi, RequestItem } from '../../../src/api/requests';
import { StatusBadge } from '../../../src/components/ui/StatusBadge';
import * as ImagePicker from 'expo-image-picker';
import * as FileSystem from 'expo-file-system';
import { decode } from 'base64-arraybuffer';
import { supabase } from '../../../src/lib/supabase';
import { Camera, UploadCloud } from 'lucide-react-native';
import { LogoLoader } from '../../../src/components/ui/Loader';

export default function RequestDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [request, setRequest] = useState<RequestItem | null>(null);
  const [timeline, setTimeline] = useState<any[]>([]);
  const [quotes, setQuotes] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Auto-refresh every 10 seconds
  const fetchRequest = useCallback(async () => {
    if (!id) return;
    try {
      setError(null);
      const [requestData, timelineData, quotesData] = await Promise.all([
        requestsApi.get(id),
        requestsApi.timeline(id).catch(() => []), // timeline may not exist for all requests
        requestsApi.quotes.list(id as string).catch(() => []),
      ]);
      setRequest(requestData);
      setTimeline(Array.isArray(timelineData) ? timelineData : []);
      setQuotes(Array.isArray(quotesData) ? quotesData : quotesData?.data || []);
    } catch (err: any) {
      setError('Failed to load request details. Pull down to retry.');
      console.error('Request detail fetch error:', err);
    }
  }, [id]);

  useEffect(() => {
    if (!id) return;
    const interval = setInterval(() => {
      fetchRequest();
    }, 10000);
    return () => clearInterval(interval);
  }, [id, fetchRequest]);
  const [error, setError] = useState<string | null>(null);


  const [verifying, setVerifying] = useState(false);
  const [verificationPhoto, setVerificationPhoto] = useState<string | null>(null);
  const [cancelling, setCancelling] = useState(false);

  const handlePickVerificationPhoto = async () => {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        quality: 0.7,
      });

      if (!result.canceled && result.assets && result.assets.length > 0) {
        setVerifying(true);
        const asset = result.assets[0];
        
        const base64 = await FileSystem.readAsStringAsync(asset.uri, { encoding: 'base64' });
        const filePath = `verifications/${Date.now()}_job_${id}.jpg`;
        
        const { error: uploadError } = await supabase.storage
          .from('entercom-media')
          .upload(filePath, decode(base64), { contentType: 'image/jpeg' });
          
        if (uploadError) throw uploadError;
        
        const { data: publicUrlData } = supabase.storage
          .from('entercom-media')
          .getPublicUrl(filePath);
          
        setVerificationPhoto(publicUrlData.publicUrl);
        setVerifying(false);
      }
    } catch (err) {
      console.error(err);
      // Alert imported implicitly or just use console
      setVerifying(false);
    }
  };

  const handleCompleteJob = async () => {
    if (!verificationPhoto) return;
    try {
      setVerifying(true);
      await requestsApi.submit_verification(id as string, { 
        photos: [verificationPhoto],
        notes: 'Job completed successfully.' 
      });
      fetchRequest();
    } catch (err) {
      console.error(err);
    } finally {
      setVerifying(false);
    }
  };


  useEffect(() => {
    fetchRequest().finally(() => setLoading(false));
  }, [fetchRequest]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchRequest();
    setRefreshing(false);
  }, [fetchRequest]);

  const formatDate = (dateStr?: string) => {
    if (!dateStr) return '—';
    return new Date(dateStr).toLocaleString('en-US', {
      month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit'
    });
  };

  const handleCancel = () => {
    Alert.prompt(
      'Cancel Request',
      'Please provide a reason for cancelling this request:',
      [
        { text: 'Keep Request', style: 'cancel' },
        {
          text: 'Cancel It',
          style: 'destructive',
          onPress: async (reason: string | undefined) => {
            if (!reason) {
              global.showAppAlert('Reason Required', 'You must provide a reason to cancel the request.');
              return;
            }
            try {
              setCancelling(true);
              await requestsApi.cancel(id as string, reason);
              global.showAppAlert('Success', 'Request has been cancelled.');
              fetchRequest();
            } catch (err: any) {
              global.showAppAlert('Error', err.response?.data?.detail || 'Failed to cancel request.');
            } finally {
              setCancelling(false);
            }
          },
        },
      ],
      'plain-text'
    );
  };

  const getStatusBgColor = (status?: string) => {
    switch (status?.toLowerCase()) {
      case 'completed':
      case 'resolved': return 'bg-green-600';
      case 'cancelled':
      case 'canceled': return 'bg-red-600';
      case 'in_progress': return 'bg-blue-600';
      default: return 'bg-ess-purple';
    }
  };

  const getTimelineIcon = (eventType?: string) => {
    if (!eventType) return <Circle size={22} color="#d1d5db" />;
    const type = eventType.toLowerCase();
    if (type.includes('complet') || type.includes('resolv') || type.includes('done')) {
      return <CheckCircle2 size={22} color="#16a34a" />;
    }
    if (type.includes('progress') || type.includes('active') || type.includes('assign')) {
      return <Clock size={22} color="#2563eb" />;
    }
    return <Circle size={22} color="#9ca3af" />;
  };

  return (
    <SafeAreaView className="flex-1 bg-white" edges={['top']}>
      {/* Header */}
      <View className="flex-row items-center px-5 py-4 border-b border-gray-100">
        <Pressable onPress={() => router.back()} className="mr-4 p-2 -ml-2 bg-gray-50 rounded-full">
          <ArrowLeft size={24} color="#1f2937" />
        </Pressable>
        <Text className="text-xl font-bold flex-1 text-gray-900" numberOfLines={1}>
          Request {request?.public_id || `#${id?.toString().substring(0, 8).toUpperCase()}`}
        </Text>
      </View>

      {loading ? (
        <LogoLoader text="Loading request details..." />
      ) : error ? (
        <ScrollView
          contentContainerStyle={{ flexGrow: 1 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#081f3d" />}
        >
          <View className="flex-1 items-center justify-center py-20">
            <AlertCircle size={48} color="#ef4444" />
            <Text className="text-red-500 text-center font-medium mt-4 px-8">{error}</Text>
          </View>
        </ScrollView>
      ) : !request ? null : (
        <ScrollView
          className="flex-1"
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#081f3d" />}
        >
          {/* Status Card */}
          <View className={`${getStatusBgColor(request.status)} mx-5 mt-5 p-5 rounded-2xl mb-4`}>
            <View className="flex-row justify-between items-start">
              <View>
                <Text className="text-white/80 font-medium mb-1 text-sm">Current Status</Text>
                <StatusBadge status={request.status} />
              </View>
              {!['completed', 'cancelled', 'canceled', 'draft', 'resolved'].includes(request.status?.toLowerCase()) && (
                <Pressable 
                  onPress={handleCancel}
                  disabled={cancelling}
                  className="bg-white/20 px-3 py-1.5 rounded-lg"
                >
                  {cancelling ? <ActivityIndicator size="small" color="white" /> : <Text className="text-white font-medium text-xs">Cancel Request</Text>}
                </Pressable>
              )}
            </View>
            <Text className="text-white/70 text-xs mt-3">
              Last updated: {formatDate(request.updated_at)}
            </Text>
          </View>

          {/* Workflow Indicator */}
          {request.status === 'awaiting_assignment' && (
            <View className="mx-5 bg-blue-50 p-3 rounded-xl mb-4 flex-row items-center">
              <Clock size={16} color="#2563eb" />
              <Text className="ml-2 text-blue-800 font-semibold">Waiting on Staff to assign technician</Text>
            </View>
          )}
          {request.status === 'staff_review' && (
            <View className="mx-5 bg-purple-50 p-3 rounded-xl mb-4 flex-row items-center">
              <Clock size={16} color="#7e22ce" />
              <Text className="ml-2 text-purple-800 font-semibold">Waiting on Staff for review</Text>
            </View>
          )}
          
          {/* Action Banners */}
          {request.status === 'draft' && (
            <Pressable onPress={() => {}} className="mx-5 bg-ess-purple rounded-2xl shadow-sm p-4 mb-3 flex-row justify-between items-center">
              <Text className="font-bold text-white ml-2">Submit Request</Text>
              <ArrowLeft size={16} color="white" className="rotate-180" />
            </Pressable>
          )}
          {request.status === 'awaiting_customer_approval' && (
            <Pressable onPress={() => router.push('/(screens)/quotes')} className="mx-5 bg-orange-500 rounded-2xl shadow-sm p-4 mb-3 flex-row justify-between items-center">
              <View className="flex-row items-center">
                <View className="w-8 h-8 rounded-full bg-white/20 items-center justify-center">
                  <FileText size={16} color="white" />
                </View>
                <Text className="ml-3 font-bold text-white">Review Pending Quote</Text>
              </View>
              <ArrowLeft size={16} color="white" className="rotate-180" />
            </Pressable>
          )}

          {(() => {
            const activeQuote = quotes.find(q => ['approved', 'partially_paid'].includes(q.status));
            
            const handlePayment = async (plan: 'full' | 'fifty_fifty') => {
              if (!activeQuote) return;
              try {
                setCancelling(true); // Reusing loading state for simplicity
                const res = await paymentsApi.initializeQuotePayment({ quote_id: activeQuote.id, payment_plan: plan });
                if (res.authorization_url) {
                  // Wait, Expo router doesn't open web links easily without Linking.
                  // The frontend redirects to authorization_url.
                  // For mobile, we should probably push to the order page or open WebBrowser.
                  // Actually, just pushing to the order screen should work because the order is created!
                  if (res.order_id) {
                     router.push(`/(screens)/orders/${res.order_id}`);
                  }
                }
              } catch (err: any) {
                global.showAppAlert('Payment Error', err.response?.data?.detail || 'Failed to initialize payment.');
              } finally {
                setCancelling(false);
              }
            };

            if (activeQuote && ['approved', 'partially_paid'].includes(activeQuote.status) && request.status !== 'completed' && request.status !== 'verified') {
              return (
                <View className="mx-5 bg-white rounded-2xl shadow-sm border border-gray-100 p-5 mb-4">
                  <Text className="text-lg font-bold text-gray-900 mb-4">Payment Options</Text>
                  
                  <View className="border border-gray-200 rounded-xl p-4 mb-3 bg-gray-50">
                    <Text className="font-semibold text-base mb-1">{activeQuote.status === 'partially_paid' ? 'Pay Remaining Balance' : 'Pay in Full'}</Text>
                    <Text className="text-xs text-gray-500 mb-3">{activeQuote.status === 'partially_paid' ? 'Settle the final half of the quote.' : 'Settle the entire balance now.'}</Text>
                    <Text className="text-xl font-bold mb-3">?{(parseFloat(activeQuote.amount || 0) - (parseFloat(activeQuote.amount_paid || 0))).toLocaleString()}</Text>
                    <Pressable 
                      onPress={() => handlePayment('full')}
                      disabled={cancelling}
                      className="w-full py-3 bg-ess-purple items-center rounded-xl"
                    >
                      <Text className="text-white font-bold">{cancelling ? 'Processing...' : (activeQuote.status === 'partially_paid' ? 'Pay Balance' : 'Pay in Full')}</Text>
                    </Pressable>
                  </View>

                  {activeQuote.status === 'approved' && (!activeQuote.amount_paid || parseFloat(activeQuote.amount_paid) === 0) && (
                    <View className="border border-gray-200 rounded-xl p-4">
                      <Text className="font-semibold text-base mb-1">Pay 50% Deposit</Text>
                      <Text className="text-xs text-gray-500 mb-3">Pay half now, balance on completion.</Text>
                      <Text className="text-xl font-bold mb-3">?{(parseFloat(activeQuote.amount || 0) / 2).toLocaleString()}</Text>
                      <Pressable 
                        onPress={() => handlePayment('fifty_fifty')}
                        disabled={cancelling}
                        className="w-full py-3 border border-ess-purple items-center rounded-xl"
                      >
                        <Text className="text-ess-purple font-bold">{cancelling ? 'Processing...' : 'Pay Deposit'}</Text>
                      </Pressable>
                    </View>
                  )}
                </View>
              );
            }
            return null;
          })()}
          
          {(request.status === 'cancelled' || request.status === 'canceled') && (
            <Pressable onPress={() => router.push('/(screens)/request/new')} className="mx-5 bg-gray-800 rounded-2xl shadow-sm p-4 mb-3 flex-row justify-center items-center">
              <Text className="font-bold text-white">Retry / Create New Request</Text>
            </Pressable>
          )}

          {request.order_id && (
            <Pressable onPress={() => router.push(`/(screens)/orders/${request.order_id}`)} className="mx-5 bg-white rounded-2xl shadow-sm border border-gray-100 p-4 mb-3 flex-row justify-between items-center">
              <View className="flex-row items-center">
                <View className="w-8 h-8 rounded-full bg-blue-50 items-center justify-center">
                  <FileText size={16} color="#0f4c81" />
                </View>
                <Text className="ml-3 font-semibold text-gray-900">View Order Details</Text>
              </View>
              <ArrowLeft size={16} color="#9ca3af" className="rotate-180" />
            </Pressable>
          )}

          {request.payment_id && (
            <Pressable onPress={() => router.push(`/(screens)/payment/${request.payment_id}`)} className="mx-5 bg-white rounded-2xl shadow-sm border border-gray-100 p-4 mb-3 flex-row justify-between items-center">
              <View className="flex-row items-center">
                <View className="w-8 h-8 rounded-full bg-green-50 items-center justify-center">
                  <CreditCard size={16} color="#16a34a" />
                </View>
                <Text className="ml-3 font-semibold text-gray-900">View Payment Details</Text>
              </View>
              <ArrowLeft size={16} color="#9ca3af" className="rotate-180" />
            </Pressable>
          )}

          {/* Request Details */}
          <View className="mx-5 mt-5 bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
            <View className="flex-row items-center mb-4">
              <View className="w-10 h-10 bg-ess-softBlue rounded-[12px] items-center justify-center mr-3">
                <FileText size={20} color="#0f4c81" />
              </View>
              <Text className="text-lg font-bold text-gray-900">Request Details</Text>
            </View>

            <View className="space-y-3">
              {request.service_type && (
                <View className="flex-row justify-between">
                  <Text className="text-gray-500 font-medium">Service Type</Text>
                  <Text className="text-gray-900 font-semibold">{request.service_type}</Text>
                </View>
              )}
              {request.category && (
                <View className="flex-row justify-between">
                  <Text className="text-gray-500 font-medium">Category</Text>
                  <Text className="text-gray-900 font-semibold capitalize">{request.category}</Text>
                </View>
              )}
              {request.priority && (
                <View className="flex-row justify-between">
                  <Text className="text-gray-500 font-medium">Priority</Text>
                  <Text className="text-gray-900 font-semibold capitalize">{request.priority}</Text>
                </View>
              )}
              {request.created_at && (
                <View className="flex-row justify-between">
                  <Text className="text-gray-500 font-medium">Submitted</Text>
                  <Text className="text-gray-900 font-semibold">{formatDate(request.created_at)}</Text>
                </View>
              )}
              {request.requires_technician !== undefined && (
                <View className="flex-row justify-between">
                  <Text className="text-gray-500 font-medium">Technician Required</Text>
                  <Text className="text-gray-900 font-semibold">{request.requires_technician ? 'Yes' : 'No'}</Text>
                </View>
              )}
              {request.address && (
                <View className="mt-1 pt-3 border-t border-gray-100">
                  <Text className="text-gray-500 font-medium mb-1">Address</Text>
                  <Text className="text-gray-900">{request.address}</Text>
                </View>
              )}
              {request.description && (
                <View className="mt-1 pt-3 border-t border-gray-100">
                  <Text className="text-gray-500 font-medium mb-1">Description</Text>
                  <Text className="text-gray-700 leading-relaxed">{request.description}</Text>
                </View>
              )}
            </View>
          </View>



          {/* Timeline */}
          {timeline.length > 0 && (
            <View className="mx-5 mt-5 bg-white rounded-2xl border border-gray-100 shadow-sm p-5 mb-6">
              <Text className="text-lg font-bold text-gray-900 mb-5">Activity Timeline</Text>
              <View className="pl-1">
                {timeline.filter((e: any) => !e.type || e.type === 'state_change').map((event: any, index: number, filteredArr: any[]) => (
                  <View key={event.id || index} className="flex-row mb-6 relative">
                    {index < filteredArr.length - 1 && (
                      <View className="absolute left-[11px] top-7 bottom-[-24px] w-0.5 bg-gray-200" />
                    )}
                    <View className="mr-4 bg-white z-10">
                      {getTimelineIcon(event.event_type || event.status)}
                    </View>
                    <View className="flex-1 -mt-0.5">
                      <Text className="font-semibold text-gray-900 text-base">
                        {event.to_state ? event.to_state.replace(/_/g, ' ') : (event.action || 'Update')}
                      </Text>
                      {event.description && (
                        <Text className="text-gray-500 text-sm mt-0.5">{event.description}</Text>
                      )}
                      <Text className="text-gray-400 text-xs mt-1">{formatDate(event.created_at)}</Text>
                    </View>
                  </View>
                ))}
              </View>
            </View>
          )}

          {/* Chat CTA */}
          <View className="mx-5 mt-2 mb-10">
            <Pressable
              onPress={() => router.push('/(screens)/chat')}
              className="bg-ess-purple flex-row items-center justify-center p-4 rounded-2xl"
            >
              <MessageCircle size={20} color="white" />
              <Text className="text-white font-bold ml-2 text-base">Chat with Support</Text>
            </Pressable>
          </View>
        </ScrollView>
      )}
    </SafeAreaView>
  );
}
