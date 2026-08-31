import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, ActivityIndicator, Image, Pressable, Platform, Alert, RefreshControl } from 'react-native';
import { AppScrollView } from '../../../src/components/ui/AppScrollView';
import { ShieldCheck, Calendar, CheckCircle2, ChevronRight, Bell, Clock, FileText, CreditCard, Star, ArrowRight, Package, MessageCircle, Menu } from 'lucide-react-native';
import { useAuthStore } from '../../../src/store/authStore';
import { router, useNavigation } from 'expo-router';
import { DrawerActions } from '@react-navigation/native';
import { requestsApi } from '../../../src/api/requests';
import { ordersApi } from '../../../src/api/orders';
import { paymentsApi } from '../../../src/api/payments';
import { productsApi } from '../../../src/api/products';
import { usersApi } from '../../../src/api/users';
import { ensureArray } from '../../../src/utils/arrays';
import { Card, CardContent, MetricCard } from '../../../src/components/ui/Card';
import { Button } from '../../../src/components/ui/Button';
import { StatusBadge } from '../../../src/components/ui/StatusBadge';
import { notificationsApi } from '../../../src/api/notifications';
import { chatApi } from '../../../src/api/chat';
import { useQuery } from '@tanstack/react-query';
import { Avatar } from '../../../src/components/ui/Avatar';
import * as ExpoNotifications from 'expo-notifications';
import * as Device from 'expo-device';
import Constants from 'expo-constants';
import { ScrollView } from 'react-native-gesture-handler';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

ExpoNotifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  } as any),
});

async function registerForPushNotificationsAsync() {
  if (!Device.isDevice) {
    console.log('Must use physical device for Push Notifications');
    return 'ExponentPushToken[mock-simulator-token]';
  }
  if (Constants.appOwnership === 'expo') {
    console.log('Expo Go does not support remote push notifications.');
    return null;
  }
  const { status: existingStatus } = await ExpoNotifications.getPermissionsAsync();
  let finalStatus = existingStatus;
  if (existingStatus !== 'granted') {
    const { status } = await ExpoNotifications.requestPermissionsAsync();
    finalStatus = status;
  }
  if (finalStatus !== 'granted') {
    return null;
  }
  
  if (Platform.OS === 'android') {
    ExpoNotifications.setNotificationChannelAsync('default', {
      name: 'default',
      importance: ExpoNotifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#FF231F7C',
    });
  }
  
  try {
    const projectId = Constants.expoConfig?.extra?.eas?.projectId;
    if (!projectId) {
      console.log('No EAS projectId found. Using mock token for development.');
      return 'ExponentPushToken[mock-dev-token]';
    }
    const token = (await ExpoNotifications.getExpoPushTokenAsync({ projectId })).data;
    return token;
  } catch (e) {
    console.error('Failed to get push token:', e);
    return 'ExponentPushToken[mock-fallback-token]';
  }
}

