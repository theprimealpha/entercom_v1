import React, { useState } from 'react';
import { View, Text, ScrollView, Pressable, Switch, RefreshControl } from 'react-native';
import { User, Shield, Settings, Wrench, LogOut, ChevronRight, Bell, CreditCard, FileText } from 'lucide-react-native';
import { useAuthStore } from '../../../src/store/authStore';
import { usersApi } from '../../../src/api/users';
import { router } from 'expo-router';
import { Avatar } from '../../../src/components/ui/Avatar';
import { Card } from '../../../src/components/ui/Card';
import { Button } from '../../../src/components/ui/Button';
import { notificationsApi } from '../../../src/api/notifications';
import { useQuery } from '@tanstack/react-query';

export default function ProfileScreen() {
  const { user, logout, setUser } = useAuthStore();
  const [refreshing, setRefreshing] = useState(false);

  const { data: unreadCount = 0 } = useQuery({
    queryKey: ['notifications', 'unreadCount'],
    queryFn: () => notificationsApi.getUnreadCount(),
    refetchInterval: 30000
  });

  const handleLogout = () => {
    logout();
    router.replace('/(auth)/login');
  };

  const onRefresh = async () => {
    setRefreshing(true);
    try {
      const data = await usersApi.getProfile();
      setUser({ ...user, ...data } as any);
    } catch (error) {
      console.error(error);
    } finally {
      setRefreshing(false);
    }
  };

  return (
    <ScrollView 
      className="flex-1 bg-gray-50" 
      showsVerticalScrollIndicator={false}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#fff" />}
    >
      {/* Premium Header */}
      <View className="bg-ess-purple pt-20 pb-16 px-7 rounded-b-[40px] shadow-lg shadow-ess-purple/20 relative overflow-hidden">
        <View className="absolute -top-20 -left-20 w-64 h-64 bg-ess-darkPurple rounded-full opacity-50 blur-3xl" />
        <View className="absolute bottom-0 right-0 w-40 h-40 bg-ess-softBlue rounded-full opacity-10 blur-2xl" />
        
        <Text className="text-3xl font-bold text-white tracking-tight relative z-10 mb-8">Profile</Text>
        
        <View className="flex-row items-center relative z-10">
          <Avatar 
            src={(user as any)?.profile_image}
            fallback={user?.first_name || 'US'} 
            size="xl" 
            className="border-4 border-white/20"
          />
          <View className="ml-5 flex-1">
            <Text className="text-2xl font-bold text-white tracking-tight mb-1">
              {user?.first_name || 'John'} {user?.last_name || 'Doe'}
            </Text>
            <Text className="text-indigo-100/90 font-medium tracking-wide">
              {user?.email || 'user@example.com'}
            </Text>
            
            <View className="bg-white/20 self-start px-3 py-1 rounded-full mt-3 backdrop-blur-md border border-white/10">
              <Text className="text-white text-[11px] font-bold uppercase tracking-widest">Premium Member</Text>
            </View>
          </View>
        </View>
      </View>

      <View className="p-10 -mt-8">
        {/* Account Group */}
        <Text className="text-gray-500 text-[13px] font-bold uppercase tracking-widest mb-3 ml-2">Account</Text>
        <Card className="mb-8 border-0 shadow-sm shadow-black/5 p-0 overflow-hidden">
          <Pressable onPress={() => router.push('/(screens)/account-settings')} className="p-4 flex-row items-center justify-between border-b border-gray-50">
            <View className="flex-row items-center">
              <View className="bg-ess-softBlue p-2.5 rounded-[12px] mr-4">
                <User size={20} color="#0f4c81" />
              </View>
              <Text className="text-gray-800 text-[16px] font-bold tracking-tight">Account Settings</Text>
            </View>
            <ChevronRight size={20} color="#9ca3af" />
          </Pressable>

          <Pressable onPress={() => router.push('/(drawer)/(tabs)/bookings?type=installation')} className="p-4 flex-row items-center justify-between border-b border-gray-50">
            <View className="flex-row items-center">
              <View className="bg-ess-green/10 p-2.5 rounded-[12px] mr-4">
                <Wrench size={20} color="#25d366" />
              </View>
              <Text className="text-gray-800 text-[16px] font-bold tracking-tight">My Installations</Text>
            </View>
            <ChevronRight size={20} color="#9ca3af" />
          </Pressable>
          
          <Pressable onPress={() => router.push('/(screens)/quotes')} className="p-4 flex-row items-center justify-between border-b border-gray-50">
            <View className="flex-row items-center">
              <View className="bg-ess-softOrange/30 p-2.5 rounded-[12px] mr-4">
                <FileText size={20} color="#f7941d" />
              </View>
              <Text className="text-gray-800 text-[16px] font-bold tracking-tight">My Quotes</Text>
            </View>
            <ChevronRight size={20} color="#9ca3af" />
          </Pressable>
          
          <Pressable onPress={() => router.push('/(screens)/notifications/')} className="p-4 flex-row items-center justify-between border-b border-gray-50">
            <View className="flex-row items-center">
              <View className="bg-gray-100 p-2.5 rounded-[12px] mr-4 relative">
                <Bell size={20} color="#4b5563" />
                {unreadCount > 0 && (
                  <View className="absolute top-2 right-2.5 w-2 h-2 bg-red-500 rounded-full border-2 border-gray-100" />
                )}
              </View>
              <Text className="text-gray-800 text-[16px] font-bold tracking-tight">Notifications</Text>
            </View>
            <View className="flex-row items-center">
              {unreadCount > 0 && (
                <View className="bg-red-500 px-2 py-0.5 rounded-full mr-2">
                  <Text className="text-white text-[10px] font-bold">{unreadCount}</Text>
                </View>
              )}
              <ChevronRight size={20} color="#9ca3af" />
            </View>
          </Pressable>
          
          <Pressable onPress={() => router.push('/(screens)/payments')} className="p-4 flex-row items-center justify-between border-b border-gray-50">
            <View className="flex-row items-center">
              <View className="bg-red-50 p-2.5 rounded-[12px] mr-4">
                <CreditCard size={20} color="#ef4444" />
              </View>
              <Text className="text-gray-800 text-[16px] font-bold tracking-tight">Payment History</Text>
            </View>
            <ChevronRight size={20} color="#9ca3af" />
          </Pressable>
          
          {/* <Pressable className="p-4 flex-row items-center justify-between border-b border-gray-50">
            <View className="flex-row items-center">
              <View className="bg-ess-green/10 p-2.5 rounded-[12px] mr-4">
                <Shield size={20} color="#25d366" />
              </View>
              <Text className="text-gray-800 text-[16px] font-bold tracking-tight">Warranty Status</Text>
            </View>
            <ChevronRight size={20} color="#9ca3af" />
          </Pressable> */}
          
          {/* <View className="p-4 flex-row items-center justify-between">
            <View className="flex-row items-center">
              <View className="bg-gray-100 p-2.5 rounded-[12px] mr-4">
                <Bell size={20} color="#4b5563" />
              </View>
              <Text className="text-gray-800 text-[16px] font-bold tracking-tight">Notifications</Text>
            </View>
            <Switch value={true} trackColor={{ false: '#d1d5db', true: '#081f3d' }} />
          </View> */}
        </Card>

        {/* Support Group */}
        <Text className="text-gray-500 text-[13px] font-bold uppercase tracking-widest mb-3 ml-2">Support & Services</Text>
        <Card className="mb-8 border-0 shadow-sm shadow-black/5 p-0 overflow-hidden">
          <Pressable onPress={() => router.push('/(screens)/technician')} className="p-4 flex-row items-center justify-between border-b border-gray-50">
            <View className="flex-row items-center">
              <View className="bg-ess-softOrange/30 p-2.5 rounded-[12px] mr-4">
                <Wrench size={20} color="#f7941d" />
              </View>
              <Text className="text-gray-800 text-[16px] font-bold tracking-tight">Technician Portal</Text>
            </View>
            <ChevronRight size={20} color="#9ca3af" />
          </Pressable>

          <Pressable onPress={() => router.push('/(screens)/app-settings')} className="p-4 flex-row items-center justify-between">
            <View className="flex-row items-center">
              <View className="bg-gray-100 p-2.5 rounded-[12px] mr-4">
                <Settings size={20} color="#4b5563" />
              </View>
              <Text className="text-gray-800 text-[16px] font-bold tracking-tight">App Settings</Text>
            </View>
            <ChevronRight size={20} color="#9ca3af" />
          </Pressable>
        </Card>

        {/* Logout */}
        <Button 
          variant="outline" 
          onPress={handleLogout}
          className="border-red-200 bg-red-50/50 mb-8 py-4"
        >
          <View className="flex-row items-center ">
            <LogOut size={25} color="#ef4444" />
            <Text className="text-red-500 text-[16px] font-bold ml-2 tracking-wide mb-0">LOG OUT</Text>
          </View>
        </Button>
        
        <Text className="text-center text-gray-400 text-xs font-bold tracking-widest uppercase pb-10">Entercom Version 2.0.0</Text>
      </View>
    </ScrollView>
  );
}
