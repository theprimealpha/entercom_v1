import React, { useState, useEffect } from 'react';
import { LogoLoader } from '../../../src/components/ui/Loader';
import { View, Text, ScrollView, Pressable, ActivityIndicator, Alert } from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import { ArrowLeft, Download, Calendar } from 'lucide-react-native';
import { Card, CardContent } from '../../../src/components/ui/Card';
import { StatusBadge } from '../../../src/components/ui/StatusBadge';
import { Button } from '../../../src/components/ui/Button';
import { requestsApi } from '../../../src/api/requests';

export default function QuoteDetailsScreen() {
  const { id, requestId } = useLocalSearchParams();
  const [quote, setQuote] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);

  useEffect(() => {
    if (id && requestId) {
      fetchQuote();
    }
  }, [id, requestId]);

  const fetchQuote = async () => {
    try {
      const qs = await requestsApi.quotes.list(requestId as string);
      const validQs = Array.isArray(qs) ? qs : qs?.data || [];
      const foundQuote = validQs.find((q: any) => q.id === id);
      if (foundQuote) setQuote(foundQuote);
    } catch (error) {
      console.error('Failed to fetch quote:', error);
      global.showAppAlert('Error', 'Failed to load quote details.');
    } finally {
      setLoading(false);
    }
  };

  const handleAction = async (action: 'approve' | 'reject' | 'revise') => {
    if (action === 'reject' || action === 'revise') {
      Alert.prompt(
        action === 'reject' ? 'Reject Quote' : 'Revise Quote',
        `Please provide a reason for ${action}ing this quote:`,
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Submit',
            onPress: async (reason: string | undefined) => {
              if (!reason) {
                global.showAppAlert('Reason Required', `You must provide a reason to ${action} the quote.`);
                return;
              }
              await performAction(action, reason);
            }
          }
        ],
        'plain-text'
      );
    } else {
      await performAction(action);
    }
  };

  const performAction = async (action: 'approve' | 'reject' | 'revise', reason?: string) => {
    try {
      setProcessing(true);
      await requestsApi.quotes.action(requestId as string, action, reason);
      global.showAppAlert('Success', `Quote ${action}d successfully.`);
      router.back();
    } catch (error: any) {
      console.error(`Failed to ${action} quote:`, error);
      global.showAppAlert('Error', error.response?.data?.detail || `Failed to ${action} quote.`);
    } finally {
      setProcessing(false);
    }
  };

  if (loading) {
    return (
      <View className="flex-1 bg-gray-50 items-center justify-center">
        <LogoLoader />
      </View>
    );
  }

  if (!quote) {
    return (
      <View className="flex-1 bg-gray-50 items-center justify-center">
        <Text className="text-gray-500 font-medium text-[16px]">Quote not found.</Text>
        <Button variant="outline" className="mt-4" onPress={() => router.back()}>Go Back</Button>
      </View>
    );
  }

  return (
    <View className="flex-1 bg-gray-50">
      {/* Premium Header */}
      <View className="bg-white pt-16 pb-4 px-7 flex-row items-center justify-between border-b border-gray-100 shadow-sm shadow-black/5 relative z-10">
        <Pressable onPress={() => router.back()} className="p-2 -ml-2 bg-gray-50 rounded-full">
          <ArrowLeft size={24} color="#081f3d" />
        </Pressable>
        <Text className="text-[20px] font-bold text-gray-900 tracking-tight">Quote Details</Text>
        <View className="w-10" />
      </View>

      <ScrollView className="flex-1 px-7 pt-6">
        {/* Header Card */}
        <Card className="mb-8 border-0 p-0 shadow-sm shadow-black/5 overflow-hidden">
          <CardContent className="p-5">
            <View className="flex-row justify-between items-start mb-5 pb-5 border-b border-gray-100">
              <View className="flex-1 pr-4">
                <Text className="text-gray-900 font-bold text-[22px] tracking-tight mb-1">Quote v{quote.version}</Text>
                <Text className="text-gray-500 font-medium text-[13px]">{quote.id}</Text>
              </View>
              <StatusBadge status={quote.status} />
            </View>
          </CardContent>
        </Card>

        {/* Line Items */}
        <Text className="text-[13px] font-bold text-ess-darkPurple uppercase tracking-widest mb-3 ml-1">Quote Total</Text>
        <Card className="mb-8 border-0 p-0 shadow-sm shadow-black/5 overflow-hidden">
          <View className="p-5 bg-ess-softBlue/20">
            <View className="flex-row justify-between pt-2">
              <Text className="font-extrabold text-ess-darkPurple text-[18px]">Total</Text>
              <Text className="font-extrabold text-ess-purple text-[22px] tracking-tight">₦{parseFloat(quote.amount || 0).toLocaleString()}</Text>
            </View>
          </View>
        </Card>

        {/* Actions */}
        {quote.status === 'issued' && (
          <View className="flex-col gap-3 mb-12">
            <Button 
              variant="primary" 
              size="lg" 
              className="w-full shadow-lg shadow-ess-purple/20"
              onPress={() => handleAction('approve')}
              disabled={processing}
            >
              Approve Quote
            </Button>
            <View className="flex-row gap-3">
              <Button 
                variant="outline" 
                size="lg" 
                className="flex-1 border-gray-200" 
                textClassName="text-gray-600"
                onPress={() => handleAction('revise')}
                disabled={processing}
              >
                Revise Quote
              </Button>
              <Button 
                variant="outline" 
                size="lg" 
                className="flex-1 border-gray-200" 
                textClassName="text-red-600"
                onPress={() => handleAction('reject')}
                disabled={processing}
              >
                Reject Quote
              </Button>
            </View>
          </View>
        )}
      </ScrollView>
    </View>
  );
}
