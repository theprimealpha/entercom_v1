import React, { useState, useEffect } from 'react';
import { LogoLoader } from '../../../src/components/ui/Loader';
import { ListSkeleton } from '../../../src/components/ui/Skeleton';
import { View, Text, Pressable, FlatList, ActivityIndicator, RefreshControl } from 'react-native';
import { router } from 'expo-router';
import { ArrowLeft, FileText, ChevronRight } from 'lucide-react-native';
import { Card, CardContent } from '../../../src/components/ui/Card';
import { StatusBadge } from '../../../src/components/ui/StatusBadge';
import { useAuthStore } from '../../../src/store/authStore';
import { EmptyState } from '../../../src/components/ui/EmptyState';
import { Button } from '../../../src/components/ui/Button';
import { requestsApi } from '../../../src/api/requests';

export default function QuotesScreen() {
  const [quotes, setQuotes] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    fetchQuotes();
  }, []);

  const fetchQuotes = async (isRefresh = false) => {
    try {
      if (!isRefresh) setLoading(true);
      const reqs = await requestsApi.list();
      const reqsWithQuotes = reqs.filter(r => ['awaiting_customer_approval', 'awaiting_payment', 'in_progress', 'completed'].includes(r.status));
      
      let allQuotes: any[] = [];
      for (const req of reqsWithQuotes) {
        try {
          const qs = await requestsApi.quotes.list(req.id);
          const validQs = Array.isArray(qs) ? qs : qs?.data || [];
          validQs.forEach((q: any) => {
            allQuotes.push({
              ...q,
              requestId: req.id,
              requestTitle: req.title || req.service_type || 'Service Request',
            });
          });
        } catch (e) {
          // Ignore errors for individual requests
        }
      }
      setQuotes(allQuotes);
    } catch (error) {
      console.error('Failed to fetch quotes:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const onRefresh = () => {
    setRefreshing(true);
    fetchQuotes(true);
  };

  const renderQuote = ({ item }: { item: any }) => {
    return (
      <Pressable onPress={() => router.push({ pathname: '/(screens)/quotes/[id]', params: { id: item.id, requestId: item.requestId } })}>
        <Card className="mb-4 border-0 p-0 shadow-sm shadow-black/5 overflow-hidden">
          <CardContent className="p-5">
            <View className="flex-row justify-between items-start mb-4">
              <View className="flex-1 pr-4">
                <Text className="text-gray-900 font-bold text-[18px] tracking-tight mb-1" numberOfLines={1}>{item.requestTitle}</Text>
                <Text className="text-gray-500 text-[13px] font-medium">{item.id.substring(0, 8)} • v{item.version}</Text>
              </View>
              <StatusBadge status={item.status} />
            </View>
            
            <View className="flex-row justify-between items-center pt-4 border-t border-gray-100">
              <View>
                <Text className="text-gray-500 text-[12px] font-bold uppercase tracking-widest mb-0.5">Estimated Amount</Text>
                <Text className="text-ess-darkPurple font-extrabold text-[20px] tracking-tight">₦{parseFloat(item.amount || 0).toLocaleString()}</Text>
              </View>
              <View className="bg-ess-softBlue p-2 rounded-full">
                <ChevronRight size={20} color="#081f3d" />
              </View>
            </View>
          </CardContent>
        </Card>
      </Pressable>
    );
  };

  return (
    <View className="flex-1 bg-gray-50">
      {/* Premium Header */}
      <View className="bg-white pt-16 pb-4 px-7 flex-row items-center justify-between border-b border-gray-100 shadow-sm shadow-black/5 relative z-10">
        <Pressable onPress={() => router.back()} className="p-2 -ml-2 bg-gray-50 rounded-full">
          <ArrowLeft size={24} color="#081f3d" />
        </Pressable>
        <Text className="text-[20px] font-bold text-gray-900 tracking-tight">My Quotes</Text>
        <Pressable className="p-2 -mr-2 bg-ess-softBlue rounded-full">
          <FileText size={20} color="#0f4c81" />
        </Pressable>
      </View>

      {loading ? (
        <View className="flex-1 mt-4">
          <ListSkeleton />
        </View>
      ) : (
        <FlatList
          data={quotes}
          keyExtractor={(item) => item.id}
          renderItem={renderQuote}
          contentContainerStyle={{ padding: 28 }}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#081f3d" />
          }
          ListEmptyComponent={() => (
            <EmptyState
              title="No quotes yet"
              description="You haven't requested any custom quotes yet."
              icon={<FileText size={44} color="#6b7280" />}
              action={
                <Button 
                  variant="primary" 
                  size="lg"
                  onPress={() => router.replace('/(drawer)/(tabs)/requests')}
                  className="px-10"
                >
                  Request a Service
                </Button>
              }
            />
          )}
        />
      )}
    </View>
  );
}