export default function HomeScreen() {
  const user = useAuthStore((state) => state.user);
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();

  const [requests, setRequests] = useState<any[]>([]);
  const [orders, setOrders] = useState<any[]>([]);
  const [payments, setPayments] = useState<any[]>([]);
  const [products, setProducts] = useState<any[]>([]);

  const [loadingReqs, setLoadingReqs] = useState(true);
  const [loadingOrders, setLoadingOrders] = useState(true);
  const [loadingProducts, setLoadingProducts] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const { data: unreadCount = 0 } = useQuery({
    queryKey: ['notifications', 'unreadCount'],
    queryFn: () => notificationsApi.getUnreadCount(),
    refetchInterval: 30000 // Refetch every 30 seconds
  });

  const { data: conversations = [] } = useQuery({
    queryKey: ['conversations'],
    queryFn: () => chatApi.list(),
    refetchInterval: 30000
  });
  const hasUnreadChat = Array.isArray(conversations) && conversations.some(c => c.unread_count > 0);

  const loadData = useCallback(async () => {
    try {
      const [reqsRes, ordersRes, paymentsRes, productsRes] = await Promise.all([
        requestsApi.list(),
        ordersApi.list(),
        paymentsApi.list(),
        productsApi.list()
      ]);
      setRequests(ensureArray(reqsRes));
      setOrders(ensureArray(ordersRes));
      setPayments(ensureArray(paymentsRes));
      setProducts(ensureArray(productsRes));
    } catch (err) {
      console.error(err);
    } finally {
      setLoadingReqs(false);
      setLoadingOrders(false);
      setLoadingProducts(false);
    }
  }, []);

  useEffect(() => {
    registerForPushNotificationsAsync().then(token => {
      if (token) {
        usersApi.registerPushDevice(token, Platform.OS).catch(console.error);
      }
    });

    loadData();
  }, [loadData]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadData();
    setRefreshing(false);
  }, [loadData]);

  const activeRequest = requests.find(r => r.status !== 'completed' && r.status !== 'cancelled');
  const activeRequestsCount = requests.filter(r => r.status !== 'completed' && r.status !== 'cancelled').length;
  const pastRequestsCount = requests.filter(r => r.status === 'completed' || r.status === 'cancelled').length;
  const pendingQuotesCount = requests.filter(r => r.status === 'pending_quote_approval').length;
  const unpaidInvoicesCount = payments.filter(p => p.status === 'pending').length;
  const loyaltyPoints = 1250;
  
  const recentOrder = orders?.[0];
  const recommendedProducts = products.slice(0, 3);

  return (
    <View className="flex-1 bg-gray-50">
      <AppScrollView 
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#081f3d" />
        }
        className="flex-1" 
        showsVerticalScrollIndicator={false}
      >
        {/* Premium Hero Section */}
        <View 
          className="bg-ess-purple px-7 pb-10 rounded-b-[40px] shadow-lg shadow-ess-purple/20 relative overflow-hidden"
          style={{ paddingTop: Math.max(insets.top + 20, 80) }}
        >
          {/* Subtle background glow effect */}
          <View className="absolute -top-20 -right-20 w-64 h-64 bg-ess-darkPurple rounded-full opacity-50 blur-3xl" />
          
          <View className="flex-row justify-between items-center mb-8 relative z-10">
            <View className="flex-row items-center">
              <Pressable 
                onPress={() => navigation.dispatch(DrawerActions.openDrawer())}
                className="bg-white/10 p-2.5 rounded-full border border-white/10 backdrop-blur-md mr-3"
              >
                <Menu size={24} color="white" />
              </Pressable>
              <Avatar 
                src={(user as any)?.profile_image}
                fallback={user?.first_name || 'C'} 
                size="md" 
                className="mr-3 border-2 border-white/20"
              />
              <View>
                <Text className="text-indigo-100 text-[13px] font-semibold tracking-wider uppercase">Welcome back,</Text>
                <Text className="text-white text-2xl font-bold mt-0.5 tracking-tight">
                  {user?.first_name || 'Customer'} {user?.last_name || ''}
                </Text>
              </View>
            </View>
            <Pressable 
              onPress={() => router.push('/(screens)/notifications/')}
              className="bg-white/10 p-3 rounded-full border border-white/10 backdrop-blur-md relative"
            >
              <Bell size={22} color="white" />
              {unreadCount > 0 && (
                <View className="absolute top-2 right-2.5 w-2.5 h-2.5 bg-red-500 rounded-full border-2 border-ess-darkPurple" />
              )}
            </Pressable>
          </View>

          <View className="bg-white/10 p-5 rounded-[24px] flex-row items-center border border-white/20 backdrop-blur-md relative z-10">
            <View className="bg-ess-green/20 p-3 rounded-[16px]">
              <ShieldCheck size={28} color="#25d366" />
            </View>
            <View className="ml-4 flex-1">
              <Text className="text-white text-lg font-bold tracking-tight">System Secured</Text>
              <Text className="text-indigo-100/80 text-sm mt-0.5 font-medium">All cameras and sensors active</Text>
            </View>
          </View>
        </View>

        <View className="p-7">
          {/* Metric Cards */}
          <Text className="text-gray-900 text-[18px] font-bold mb-5 tracking-tight">Overview</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} className="mb-10 -mx-7 px-7" contentContainerStyle={{ gap: 16 }}>
            <Pressable onPress={() => router.push('/(drawer)/(tabs)/requests')}>
              <MetricCard 
                className="w-40"
                title="Active Requests" 
                value={activeRequestsCount} 
                icon={<Clock size={24} color="#0f4c81" />} 
              />
            </Pressable>

            <Pressable onPress={() => router.push('/(drawer)/(tabs)/requests')}>
              <MetricCard 
                className="w-40"
                title="Past Requests" 
                value={pastRequestsCount} 
                icon={<CheckCircle2 size={24} color="#25d366" />} 
              />
            </Pressable>

            <Pressable onPress={() => router.push('/(screens)/quotes')}>
              <MetricCard 
                className="w-40"
                title="Pending Quotes" 
                value={pendingQuotesCount} 
                icon={<FileText size={24} color="#f7941d" />} 
              />
            </Pressable>

            <Pressable onPress={() => router.push('/(screens)/payments')}>
              <MetricCard 
                className="w-40"
                title="Unpaid Invoices" 
                value={unpaidInvoicesCount} 
                icon={<CreditCard size={24} color="#ef4444" />} 
              />
            </Pressable>
          </ScrollView>

          {/* Active Request / Quick Action */}
          <Text className="text-gray-900 text-[18px] font-bold mb-5 tracking-tight">Continue where you left off</Text>
          <Card className="mb-10 border-0">
            {loadingReqs ? (
              <CardContent className="items-center py-8">
                <ActivityIndicator color="#081f3d" size="small" />
              </CardContent>
            ) : activeRequest ? (
              <CardContent>
                <View className="flex-row justify-between items-start mb-4">
                  <StatusBadge status={activeRequest.status} />
                  <Button 
                    variant="outline" 
                    size="sm" 
                    onPress={() => router.push(`/(screens)/request/${activeRequest.id}`)}
                  >
                    View
                  </Button>
                </View>
                <Text className="text-gray-900 font-bold text-xl mb-1 tracking-tight">{activeRequest.title || 'Service Request'}</Text>
                <Text className="text-gray-500 font-medium leading-relaxed">We are reviewing your request details and will assign a technician shortly.</Text>
              </CardContent>
            ) : (
              <CardContent className="items-center py-6">
                <View className="bg-ess-softBlue p-4 rounded-[20px] mb-4">
                  <ShieldCheck size={32} color="#081f3d" />
                </View>
                <Text className="text-gray-900 font-bold text-lg mb-1 tracking-tight">Need an installation?</Text>
                <Text className="text-gray-500 text-center font-medium mb-6 leading-relaxed">Start a new service request and get a quote within 24 hours.</Text>
                <Button 
                  variant="primary" 
                  className="w-full"
                  rightIcon={<ArrowRight size={18} color="white" />}
                  onPress={() => router.push('/(screens)/requests')}
                >
                  Create Request
                </Button>
              </CardContent>
            )}
          </Card>

          {/* Recent Orders */}
          <Text className="text-gray-900 text-[18px] font-bold mb-5 tracking-tight">Your Installations</Text>
          <View className="mb-10">
            {loadingOrders ? (
              <ActivityIndicator color="#081f3d" size="small" />
            ) : recentOrder ? (
              <Pressable onPress={() => router.push(`/(screens)/orders/${recentOrder.id}`)}>
                <Card className="border-0">
                  <CardContent className="flex-row justify-between items-center">
                    <View>
                      <Text className="text-gray-500 font-bold text-[13px] uppercase tracking-wider mb-1">Order #{recentOrder.id?.split('-')[0]}</Text>
                      <Text className="text-ess-purple font-bold text-2xl tracking-tight">${recentOrder.total_amount || '0.00'}</Text>
                    </View>
                    <View className="items-end">
                      <StatusBadge status={recentOrder.status} className="mb-3" />
                      <Text className="text-ess-darkPurple font-bold">View Details</Text>
                    </View>
                  </CardContent>
                </Card>
              </Pressable>
            ) : (
              <Card className="border-0 bg-transparent shadow-none border-2 border-dashed border-gray-200">
                <CardContent className="items-center py-6">
                  <Text className="text-gray-400 font-medium">You have no recent orders.</Text>
                </CardContent>
              </Card>
            )}
          </View>

          {/* Recommended Products */}
          <Text className="text-gray-900 text-[18px] font-bold mb-5 tracking-tight">Recommended for You</Text>
          <View className="space-y-4 mb-24">
            {loadingProducts ? (
              <ActivityIndicator color="#081f3d" size="small" />
            ) : recommendedProducts.length > 0 ? (
              recommendedProducts.map(product => (
                <Pressable key={product.id} onPress={() => router.push(`/(screens)/product/${product.id}`)} className="mb-3">
                  <Card className="border-0">
                    <CardContent className="flex-row items-center p-4">
                      <View className="h-16 w-16 bg-ess-softBlue rounded-[16px] overflow-hidden items-center justify-center mr-4">
                        {product.images && product.images.length > 0 ? (
                          <Image source={{ uri: product.images[0].image }} style={{ width: '100%', height: '100%' }} />
                        ) : (
                          <Package size={24} color="#0f4c81" />
                        )}
                      </View>
                      <View className="flex-1">
                        <Text className="text-gray-900 font-bold text-[16px] tracking-tight truncate" numberOfLines={1}>{product.name}</Text>
                        <Text className="text-ess-purple font-bold mt-1">${product.price}</Text>
                      </View>
                      <ChevronRight size={20} color="#9ca3af" />
                    </CardContent>
                  </Card>
                </Pressable>
              ))
            ) : (
              <Text className="text-gray-500 font-medium">No recommendations right now.</Text>
            )}
          </View>
        </View>
      </AppScrollView>

      {/* Premium Floating Chat Button */}
      <Pressable 
        onPress={() => router.push('/(screens)/chat')}
        className="absolute bottom-28 right-6 bg-ess-purple w-16 h-16 rounded-[24px] items-center justify-center shadow-lg shadow-ess-purple/40 z-50"
      >
        <MessageCircle size={28} color="white" />
        {hasUnreadChat && (
          <View className="absolute top-1 right-1 w-3.5 h-3.5 bg-red-500 rounded-full border-2 border-ess-purple items-center justify-center" />
        )}
      </Pressable>
    </View>
  );
}
